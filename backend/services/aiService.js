/**
 * Lightweight LLM integration (optional).
 *
 * Enterprise constraint: AI may assist with extraction/summarization,
 * but MUST NOT perform the final write-call to the core system (RPS).
 * That boundary is enforced in the Checker routes only.
 *
 * This service is designed to be safe-by-default:
 * - If no API key is configured, it returns deterministic outputs.
 * - If the provider call fails, it falls back deterministically.
 *
 * Env:
 * - OPENAI_API_KEY: optional
 * - OPENAI_MODEL: optional (default: gpt-4o-mini)
 */
const https = require("https");
const crypto = require("crypto");
const { URL } = require("url");
const summaryFallback = require("../agents/summaryAgent");

function nowMs() {
  return Date.now();
}

function stableIdFromObject(obj) {
  const json = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash("sha256").update(json).digest("hex").slice(0, 24);
}

function callOpenAIChat({ apiKey, model, messages, temperature = 0.2, timeoutMs = 12000 }) {
  return new Promise((resolve, reject) => {
    const url = new URL("https://api.openai.com/v1/chat/completions");
    const payload = JSON.stringify({
      model,
      temperature,
      messages,
      response_format: { type: "json_object" },
    });
    const req = https.request(
      {
        method: "POST",
        hostname: url.hostname,
        path: url.pathname,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`OpenAI error ${res.statusCode}: ${data.slice(0, 200)}`));
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed?.choices?.[0]?.message?.content;
            if (!content) throw new Error("OpenAI: empty content");
            resolve(content);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("OpenAI request timed out")));
    req.write(payload);
    req.end();
  });
}

/**
 * Generate a professional verification summary + recommended action.
 *
 * Output:
 * {
 *   summary: string,
 *   recommended_action: "APPROVE"|"REVIEW"|"REJECT",
 *   reasons?: string[]
 * }
 */
async function generateSummaryLLM(input) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  // Deterministic fallback if no key configured.
  if (!apiKey) {
    const summary = await summaryFallback.run(input);
    return { summary, recommended_action: input?.scores?.recommended_action || "REVIEW", reasons: input?.scores?.explanation || [] };
  }

  const stableRequestId = stableIdFromObject({
    customer_id: input.customer_id,
    requested_old_name: input.requested_old_name,
    requested_new_name: input.requested_new_name,
    extracted_old_name: input?.scores?.extracted_old_name,
    extracted_new_name: input?.scores?.extracted_new_name,
    score_old_name: input?.scores?.score_old_name,
    score_new_name: input?.scores?.score_new_name,
    overall_confidence: input?.scores?.overall_confidence,
    flags: input?.scores?.flags,
    forgery_status: input?.scores?.forgery_status,
  });

  const system = [
    "You are a banking operations verification assistant.",
    "You produce concise, professional summaries for a human Checker.",
    "You MUST return JSON only with keys: summary, recommended_action, reasons.",
    "recommended_action must be one of: APPROVE, REVIEW, REJECT.",
    "If any mismatch is severe or forgery is flagged, recommend REJECT.",
    "Do not invent facts not present in the input.",
  ].join(" ");

  const user = [
    "Given extracted fields, confidence scores, and flags, generate a professional banking verification summary and recommend APPROVE or REJECT.",
    "If not enough evidence, recommend REVIEW.",
    "",
    `RequestId: ${stableRequestId}`,
    `CustomerId: ${input.customer_id}`,
    `RequestedOldName: ${input.requested_old_name}`,
    `RequestedNewName: ${input.requested_new_name}`,
    `ExtractedOldName: ${input?.scores?.extracted_old_name || ""}`,
    `ExtractedNewName: ${input?.scores?.extracted_new_name || ""}`,
    `NameMatchOldPct: ${input?.scores?.score_old_name ?? ""}`,
    `NameMatchNewPct: ${input?.scores?.score_new_name ?? ""}`,
    `DocumentAuthPct: ${input?.scores?.score_authenticity ?? ""}`,
    `OverallConfidencePct: ${input?.scores?.overall_confidence ?? ""}`,
    `ForgeryStatus: ${input?.scores?.forgery_status ?? ""}`,
    `Flags: ${Array.isArray(input?.scores?.flags) ? input.scores.flags.join(", ") : ""}`,
    `Explanation: ${Array.isArray(input?.scores?.explanation) ? input.scores.explanation.join(" | ") : ""}`,
  ].join("\n");

  try {
    const content = await callOpenAIChat({
      apiKey,
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const parsed = JSON.parse(content);
    const summary = String(parsed.summary || "").trim();
    const recommended_action = String(parsed.recommended_action || "").trim().toUpperCase();
    const reasons = Array.isArray(parsed.reasons) ? parsed.reasons.map((r) => String(r)) : [];

    const okAction = recommended_action === "APPROVE" || recommended_action === "REVIEW" || recommended_action === "REJECT";
    if (!summary || !okAction) throw new Error("LLM returned invalid JSON shape");
    return { summary, recommended_action, reasons };
  } catch (e) {
    // Deterministic fallback on any error.
    const summary = await summaryFallback.run(input);
    return { summary, recommended_action: input?.scores?.recommended_action || "REVIEW", reasons: input?.scores?.explanation || [] };
  }
}

/**
 * Mock FileNet archival (document management stand-in).
 * Returns a stable reference ID to display in Checker UI and store in DB.
 */
function archiveToFileNetMock({ customer_id, request_id, original_name, abs_path }) {
  const ref = stableIdFromObject({ customer_id, request_id, original_name, abs_path, v: 1 });
  return `FN-${ref}`;
}

module.exports = {
  nowMs,
  generateSummaryLLM,
  archiveToFileNetMock,
};

