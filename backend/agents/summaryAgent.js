/**
 * Checker-facing summary from structured facts only (no LLM — avoids hallucination).
 */
async function run({
  customer_id,
  requested_old_name,
  requested_new_name,
  scores,
  ocr,
}) {
  const ocrPct = Math.round((ocr.ocr_engine_confidence || 0) * 100);
  return [
    `Customer ${customer_id}: marriage certificate processed.`,
    `Old name: requested "${requested_old_name}" vs document bride field "${scores.extracted_old_name}" — ${scores.score_old_name}% match.`,
    `New name: requested "${requested_new_name}" vs document married/spouse name "${scores.extracted_new_name}" — ${scores.score_new_name}% match.`,
    `Document authenticity (prototype heuristic): ${scores.score_authenticity}%. OCR engine confidence: ${ocrPct}%.`,
    scores.flags && scores.flags.length
      ? `Flags: ${scores.flags.join(", ")}.`
      : "No automated flags.",
  ].join(" ");
}

module.exports = { run };
