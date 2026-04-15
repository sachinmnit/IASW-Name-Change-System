const express = require("express");
const path = require("path");
const { getPool } = require("../db");
const { writeAudit } = require("../utils/auditLog");
const { runRpsUpdate } = require("../utils/rpsMock");

const router = express.Router();

function ok(res, { message, data, meta }, status = 200) {
  return res.status(status).json({ success: true, message, data, meta: meta || {} });
}

function fail(res, { message, error, meta }, status = 400) {
  return res.status(status).json({ success: false, message, error, meta: meta || {} });
}

/** Human queue: AI finished, awaiting checker */
router.get("/queue", async (_req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(
      `SELECT request_id, customer_id, requested_old_name, requested_new_name,
             score_old_name, score_new_name, score_authenticity, overall_confidence,
             recommended_action, forgery_status, filenet_ref_id,
             ai_summary, status, submitted_at, processing_time_ms
       FROM name_change_requests
       WHERE status = 'AI_VERIFIED_PENDING_HUMAN'
       ORDER BY request_id ASC`
    );
    return ok(res, { message: "Queue fetched", data: r.rows, meta: {} });
  } catch (e) {
    next(e);
  }
});

router.get("/request/:id", async (req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(`SELECT * FROM name_change_requests WHERE request_id = $1`, [req.params.id]);
    if (!r.rows.length) return fail(res, { message: "Not found", error: "NOT_FOUND" }, 404);
    const row = r.rows[0];
    const explanation = row.explanation ? JSON.parse(row.explanation) : [];
    return ok(res, { message: "Request fetched", data: { ...row, explanation }, meta: {} });
  } catch (e) {
    next(e);
  }
});

/** Serve uploaded document for review (prototype — add auth in production). */
router.get("/request/:id/document", async (req, res, next) => {
  try {
    const pool = getPool();
    const r = await pool.query(
      `SELECT document_path, document_original_name, status FROM name_change_requests WHERE request_id = $1`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).end();
    const row = r.rows[0];
    if (row.status !== "AI_VERIFIED_PENDING_HUMAN" && row.status !== "APPROVED" && row.status !== "REJECTED") {
      return fail(res, { message: "Document not available for this status", error: "FORBIDDEN" }, 403);
    }
    if (!row.document_path) return res.status(404).end();
    const abs = path.resolve(row.document_path);
    return res.sendFile(abs, (err) => {
      if (err) next(err);
    });
  } catch (e) {
    next(e);
  }
});

/**
 * Approve: only path that updates mock RPS / core record.
 * Body: { checker_name, checker_comment?, review_notes? }
 */
router.post("/request/:id/approve", async (req, res, next) => {
  const checker_name = String(req.body?.checker_name || "").trim();
  const checker_comment = req.body?.checker_comment != null ? String(req.body.checker_comment) : null;
  const review_notes = req.body?.review_notes != null ? String(req.body.review_notes) : null;
  if (!checker_name) {
    const e = new Error("checker_name is required");
    e.status = 400;
    return next(e);
  }

  const pool = getPool();
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const q = await client.query(
      `SELECT * FROM name_change_requests WHERE request_id = $1 FOR UPDATE`,
      [req.params.id]
    );
    if (!q.rows.length) {
      await client.query("ROLLBACK");
      return fail(res, { message: "Not found", error: "NOT_FOUND" }, 404);
    }
    const row = q.rows[0];
    if (row.status !== "AI_VERIFIED_PENDING_HUMAN") {
      await client.query("ROLLBACK");
      const e = new Error(`Invalid status for approve: ${row.status}`);
      e.status = 409;
      throw e;
    }

    // HITL enforcement: this is the ONLY place the “core system” update is called.
    // The AI pipeline never writes to RPS; it only stages data for Checker review.
    await runRpsUpdate(client, {
      customer_id: row.customer_id,
      new_legal_name: row.requested_new_name,
    });

    await client.query(
      `UPDATE name_change_requests
       SET status = 'APPROVED',
           checker_name = $1,
           checker_comment = $2,
           review_notes = $3,
           checked_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE request_id = $4`,
      [checker_name, checker_comment, review_notes, row.request_id]
    );

    await writeAudit(client, {
      request_id: row.request_id,
      action: "HUMAN_APPROVED",
      performed_by: checker_name,
      details: { checker_comment, review_notes, rps_mock: "customers.full_name updated" },
    });

    await client.query("COMMIT");
    return ok(res, { message: "Approved", data: { request_id: row.request_id, status: "APPROVED" }, meta: {} });
  } catch (e) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {}
    }
    return next(e);
  } finally {
    if (client) client.release();
  }
});

/**
 * Reject: no RPS update.
 * Body: { checker_name, checker_comment?, review_notes?, rejection_reason? }
 */
router.post("/request/:id/reject", async (req, res, next) => {
  const checker_name = String(req.body?.checker_name || "").trim();
  const checker_comment = req.body?.checker_comment != null ? String(req.body.checker_comment) : null;
  const review_notes = req.body?.review_notes != null ? String(req.body.review_notes) : null;
  const rejection_reason =
    req.body?.rejection_reason != null ? String(req.body.rejection_reason).trim().toUpperCase() : null;
  if (!checker_name) {
    const e = new Error("checker_name is required");
    e.status = 400;
    return next(e);
  }

  const pool = getPool();
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const q = await client.query(
      `SELECT * FROM name_change_requests WHERE request_id = $1 FOR UPDATE`,
      [req.params.id]
    );
    if (!q.rows.length) {
      await client.query("ROLLBACK");
      return fail(res, { message: "Not found", error: "NOT_FOUND" }, 404);
    }
    const row = q.rows[0];
    if (row.status !== "AI_VERIFIED_PENDING_HUMAN") {
      await client.query("ROLLBACK");
      const e = new Error(`Invalid status for reject: ${row.status}`);
      e.status = 409;
      throw e;
    }

    await client.query(
      `UPDATE name_change_requests
       SET status = 'REJECTED',
           checker_name = $1,
           checker_comment = $2,
           review_notes = $3,
           rejection_reason = $4,
           checked_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE request_id = $5`,
      [checker_name, checker_comment, review_notes, rejection_reason, row.request_id]
    );

    await writeAudit(client, {
      request_id: row.request_id,
      action: "HUMAN_REJECTED",
      performed_by: checker_name,
      details: { checker_comment, review_notes, rejection_reason },
    });

    await client.query("COMMIT");
    return ok(res, { message: "Rejected", data: { request_id: row.request_id, status: "REJECTED", rejection_reason }, meta: {} });
  } catch (e) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {}
    }
    return next(e);
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
