// src/components/CompactRow.jsx
import React from "react";
import DelayPill from "./DelayPill";

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
  getSellerStageLabel,
}) {
  const name =
    (client.first_name || "") +
      (client.first_name && client.last_name ? " " : "") +
      (client.last_name || "") || "(Sans nom)";

  const commercialEmail = getCommercialEmail(client.owner_id);
  const { delayLabel, diffDays } = getFollowupInfo(client);

  const lastRel = getLastRelanceDate(client.id);
  const lastRelLabel = lastRel ? formatDate(lastRel) : "—";

  const next = getNextDueDate(client);
  const nextLabel = next ? formatDate(next) : "—";

  const isExpanded = expandedClientId === client.id;
  const isSeller = client.category === "seller";
  const sellerStageLabel = isSeller ? getSellerStageLabel(client) : "";
  const sellerStageClass =
    sellerStageLabel === "Sous mandat"
      ? "stage-badge stage-badge-mandat"
      : "stage-badge stage-badge-premandat";

  const isMobile =
    typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;

  const leftLine2 = (() => {
    if (client.category === "seller") {
      const addr = client.property_address ? client.property_address : "—";
      const est = client.estimation_date ? formatDate(client.estimation_date) : "—";
      return `Adresse : ${addr}  •  Estimation : ${est}  •  Dernière relance : ${lastRelLabel}  •  Prochaine : ${nextLabel}`;
    }

    if (client.category === "buyer") {
      const sector = client.area ? client.area : "—";

      if (isMobile) {
        const parts = [
          `Secteur : ${sector}`,
          client.budget_max ? `Budget : ${client.budget_max}` : null,
          client.min_surface ? `Surface min : ${client.min_surface} m²` : null,
          `Prochaine : ${nextLabel}`,
        ].filter(Boolean);

        return parts.join("  •  ");
      }

      const budget = client.budget_max ? `Budget : ${client.budget_max}` : null;
      const surf = client.min_surface ? `Surf min : ${client.min_surface} m²` : null;
      const beds = client.bedrooms ? `Chambres : ${client.bedrooms}` : null;
      const parts = [
        `Secteur : ${sector}`,
        budget,
        surf,
        beds,
        client.acquisition_date ? `Enregistrement : ${formatDate(client.acquisition_date)}` : null,
        `Dernière relance : ${lastRelLabel}`,
        `Prochaine : ${nextLabel}`,
      ].filter(Boolean);

      return parts.join("  •  ");
    }

    const addr = client.after_address ? client.after_address : "—";
    const sale = client.created_at ? formatDate(client.created_at) : "—";

    if (isMobile) {
      return `Adresse : ${addr}  •  Vente : ${sale}  •  Prochaine : ${nextLabel}`;
    }

    return `Adresse : ${addr}  •  Vente : ${sale}  •  Dernière relance : ${lastRelLabel}  •  Prochaine : ${nextLabel}`;
  })();

  return (
    <div className={"compact-row" + (isExpanded ? " compact-row-expanded" : "")}>
      <button
        className="compact-row-click"
        onClick={() => setExpandedClientId(isExpanded ? null : client.id)}
        type="button"
        title={isExpanded ? "Replier" : "Déplier"}
      >
        <div className="compact-row-main">
          <div className="compact-row-line1">
            <span className="compact-name">{name}</span>

            {isSeller && <span className={sellerStageClass}>{sellerStageLabel}</span>}

            {(isAdmin || isManager) && (
              <span className="compact-owner">— {commercialEmail || "—"}</span>
            )}

            {!isAdmin && !isManager && client.email && (
              <span className="compact-owner">— {client.email}</span>
            )}
          </div>

          <div className="compact-row-line2" title={leftLine2}>
            {leftLine2}
          </div>
        </div>

        <div className="compact-row-right">
          <DelayPill diffDays={diffDays} delayLabel={delayLabel} />
          <span className="chev">{isExpanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {isExpanded && (
        <div className="compact-expanded">{renderClientDetailCard(client)}</div>
      )}
    </div>
  );
}