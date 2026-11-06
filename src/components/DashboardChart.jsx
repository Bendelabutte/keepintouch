// src/components/DashboardChart.jsx
// Honoraires cumulés par mois (Promesses signées / Ventes actées). Calculs : src/lib/charts.js.
import React, { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_MODES, buildChartData, chartSeriesFor, chartYears } from "../lib/charts";

// Palette catégorielle validée (ordre fixe). Un commercial reçoit la première couleur libre quand il est
// coché et la garde : décocher un autre commercial ne repeint pas les courbes restantes.
const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const AGENCY_COLOR = "#374151";
const MAX_SELECTED = SERIES_COLORS.length;

const compactEuro = (v) =>
  v >= 1000 ? `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k€` : `${Math.round(v)} €`;

function ChartTooltip({ active, payload, formatCurrency }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value !== null && p.value !== undefined);
  if (!rows.length) return null;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: "8px 10px",
        fontSize: "0.82rem",
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4, color: "#111827" }}>{payload[0].payload.fullLabel}</div>
      {rows.map((p) => (
        <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 6, color: "#374151" }}>
          <span style={{ width: 10, height: 2, background: p.color, display: "inline-block" }} />
          {p.name} : <strong style={{ color: "#111827" }}>{formatCurrency(p.value)}</strong>
        </div>
      ))}
    </div>
  );
}

export default function DashboardChart({
  transactions,
  isAdmin,
  isManager,
  userId,
  teamIds,
  commercials, // [{ id, label }] : ordre stable (couleurs)
  formatCurrency,
}) {
  const years = useMemo(() => chartYears(transactions), [transactions]);
  const [year, setYear] = useState(() => years[0]);
  const [mode, setMode] = useState("promises");
  const [showAgency, setShowAgency] = useState(true);
  const [picked, setPicked] = useState([]); // [{ id, color }]
  const selectedIds = picked.map((x) => x.id);
  const currentYear = years.includes(year) ? year : years[0];

  const colorOf = useMemo(() => {
    const map = { agency: AGENCY_COLOR, me: SERIES_COLORS[0], team: SERIES_COLORS[0] };
    picked.forEach((x) => {
      map[`u_${x.id}`] = x.color;
    });
    return map;
  }, [picked]);

  const selected = useMemo(
    () => (commercials || []).filter((p) => picked.some((x) => x.id === p.id)),
    [commercials, picked]
  );

  const series = useMemo(
    () => chartSeriesFor({ isAdmin, isManager, userId, teamIds, showAgency, selected }),
    [isAdmin, isManager, userId, teamIds, showAgency, selected]
  );

  const data = useMemo(
    () => buildChartData(transactions, { year: currentYear, mode, series }),
    [transactions, currentYear, mode, series]
  );

  const toggleUser = (id) =>
    setPicked((list) => {
      if (list.some((x) => x.id === id)) return list.filter((x) => x.id !== id);
      const color = SERIES_COLORS.find((c) => !list.some((x) => x.color === c));
      return color ? [...list, { id, color }] : list;
    });

  const base = isAdmin ? "Agence : honoraires HT · commerciaux : part de base nette HT" : "Part de base nette HT";

  return (
    <div className="dash-chart-card">
      <div className="dash-chart-head">
        <div>
          <div className="conversion-card-title">Honoraires cumulés {currentYear}</div>
          <div className="conversion-card-sub">{base}, cumul depuis janvier.</div>
        </div>
        <div className="dash-chart-controls">
          <div className="dash-chart-toggle" role="group" aria-label="Type de courbe">
            {Object.entries(CHART_MODES).map(([key, m]) => (
              <button
                key={key}
                type="button"
                className={"tab-button" + (mode === key ? " tab-button-active" : "")}
                aria-pressed={mode === key}
                onClick={() => setMode(key)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <select value={currentYear} onChange={(e) => setYear(Number(e.target.value))} aria-label="Année">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isAdmin && (
        <div className="dash-chart-users">
          <label className="dash-chart-chip">
            <input type="checkbox" checked={showAgency} onChange={(e) => setShowAgency(e.target.checked)} />
            <span className="dash-chart-swatch" style={{ background: AGENCY_COLOR }} />
            Agence
          </label>
          {(commercials || []).map((p) => {
            const checked = selectedIds.includes(p.id);
            return (
              <label key={p.id} className="dash-chart-chip">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && selectedIds.length >= MAX_SELECTED}
                  onChange={() => toggleUser(p.id)}
                />
                <span className="dash-chart-swatch" style={{ background: colorOf[`u_${p.id}`] || "transparent" }} />
                {p.label}
              </label>
            );
          })}
        </div>
      )}

      <div style={{ width: "100%", height: 300 }}>
        {series.length === 0 ? (
          <p className="conversion-card-sub" style={{ paddingTop: 40, textAlign: "center" }}>
            Cochez « Agence » ou au moins un commercial.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} axisLine={{ stroke: "#e5e7eb" }} interval={0} minTickGap={0} />
              <YAxis tickFormatter={compactEuro} tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} axisLine={false} width={64} />
              <Tooltip content={<ChartTooltip formatCurrency={formatCurrency} />} cursor={{ stroke: "#9ca3af", strokeDasharray: "3 3" }} />
              {series.length >= 2 && <Legend wrapperStyle={{ fontSize: "0.82rem", color: "#374151" }} />}
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={colorOf[s.key] || SERIES_COLORS[0]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
