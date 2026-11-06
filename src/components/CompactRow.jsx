// src/components/CompactRow.jsx
// Ligne de la liste clients : un clic la déplie (un seul dépliement à la fois), un second la replie.
import React from "react";
import { normalizePhase, PHASE_LABELS } from "../lib/relance";
import { closedBadgeLabel, closedDate, closureReasonLabel } from "../lib/clientStatus";
import { Badge, Icon, cx, focusRing } from "./ui";

const PHASE_TONES = { pre_mandat: "neutral", mandat: "primary", sous_promesse: "warning", vendu: "success" };

export function DelayBadge({ diffDays, delayLabel }) {
  if (diffDays === null || diffDays === undefined || !delayLabel) return null;
  return <Badge tone={diffDays < 0 ? "danger" : diffDays === 0 ? "accent" : "info"}>{delayLabel}</Badge>;
}

export default function CompactRow({
  client,
  isAdmin,
  isManager,
  expandedClientId,
  setExpandedClientId,
  getCommercialEmail,
  getFollowupInfo,
  getNextDueDate,
  formatDate,
  getLastRelanceDate,
  renderClientDetailCard,
}) {
  const name = [client.first_name, client.last_name].filter(Boolean).join(" ").trim() || "(Sans nom)";
  const { delayLabel, diffDays } = getFollowupInfo(client);
  const lastRel = getLastRelanceDate(client.id);
  const next = getNextDueDate(client);
  const isExpanded = expandedClientId === client.id;
  const isClosed = client.status === "closed";
  const closedBadge = closedBadgeLabel(client);
  const cat = client.category;
  const phase = normalizePhase(client.deal_stage);

  const details = (() => {
    if (isClosed) {
      const where = cat === "seller" ? client.property_address : cat === "after" ? client.after_address : client.area;
      const when = closedDate(client);
      return [where, `Clos le ${when ? formatDate(when) : "—"}`, closureReasonLabel(client.closure_reason || client.sale_result)];
    }
    const nextPart = `Prochaine : ${next ? formatDate(next) : "—"}`;
    const lastPart = `Dernière relance : ${lastRel ? formatDate(lastRel) : "—"}`;
    if (cat === "seller") {
      return [client.property_address, client.estimation_date ? `Estimation : ${formatDate(client.estimation_date)}` : null, lastPart, nextPart];
    }
    if (cat === "buyer") {
      return [
        client.area ? `Secteur : ${client.area}` : null,
        client.budget_max ? `Budget : ${client.budget_max}` : null,
        client.project_type,
        client.rooms ? `${client.rooms} p.` : null,
        lastPart,
        nextPart,
      ];
    }
    const sale = client.sale_completed_at || client.created_at;
    return [client.after_address, sale ? `Achat : ${formatDate(sale)}` : null, lastPart, nextPart];
  })().filter(Boolean);

  return (
    <div
      className={cx(
        "overflow-hidden rounded-card border shadow-card transition-colors duration-150",
        isClosed ? "border-line bg-subtle/70" : "border-line bg-surface",
        isExpanded && "border-primary-line ring-1 ring-primary-line"
      )}
    >
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setExpandedClientId(isExpanded ? null : client.id)}
        className={cx("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primary-soft/40", focusRing, "focus-visible:-outline-offset-2")}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cx("font-semibold", isClosed ? "text-ink-muted" : "text-ink")}>{name}</span>
            {isClosed ? (
              <Badge tone={closedBadge === "Vendu" ? "success" : "muted"}>{closedBadge}</Badge>
            ) : (
              <>
                {cat === "seller" && <Badge tone={PHASE_TONES[phase]}>{PHASE_LABELS[phase]}</Badge>}
                {cat === "buyer" && client.deal_stage === "sous_promesse" && <Badge tone="warning">Sous promesse</Badge>}
              </>
            )}
            {(isAdmin || isManager) && <span className="truncate text-xs text-ink-muted">{getCommercialEmail(client.owner_id) || "—"}</span>}
          </div>
          <div className="tabular mt-0.5 truncate text-xs text-ink-muted" title={details.join(" · ")}>
            {details.join("  ·  ")}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isClosed && <DelayBadge diffDays={diffDays} delayLabel={delayLabel} />}
          <Icon name="chevronDown" size={18} className={cx("text-ink-muted transition-transform duration-150", isExpanded && "rotate-180")} />
        </div>
      </button>

      {isExpanded && <div className="border-t border-line bg-canvas/60 p-3 sm:p-4">{renderClientDetailCard(client)}</div>}
    </div>
  );
}
