const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const multer = require("multer");

const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".bin";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(pdf|png|jpe?g|gif|webp|txt)$/i.test(file.originalname);
    if (!ok) {
      const err = new Error("Only PDF, images, or .txt (synthetic cert) uploads are allowed");
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

module.exports = { upload, uploadDir };
