// src/components/DashboardCard.jsx
import React from "react";

export default function DashboardCard({ title, list, getFollowupInfo, onGo }) {
  return (
    <div
      className="dash-card"
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="dash-card-head">
        <div className="dash-title">{title}</div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {list.length === 0 ? (
          <div className="dash-empty" style={{ flex: 1 }}>
            Aucun client à relancer.
          </div>
        ) : (
          <ul className="dash-list" style={{ margin: 0, flex: 1 }}>
            {list.map((c) => {
              const name =
                (c.first_name || "") +
                  (c.first_name && c.last_name ? " " : "") +
                  (c.last_name || "") ||
                "(Sans nom)";
              const info = getFollowupInfo(c);

              return (
                <li key={c.id} className="dash-item">
                  <div className="dash-item-name">{name}</div>
                  <div className="dash-item-sub">{info.delayLabel || "—"}</div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="dash-card-actions" style={{ marginTop: "auto" }}>
          <button type="button" className="btn-outline-small" onClick={onGo}>
            Aller à “à relancer”
          </button>
        </div>
      </div>
    </div>
  );
}