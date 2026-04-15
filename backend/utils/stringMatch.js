/**
 * Normalize names and fuzzy similarity (0–99%) for OCR vs requested fields.
 */

function normalize(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function namesMatch(a, b) {
  return normalize(a) === normalize(b);
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/** Similarity 0–99 (100 reserved for exact policy match if needed). */
function matchScore(requested, extracted) {
  const na = normalize(requested);
  const nb = normalize(extracted);
  if (!na || !nb) return 0;
  if (na === nb) return 99;
  const d = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length) || 1;
  const ratio = 1 - d / maxLen;
  return Math.max(0, Math.min(99, Math.round(ratio * 100)));
}

/** Staff may enter full legal name or a clear prefix (e.g. first name). Typos allowed within similarity threshold. */
const OLD_NAME_MATCH_MIN_PREFIX = 3;
const OLD_NAME_MATCH_MIN_SCORE = 88;

function submittedOldNameMatchesRecord(submittedOldName, recordFullName) {
  if (namesMatch(submittedOldName, recordFullName)) return true;
  const ns = normalize(submittedOldName);
  const nr = normalize(recordFullName);
  if (!ns || !nr) return false;
  if (
    ns.length >= OLD_NAME_MATCH_MIN_PREFIX &&
    nr.startsWith(ns) &&
    (nr.length === ns.length || nr.charAt(ns.length) === " ")
  ) {
    return true;
  }
  return matchScore(submittedOldName, recordFullName) >= OLD_NAME_MATCH_MIN_SCORE;
}

module.exports = {
  normalize,
  namesMatch,
  matchScore,
  levenshtein,
  submittedOldNameMatchesRecord,
};
