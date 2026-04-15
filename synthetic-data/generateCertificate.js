/**
 * Synthetic certificate text for testing OCR parsing (mock engine reads these lines).
 * Run: node generateCertificate.js [--out ./sample-marriage.txt]
 */
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
let outPath = path.join(__dirname, "sample-marriage.txt");
const outIdx = args.indexOf("--out");
if (outIdx >= 0 && args[outIdx + 1]) outPath = path.resolve(args[outIdx + 1]);

const sample = `CERTIFICATE OF MARRIAGE (SYNTHETIC)
Bride: Priya Sharma
Groom: Raj Patel
Married name: Priya Mehta
Date: 2024-06-15
This file is for local testing only.`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, sample, "utf8");
console.log("Wrote:", outPath);
console.log("Tip: upload this .txt as the certificate on Staff Intake with CUST001 / Priya Sharma / Priya Mehta.");
