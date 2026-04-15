/**
 * Name Change System — Express API entrypoint
 */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { initDb } = require("./db");
const nameChangeRoutes = require("./routes/nameChange");
const checkerRoutes = require("./routes/checker");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.use("/api/name-change", nameChangeRoutes);
app.use("/api/checker", checkerRoutes);

app.get("/health", (_req, res) => {
  res.json({ success: true, message: "ok", data: { service: "name-change-system" }, meta: {} });
});

app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Server error";
  res.status(status).json({ success: false, message, error: err.code || "ERROR", meta: {} });
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start:", err);
    process.exit(1);
  });

module.exports = app;
