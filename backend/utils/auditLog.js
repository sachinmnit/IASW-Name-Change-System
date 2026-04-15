/**
 * Append-only audit trail for compliance.
 */

async function writeAudit(client, { request_id, action, performed_by, details }) {
  await client.query(
    `INSERT INTO audit_log (request_id, action, performed_by, details)
     VALUES ($1, $2, $3, $4)`,
    [
      request_id,
      action,
      performed_by || null,
      details == null ? null : typeof details === "string" ? details : JSON.stringify(details),
    ]
  );
}

module.exports = { writeAudit };
