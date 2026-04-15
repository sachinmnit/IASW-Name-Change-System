import { createRoot } from "react-dom/client";
import { useState } from "react";
import StaffIntake from "./pages/StaffIntake.jsx";
import CheckerReview from "./pages/CheckerReview.jsx";

function Shell() {
  const [tab, setTab] = useState("intake");
  return (
    <>
      <nav style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #ddd", fontFamily: "system-ui" }}>
        <button type="button" onClick={() => setTab("intake")} style={{ marginRight: 8 }}>
          Staff intake
        </button>
        <button type="button" onClick={() => setTab("checker")}>
          Checker review
        </button>
      </nav>
      {tab === "intake" ? <StaffIntake /> : <CheckerReview />}
    </>
  );
}

createRoot(document.getElementById("root")).render(<Shell />);
