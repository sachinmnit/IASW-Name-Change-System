const express = require("express");
const fs = require("fs");
const path = require("path");
const { getPool } = require("../db");
const { upload } = require("../middleware/upload");
const validateAgent = require("../agents/validateAgent");
const ocrAgent = require("../agents/ocrAgent");
const scoringAgent = require("../agents/scoringAgent");
const summaryAgent = require("../agents/summaryAgent");
const { writeAudit } = require("../utils/auditLog");
const { nowMs, generateSummaryLLM, archiveToFileNetMock } = require("../services/aiService");

const router = express.Router();

function ok(res, { message, data, meta }, status = 200) {
  return res.status(status).json({ success: true, message, data, meta: meta || {} });
}

/**
 * Multipart intake: customerId, requestedOldName, requestedNewName, certificate (file)
 */
router.post("/intake", upload.single("certificate"), async (req, res, next) => {
  if (!req.file) {
    const e = new Error("certificate file is required (field name: certificate)");
    e.status = 400;
    return next(e);
  }

  const pool = getPool();
  const customer_id = String(req.body.customerId || req.body.customer_id || "").trim();
  const requested_old_name = String(req.body.requestedOldName || req.body.requested_old_name || "").trim();
  const requested_new_name = String(req.body.requestedNewName || req.body.requested_new_name || "").trim();

  const absDocPath = path.resolve(req.file.path);

  // Async simulation: return quickly, then process AI in background.
  // This makes the “PROCESSING” state visible and mirrors real orchestration.
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const insert = await client.query(
      `INSERT INTO name_change_requests (
        change_type,
        customer_id, requested_old_name, requested_new_name,
        document_path, document_original_name,
        status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING request_id, status, submitted_at`,
      ["LEGAL_NAME", customer_id, requested_old_name, requested_new_name, absDocPath, req.file.originalname, "INITIATED"]
    );
    const row = insert.rows[0];
    const request_id = row.request_id;

    await writeAudit(client, {
      request_id,
      action: "INITIATED",
      performed_by: "system",
      details: { status: "INITIATED" },
    });

    // Create a mock “FileNet reference” for the uploaded doc.
    const filenet_ref_id = archiveToFileNetMock({
      customer_id,
      request_id,
      original_name: req.file.originalname,
      abs_path: absDocPath,
    });
    await client.query(`UPDATE name_change_requests SET filenet_ref_id = $1, updated_at = CURRENT_TIMESTAMP WHERE request_id = $2`, [
      filenet_ref_id,
      request_id,
    ]);

    await client.query("COMMIT");

    // Background job (in-process) — minimal but effective for prototype demos.
    setTimeout(async () => {
      const t0 = nowMs();
      let bgClient;
      try {
        bgClient = await pool.connect();
        await bgClient.query("BEGIN");
        await bgClient.query(
          `UPDATE name_change_requests SET status = 'PROCESSING', updated_at = CURRENT_TIMESTAMP WHERE request_id = $1`,
          [request_id]
        );
        await writeAudit(bgClient, {
          request_id,
          action: "PROCESSING",
          performed_by: "system",
          details: { status: "PROCESSING" },
        });

        const validated = await validateAgent.run(bgClient, {
          customer_id,
          requested_old_name,
          requested_new_name,
        });
        await writeAudit(bgClient, {
          request_id,
          action: "VALIDATION_OK",
          performed_by: "validateAgent",
          details: { customer_id: validated.customer_id },
        });

        const ocr = await ocrAgent.run({
          path: absDocPath,
          originalName: req.file.originalname,
          hints: { requestedOldName: requested_old_name, requestedNewName: requested_new_name },
        });
        await writeAudit(bgClient, {
          request_id,
          action: "OCR_COMPLETE",
          performed_by: "ocrAgent",
          details: { engine: ocr.engine, ocr_engine_confidence: ocr.ocr_engine_confidence },
        });

        const scores = await scoringAgent.run({
          requested_old_name,
          requested_new_name,
          ocr,
        });
        await writeAudit(bgClient, {
          request_id,
          action: "SCORING_COMPLETE",
          performed_by: "scoringAgent",
          details: {
            score_old_name: scores.score_old_name,
            score_new_name: scores.score_new_name,
            score_authenticity: scores.score_authenticity,
            overall_confidence: scores.overall_confidence,
            recommended_action: scores.recommended_action,
            forgery_status: scores.forgery_status,
            flags: scores.flags,
          },
        });

        // LLM-backed summary with deterministic fallback.
        const llm = await generateSummaryLLM({
          customer_id: validated.customer_id,
          requested_old_name,
          requested_new_name,
          scores,
          ocr,
        });
        const ai_summary = llm.summary || (await summaryAgent.run({ customer_id: validated.customer_id, requested_old_name, requested_new_name, scores, ocr }));

        const processing_time_ms = nowMs() - t0;

        await bgClient.query(
          `UPDATE name_change_requests
           SET extracted_old_name = $1,
               extracted_new_name = $2,
               score_old_name = $3,
               score_new_name = $4,
               score_authenticity = $5,
               overall_confidence = $6,
               explanation = $7,
               recommended_action = $8,
               forgery_status = $9,
               ai_summary = $10,
               processing_time_ms = $11,
               status = 'AI_VERIFIED_PENDING_HUMAN',
               updated_at = CURRENT_TIMESTAMP
           WHERE request_id = $12`,
          [
            scores.extracted_old_name,
            scores.extracted_new_name,
            scores.score_old_name,
            scores.score_new_name,
            scores.score_authenticity,
            scores.overall_confidence,
            JSON.stringify(scores.explanation || []),
            scores.recommended_action,
            scores.forgery_status,
            ai_summary,
            processing_time_ms,
            request_id,
          ]
        );

        await writeAudit(bgClient, {
          request_id,
          action: "STAGED_FOR_HUMAN",
          performed_by: "system",
          details: {
            status: "AI_VERIFIED_PENDING_HUMAN",
            processing_time_ms,
            recommended_action: scores.recommended_action,
          },
        });

        await bgClient.query("COMMIT");
      } catch (err) {
        if (bgClient) {
          try {
            await bgClient.query("ROLLBACK");
          } catch (_) {}
          try {
            await bgClient.query(
              `UPDATE name_change_requests SET status = 'ERROR', updated_at = CURRENT_TIMESTAMP WHERE request_id = $1`,
              [request_id]
            );
            await writeAudit(bgClient, {
              request_id,
              action: "AI_PIPELINE_ERROR",
              performed_by: "system",
              details: { message: err?.message || String(err) },
            });
          } catch (_) {}
        }
      } finally {
        if (bgClient) bgClient.release();
      }
    }, 30);

    return ok(
      res,
      {
        message: "Request accepted and queued for AI processing",
        data: {
          request_id,
          status: "PROCESSING",
          submitted_at: row.submitted_at,
          filenet_ref_id,
        },
        meta: { processing_time_ms: 0 },
      },
      202
    );
  } catch (err) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {}
    }
    try {
      fs.unlinkSync(absDocPath);
    } catch (_) {}
    return next(err);
  } finally {
    if (client) client.release();
  }
});

router.get("/request/:id", async (req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(`SELECT * FROM name_change_requests WHERE request_id = $1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ success: false, message: "Not found" });
    const row = r.rows[0];
    const explanation = row.explanation ? JSON.parse(row.explanation) : [];
    return ok(res, { message: "Request fetched", data: { ...row, explanation }, meta: {} });
  } catch (e) {
    next(e);
  }
});

router.get("/requests", async (_req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(
      `SELECT request_id, customer_id, status, submitted_at, requested_old_name, requested_new_name
       FROM name_change_requests
       ORDER BY request_id DESC
       LIMIT 100`
    );
    return ok(res, { message: "Requests fetched", data: r.rows, meta: {} });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
