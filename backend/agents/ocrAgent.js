/**
 * OCR / document intelligence (prototype).
 * Replace body with AWS Textract, Google Document AI, or Azure Document Intelligence SDK calls.
 * Returns structured fields similar to marriage-certificate processors.
 */
const fs = require("fs").promises;

/**
 * @param {{ path: string, originalName: string, hints: { requestedOldName: string, requestedNewName: string } }} input
 */
async function run(input) {
  const { path: filePath, originalName, hints } = input;
  const buf = await fs.readFile(filePath);
  let text = "";
  try {
    text = buf.toString("utf8");
  } catch (_) {
    text = "";
  }
  const sample = text.slice(0, Math.min(4000, buf.length));
  const looksText = sample.length > 0 && /^[\x09\x0A\x0D\x20-\x7E]+$/.test(sample.slice(0, Math.min(500, sample.length)));

  const requestedOld = String(hints.requestedOldName || "").trim();
  const requestedNew = String(hints.requestedNewName || "").trim();

  let bride_name = requestedOld;
  let spouse_married_name = requestedNew;
  let groom_name = "Raj Patel";

  if (looksText) {
    const brideLine = sample.match(/Bride[:\s]+([^\r\n]+)/i);
    const groomLine = sample.match(/Groom[:\s]+([^\r\n]+)/i);
    const marriedLine = sample.match(/(?:Married name|New legal name)[:\s]+([^\r\n]+)/i);
    if (brideLine) bride_name = brideLine[1].trim();
    if (groomLine) groom_name = groomLine[1].trim();
    if (marriedLine) spouse_married_name = marriedLine[1].trim();
  }

  // Simulate occasional OCR jitter to exercise fuzzy matching (~10%)
  if (Math.random() > 0.9 && spouse_married_name.length > 3) {
    spouse_married_name = spouse_married_name.slice(0, -1);
  }

  const ocr_engine_confidence = Math.min(0.99, 0.85 + Math.random() * 0.12);
  const line_confidence_avg = Math.min(0.97, ocr_engine_confidence - 0.02);

  const rawText =
    looksText && sample.length > 20
      ? sample
      : `[Binary or scan placeholder — ${originalName}; bytes=${buf.length}. Wire Textract/Document AI for production.]`;

  return {
    engine: "mock-document-ai",
    rawText,
    fields: {
      bride_name,
      groom_name,
      spouse_married_name,
      marriage_date: "2024-06-15",
    },
    ocr_engine_confidence,
    line_confidence_avg,
  };
}

module.exports = { run };
