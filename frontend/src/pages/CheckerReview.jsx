import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "";

export default function CheckerReview() {
  const [queue, setQueue] = useState([]);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [checkerName, setCheckerName] = useState("");
  const [comment, setComment] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("NAME_MISMATCH");
  const [actionMsg, setActionMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  function badge(label, color) {
    return (
      <span
        style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: 999,
          background: color,
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          marginRight: 8,
          verticalAlign: "middle",
        }}
      >
        {label}
      </span>
    );
  }

  async function refreshQueue() {
    setError(null);
    try {
      const res = await fetch(`${API}/api/checker/queue`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || json?.error || res.statusText);
      const data = json?.data;
      setQueue(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    refreshQueue();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/api/checker/request/${selectedId}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.message || json?.error || res.statusText);
        if (!cancelled) setDetail(json?.data || null);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function approve() {
    if (!selectedId || !checkerName.trim()) {
      setActionMsg("Enter your name as checker before approving.");
      return;
    }
    setLoading(true);
    setActionMsg(null);
    try {
      const res = await fetch(`${API}/api/checker/request/${selectedId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checker_name: checkerName.trim(),
          checker_comment: comment || null,
          review_notes: reviewNotes || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || json?.error || res.statusText);
      const data = json?.data;
      setActionMsg(`Approved request #${data?.request_id}. RPS mock update applied.`);
      setSelectedId(null);
      setDetail(null);
      await refreshQueue();
    } catch (e) {
      setActionMsg(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function reject() {
    if (!selectedId || !checkerName.trim()) {
      setActionMsg("Enter your name as checker before rejecting.");
      return;
    }
    setLoading(true);
    setActionMsg(null);
    try {
      const res = await fetch(`${API}/api/checker/request/${selectedId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checker_name: checkerName.trim(),
          checker_comment: comment || null,
          review_notes: reviewNotes || null,
          rejection_reason: rejectionReason,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || json?.error || res.statusText);
      const data = json?.data;
      setActionMsg(`Rejected request #${data?.request_id}. Reason: ${data?.rejection_reason || rejectionReason}.`);
      setSelectedId(null);
      setDetail(null);
      await refreshQueue();
    } catch (e) {
      setActionMsg(e.message);
    } finally {
      setLoading(false);
    }
  }

  const docUrl =
    selectedId && detail ? `${API}/api/checker/request/${selectedId}/document` : null;

  const overall = detail?.overall_confidence != null ? Number(detail.overall_confidence) : null;
  const rec = String(detail?.recommended_action || "REVIEW").toUpperCase();
  const forgery = String(detail?.forgery_status || "PASS").toUpperCase();
  const recColor = rec === "APPROVE" ? "#1b7f3a" : rec === "REJECT" ? "#b42318" : "#8a5b00";
  const forgeryColor = forgery === "PASS" ? "#1b7f3a" : forgery === "FAIL" ? "#b42318" : "#8a5b00";

  return (
    <main style={{ maxWidth: 900, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1>Checker review</h1>
      <p style={{ color: "#444", fontSize: 14 }}>
        Pending items have completed AI verification and require human approval before any core system update
        (maker–checker).
      </p>
      {error && <p role="alert">{error}</p>}
      {actionMsg && <p role="status">{actionMsg}</p>}

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <section style={{ minWidth: 260, flex: "0 1 280px" }}>
          <h2 style={{ fontSize: 16 }}>Queue</h2>
          <button type="button" onClick={refreshQueue} style={{ marginBottom: 8 }}>
            Refresh
          </button>
          <ul style={{ paddingLeft: 18 }}>
            {queue.map((row) => (
              <li key={row.request_id} style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => setSelectedId(row.request_id)}
                  style={{ fontWeight: selectedId === row.request_id ? "bold" : "normal" }}
                >
                  #{row.request_id} — {row.customer_id}
                </button>
              </li>
            ))}
          </ul>
          {queue.length === 0 && !error && <p>No pending items.</p>}
        </section>

        {detail && (
          <section style={{ flex: "1 1 400px" }}>
            <h2 style={{ fontSize: 16 }}>Request #{detail.request_id}</h2>
            <div style={{ margin: "8px 0 12px" }}>
              {badge(`Recommended: ${rec}`, recColor)}
              {badge(`Forgery: ${forgery}`, forgeryColor)}
              {detail?.filenet_ref_id ? (
                <span style={{ fontSize: 12, color: "#333" }}>FileNet ref: {detail.filenet_ref_id}</span>
              ) : null}
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#444", marginBottom: 6 }}>
                Overall confidence: {overall != null ? `${overall}%` : "—"}{" "}
                {detail?.processing_time_ms != null ? `• Processing: ${detail.processing_time_ms}ms` : ""}
              </div>
              <div style={{ height: 10, background: "#eee", borderRadius: 8, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.max(0, Math.min(100, overall ?? 0))}%`,
                    height: "100%",
                    background: recColor,
                  }}
                />
              </div>
            </div>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
              <tbody>
                {[
                  ["Customer", detail.customer_id],
                  ["Old name (requested)", detail.requested_old_name],
                  ["New name (requested)", detail.requested_new_name],
                  ["Extracted (document)", `${detail.extracted_old_name} → ${detail.extracted_new_name}`],
                  ["Score old name", `${detail.score_old_name}%`],
                  ["Score new name", `${detail.score_new_name}%`],
                  ["Authenticity (heuristic)", `${detail.score_authenticity}%`],
                  ["Status", detail.status],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ borderBottom: "1px solid #eee", padding: "4px 8px 4px 0", fontWeight: 600 }}>{k}</td>
                    <td style={{ borderBottom: "1px solid #eee", padding: "4px 0" }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {Array.isArray(detail.explanation) && detail.explanation.length > 0 && (
              <>
                <h3 style={{ fontSize: 15, marginTop: 16 }}>Confidence explanation</h3>
                <ul style={{ marginTop: 6, color: "#222", paddingLeft: 18 }}>
                  {detail.explanation.map((x, idx) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <li key={idx} style={{ marginBottom: 4, fontSize: 14 }}>
                      {x}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <h3 style={{ fontSize: 15, marginTop: 16 }}>AI summary</h3>
            <p style={{ lineHeight: 1.5 }}>{detail.ai_summary}</p>

            {docUrl && (
              <>
                <h3 style={{ fontSize: 15, marginTop: 16 }}>Document</h3>
                <p style={{ fontSize: 13 }}>Preview (images / PDF may not preview in all browsers):</p>
                <img
                  src={docUrl}
                  alt="Uploaded document"
                  style={{ maxWidth: "100%", border: "1px solid #ccc", marginTop: 8 }}
                  onError={(e) => {
                    e.target.style.display = "none";
                  }}
                />
                <p style={{ fontSize: 13 }}>
                  <a href={docUrl} target="_blank" rel="noreferrer">
                    Open document
                  </a>
                </p>
              </>
            )}

            <label style={{ display: "block", marginTop: 16 }}>
              Checker name
              <input
                style={{ display: "block", width: "100%", marginTop: 4 }}
                value={checkerName}
                onChange={(e) => setCheckerName(e.target.value)}
                placeholder="Your name"
              />
            </label>
            <label style={{ display: "block", marginTop: 12 }}>
              Comment (optional)
              <textarea
                style={{ display: "block", width: "100%", marginTop: 4 }}
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
            <label style={{ display: "block", marginTop: 12 }}>
              Review notes (optional)
              <textarea
                style={{ display: "block", width: "100%", marginTop: 4 }}
                rows={2}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder='e.g. "Verified manually; looks authentic."'
              />
            </label>
            <label style={{ display: "block", marginTop: 12 }}>
              Rejection reason (required if rejecting)
              <select
                style={{ display: "block", width: "100%", marginTop: 4 }}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              >
                <option value="NAME_MISMATCH">NAME_MISMATCH</option>
                <option value="LOW_CONFIDENCE">LOW_CONFIDENCE</option>
                <option value="FORGERY_FLAG">FORGERY_FLAG</option>
              </select>
            </label>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button type="button" onClick={approve} disabled={loading}>
                Approve (apply RPS update)
              </button>
              <button type="button" onClick={reject} disabled={loading}>
                Reject
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
