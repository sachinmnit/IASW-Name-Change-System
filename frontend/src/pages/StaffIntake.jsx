import { useState } from "react";

/** Same-origin in dev (Vite proxy). Set VITE_API_URL for a remote API. */
const API = import.meta.env.VITE_API_URL ?? "";

export default function StaffIntake() {
  const [customerId, setCustomerId] = useState("");
  const [requestedOldName, setRequestedOldName] = useState("");
  const [requestedNewName, setRequestedNewName] = useState("");
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  async function fetchRequest(id) {
    const res = await fetch(`${API}/api/name-change/request/${id}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || json?.error || res.statusText);
    return json?.data || null;
  }

  async function submit(e) {
    e.preventDefault();
    if (!file) {
      setMessage("Please choose a supporting document (e.g. marriage certificate).");
      return;
    }
    setLoading(true);
    setMessage(null);
    const fd = new FormData();
    fd.append("customerId", customerId.trim());
    fd.append("requestedOldName", requestedOldName.trim());
    fd.append("requestedNewName", requestedNewName.trim());
    fd.append("certificate", file);
    try {
      const res = await fetch(`${API}/api/name-change/intake`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || res.statusText);

      const req = data?.data;
      const requestId = req?.request_id;
      const filenetRef = req?.filenet_ref_id ? ` FileNet ref: ${req.filenet_ref_id}.` : "";
      if (!requestId) throw new Error("Missing request_id from server response");

      setMessage(`Submitted request #${requestId}. Status: ${req?.status || "PROCESSING"}.${filenetRef} Waiting for AI…`);

      // Poll until AI finishes (prototype async simulation).
      for (let i = 0; i < 25; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 600));
        // eslint-disable-next-line no-await-in-loop
        const row = await fetchRequest(requestId);
        if (!row) continue;
        if (row.status === "AI_VERIFIED_PENDING_HUMAN") {
          setMessage(
            `AI complete for request #${requestId}. Recommended: ${row.recommended_action || "REVIEW"}. Overall confidence: ${
              row.overall_confidence ?? ""
            }%. Summary: ${(row.ai_summary || "").slice(0, 220)}${(row.ai_summary || "").length > 220 ? "…" : ""}`
          );
          break;
        }
        if (row.status === "ERROR") {
          setMessage(`AI processing failed for request #${requestId}. Please retry or check server logs.`);
          break;
        }
      }
    } catch (err) {
      setMessage(err.message || "Submit failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1>Staff intake</h1>
      <p style={{ color: "#444", fontSize: 14 }}>
        Enter customer ID and names as on file. Upload a certificate scan. The AI pipeline validates against the core
        customer record, runs OCR, scores matches, then stages the case for human review.
      </p>
      <form onSubmit={submit}>
        <label style={{ display: "block", marginBottom: 12 }}>
          Customer ID
          <input
            style={{ display: "block", width: "100%", marginTop: 4 }}
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            placeholder="e.g. CUST001"
            required
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          Old name (must match customer record)
          <input
            style={{ display: "block", width: "100%", marginTop: 4 }}
            value={requestedOldName}
            onChange={(e) => setRequestedOldName(e.target.value)}
            required
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          New name (requested legal name)
          <input
            style={{ display: "block", width: "100%", marginTop: 4 }}
            value={requestedNewName}
            onChange={(e) => setRequestedNewName(e.target.value)}
            required
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          Supporting document
          <input
            style={{ display: "block", marginTop: 4 }}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            required
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Submitting…" : "Submit for AI processing"}
        </button>
      </form>
      {message && (
        <p role="status" style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>
          {message}
        </p>
      )}
    </main>
  );
}
