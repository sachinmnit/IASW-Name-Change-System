/**
 * Mock “core system” name update. Real RPS integration would go here.
 * Only invoked from the human Approve path — never from AI-only code.
 */

async function runRpsUpdate(client, { customer_id, new_legal_name }) {
  const r = await client.query(
    `UPDATE customers SET full_name = $1 WHERE customer_id = $2 RETURNING customer_id, full_name`,
    [new_legal_name, customer_id]
  );
  if (r.rowCount === 0) {
    const err = new Error("RPS mock: customer not found for update");
    err.status = 500;
    throw err;
  }
  console.log(
    `[RPS MOCK] Updated customer ${customer_id} legal name -> "${new_legal_name}" (customers.full_name)`
  );
  return r.rows[0];
}

module.exports = { runRpsUpdate };
