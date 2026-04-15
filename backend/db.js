/**
 * PostgreSQL pool (Node 16+). Set DATABASE_URL, e.g.
 * postgresql://user:pass@localhost:5432/namechange
 */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

let pool;

function getPool() {
  if (!pool) throw new Error("Database not initialized. Call initDb() first.");
  return pool;
}

async function initDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Example: postgresql://postgres:postgres@localhost:5432/namechange"
    );
  }
  pool = new Pool({ connectionString });

  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    if (process.env.RUN_SCHEMA_ON_START === "true") {
      const schemaPath = path.join(__dirname, "..", "database", "schema.sql");
      if (fs.existsSync(schemaPath)) {
        const sql = fs.readFileSync(schemaPath, "utf8");
        await client.query(sql);
        console.log("Applied database/schema.sql (RUN_SCHEMA_ON_START=true)");
      }
    }
  } finally {
    client.release();
  }
  return pool;
}

module.exports = { initDb, getPool };
