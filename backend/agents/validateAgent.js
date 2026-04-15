/**
 * Validates intake: customer exists; submitted old name matches core record;
 * new name differs from old.
 */
const { namesMatch, submittedOldNameMatchesRecord } = require("../utils/stringMatch");

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {{ customer_id: string, requested_old_name: string, requested_new_name: string }} payload
 */
async function run(db, payload) {
  const customer_id = String(payload.customer_id || "").trim();
  const requested_old_name = String(payload.requested_old_name || "").trim();
  const requested_new_name = String(payload.requested_new_name || "").trim();

  if (!customer_id) {
    const e = new Error("customer_id is required");
    e.status = 400;
    throw e;
  }
  if (!requested_old_name) {
    const e = new Error("requested_old_name is required");
    e.status = 400;
    throw e;
  }
  if (!requested_new_name) {
    const e = new Error("requested_new_name is required");
    e.status = 400;
    throw e;
  }
  if (namesMatch(requested_old_name, requested_new_name)) {
    const e = new Error("requested_new_name must differ from requested_old_name");
    e.status = 400;
    throw e;
  }

  const r = await db.query(`SELECT customer_id, full_name FROM customers WHERE customer_id = $1`, [
    customer_id,
  ]);
  if (r.rows.length === 0) {
    const e = new Error(`Customer ID not found: ${customer_id}`);
    e.status = 400;
    e.code = "CUSTOMER_NOT_FOUND";
    throw e;
  }
  const row = r.rows[0];
  if (!submittedOldNameMatchesRecord(requested_old_name, row.full_name)) {
    const e = new Error(
      `Old name does not match customer record. Record: "${row.full_name}", submitted: "${requested_old_name}"`
    );
    e.status = 400;
    e.code = "OLD_NAME_MISMATCH";
    throw e;
  }

  return {
    customer_id: row.customer_id,
    legal_name_on_record: row.full_name,
    requested_old_name,
    requested_new_name,
  };
}

module.exports = { run };
