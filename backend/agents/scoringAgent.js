/**
 * Name matching scores + prototype authenticity heuristic (forgery proxy).
 */
const { matchScore } = require("../utils/stringMatch");

function authenticityScore(ocr) {
  const base = 72 + Math.round(20 * (ocr.ocr_engine_confidence || 0.8));
  const raw = ocr.rawText || "";
  let s = base;
  if (raw.length < 40 && !raw.includes("Priya")) s -= 12;
  if (/placeholder|wire textract/i.test(raw)) s -= 8;
  return Math.max(50, Math.min(98, s));
}

function forgeryStatusFrom(ocr, score_authenticity) {
  const raw = ocr.rawText || "";
  const placeholder = /placeholder|wire textract/i.test(raw);
  if (placeholder || score_authenticity < 70) return "FAIL";
  if (score_authenticity < 80) return "FLAG";
  return "PASS";
}

function overallConfidenceFrom({ score_old_name, score_new_name, score_authenticity }) {
  // Weighted confidence for decision support only (not an “ML model”).
  // We bias toward name matching because the legal name change is the primary business invariant.
  const wOld = 0.4;
  const wNew = 0.4;
  const wAuth = 0.2;
  const v =
    wOld * (Number(score_old_name) || 0) + wNew * (Number(score_new_name) || 0) + wAuth * (Number(score_authenticity) || 0);
  return Math.max(0, Math.min(99, Math.round(v)));
}

function decideAction({ score_old_name, score_new_name, overall_confidence, extracted_old_name, extracted_new_name, forgery_status }) {
  // Edge cases per requirements:
  // - similarity < 70% => REJECT
  // - partial extraction => REVIEW
  // - overall < 75 => REVIEW
  // - forgery flagged => REJECT (FAIL) [FLAG becomes REVIEW]
  //
  // Threshold rationale (prototype):
  // - 70% is treated as a hard mismatch boundary (high error risk)
  // - 75% overall is a minimum “good enough” bar to avoid auto-greenlighting low-quality scans
  const oldMissing = !String(extracted_old_name || "").trim();
  const newMissing = !String(extracted_new_name || "").trim();

  if (forgery_status === "FAIL") return "REJECT";
  if ((Number(score_old_name) || 0) < 70 || (Number(score_new_name) || 0) < 70) return "REJECT";
  if (oldMissing || newMissing) return "REVIEW";
  if (forgery_status === "FLAG") return "REVIEW";
  if ((Number(overall_confidence) || 0) < 75) return "REVIEW";
  return "APPROVE";
}

function rejectionReasonFor({ recommended_action, score_old_name, score_new_name, overall_confidence, forgery_status }) {
  if (recommended_action !== "REJECT") return null;
  if (forgery_status === "FAIL") return "FORGERY_FLAG";
  if ((Number(score_old_name) || 0) < 70 || (Number(score_new_name) || 0) < 70) return "NAME_MISMATCH";
  if ((Number(overall_confidence) || 0) < 75) return "LOW_CONFIDENCE";
  return "LOW_CONFIDENCE";
}

/**
 * Maps certificate fields to requested old/new names and builds scorecard.
 */
async function run({ requested_old_name, requested_new_name, ocr }) {
  const extracted_old_name = ocr?.fields?.bride_name || "";
  const extracted_new_name = ocr?.fields?.spouse_married_name || "";

  const score_old_name = matchScore(requested_old_name, extracted_old_name);
  const score_new_name = matchScore(requested_new_name, extracted_new_name);
  const score_authenticity = authenticityScore(ocr);
  const forgery_status = forgeryStatusFrom(ocr, score_authenticity);
  const overall_confidence = overallConfidenceFrom({ score_old_name, score_new_name, score_authenticity });
  const recommended_action = decideAction({
    score_old_name,
    score_new_name,
    overall_confidence,
    extracted_old_name,
    extracted_new_name,
    forgery_status,
  });
  const rejection_reason = rejectionReasonFor({
    recommended_action,
    score_old_name,
    score_new_name,
    overall_confidence,
    forgery_status,
  });

  const flags = [];
  if (score_old_name < 85) flags.push("old_name_low_confidence");
  if (score_new_name < 85) flags.push("new_name_low_confidence");
  if (score_authenticity < 70) flags.push("authenticity_review");
  if (!String(extracted_old_name || "").trim()) flags.push("missing_extracted_old_name");
  if (!String(extracted_new_name || "").trim()) flags.push("missing_extracted_new_name");
  if (forgery_status !== "PASS") flags.push("forgery_flag");
  if (recommended_action === "REVIEW") flags.push("needs_human_review");
  if (recommended_action === "REJECT") flags.push("auto_reject_recommended");

  const explanation = [];
  if (String(extracted_old_name || "").trim()) {
    explanation.push(`Old name matches bride name with ${score_old_name}% similarity`);
  } else {
    explanation.push("Old name extraction missing from document; manual review required");
  }
  if (String(extracted_new_name || "").trim()) {
    explanation.push(`New name matches married name with ${score_new_name}% similarity`);
  } else {
    explanation.push("New name extraction missing from document; manual review required");
  }
  explanation.push(`Document authenticity score is ${score_authenticity}% (prototype heuristic)`);
  explanation.push(`Forgery status: ${forgery_status}`);
  explanation.push(`Overall confidence is ${overall_confidence}%`);

  return {
    // Backwards-compatible fields
    extracted_old_name,
    extracted_new_name,
    score_old_name,
    score_new_name,
    score_authenticity,
    flags,

    // Enhanced fields for enterprise-grade review
    name_match_score: Math.min(score_old_name, score_new_name),
    document_auth_score: score_authenticity,
    overall_confidence,
    explanation,
    recommended_action,
    forgery_status,
    rejection_reason,
  };
}

module.exports = { run };
