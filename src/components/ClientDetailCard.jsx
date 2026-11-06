// src/components/ClientDetailCard.jsx
import React from "react";
import { hasNoFollowUp, phaseBadgeClass, sellerPhaseActions } from "../lib/relance";
import { closedBadgeLabel, closedDate, closedDossierDates, closureReasonLabel } from "../lib/clientStatus";
import { formatPhone } from "../lib/contact";

const PHASE_ACTION_TITLES = {
  to_mandat: "Mandat signé : relance recalculée automatiquement",
  to_promise: "Promesse ou compromis signé : enregistrer la transaction",
  promise_cancelled: "Motif obligatoire ; la fiche repasse sous mandat",
};

export default function ClientDetailCard({
  c,
  isAdmin,
  isManager,
  getCommercialEmail,
  humanCategory,
  getFollowupInfo,
  commentsByClient,
  formatDate,
  commentInputs,
  handleCommentInputChange,
  nextDueInputs,
  setNextDueForClient,
  addDays,
  handleValidateRelance,
  openEditModal,
  openClosureModal,
  getSellerStageLabel,
  onPassMandat,
  onPromise,
  onSignSale,
  onCancelPromise,
  soldInfo, // fiche vendue : { date, price, feesTtc, feesHt, afterClient, transactionId }
  formatCurrency,
  onOpenClient,
  onOpenTransaction,
  promiseDate, // dernière date de promesse connue (dates clés d'un dossier clos)
  onAddClosedNote,
  onReopen,
}) {
  const name =
    (c.first_name || "") +
      (c.first_name && c.last_name ? " " : "") +
      (c.last_name || "") || "(Sans nom)";

  const commercialEmail = getCommercialEmail(c.owner_id);
  const catLabel = humanCategory(c.category);
  const { label: nextLabel, delayLabel, diffDays } = getFollowupInfo(c);
  const comments = commentsByClient[c.id] || [];

  const isBuyer = c.category === "buyer";
  const isAfter = c.category === "after";
  const isSeller = c.category === "seller";

  const sellerStageLabel = isSeller ? getSellerStageLabel(c) : "";
  const sellerStageClass = phaseBadgeClass(c.deal_stage);
  const stage = c.deal_stage || "pre_mandat";
  const isSold = isSeller && stage === "vendu";
  const isPromise = isSeller && stage === "sous_promesse";
  const phaseHandlers = {
    to_mandat: onPassMandat,
    to_promise: onPromise,
    deed_signed: onSignSale,
    promise_cancelled: onCancelPromise,
  };
  // Fiche vendue ou clôturée : ni relance, ni retard, ni action ; seul le commentaire reste possible
  const isClosed = c.status === "closed";
  const showFollowUp = c.status === "active" && !hasNoFollowUp(c);
  const nextNote = showFollowUp && c.next_due_source !== "manual" ? c.next_due_note : "";
  const closedBadge = closedBadgeLabel(c);
  const keyDates = isClosed
    ? closedDossierDates(c, { promiseDate, deedDate: soldInfo?.date || null })
    : [];

  const delayStyle =
    diffDays == null
      ? {}
      : diffDays < 0
      ? {
          marginLeft: 6,
          padding: "2px 8px",
          borderRadius: 999,
          background: "#fef2f2",
          color: "#b91c1c",
          fontSize: "0.75rem",
        }
      : {
          marginLeft: 6,
          padding: "2px 8px",
          borderRadius: 999,
          background: "#eff6ff",
          color: "#1d4ed8",
          fontSize: "0.75rem",
        };

  return (
    <div className="client-card detail-card-inside">
      <div className="client-header">
        <div>
          {(isAdmin || isManager) && (
            <div className="client-commercial">
              Commercial : {commercialEmail || "—"}
            </div>
          )}

          <div className="client-name-row">
            <div className="client-name">{name}</div>
            {isClosed ? (
              <span className={"closed-badge" + (closedBadge === "Vendu" ? " closed-badge-sold" : "")}>{closedBadge}</span>
            ) : (
              <>
                {isSeller && <span className={sellerStageClass}>{sellerStageLabel}</span>}
                {isBuyer && c.deal_stage === "sous_promesse" && <span className={sellerStageClass}>Sous promesse</span>}
              </>
            )}
          </div>

          {c.email && <div className="client-line">{c.email}</div>}
          {c.phone && <div className="client-line">{formatPhone(c.phone)}</div>}
        </div>

        <div style={{ textAlign: "right" }}>
          {showFollowUp && nextLabel && (
            <div style={{ marginTop: 6, fontSize: "0.8rem", color: "#4b5563" }}>
              {nextLabel}
              {delayLabel && <span style={delayStyle}>{delayLabel}</span>}
              {nextNote && <div style={{ marginTop: 2, color: "#1d4ed8" }}>{nextNote}</div>}
            </div>
          )}
        </div>
      </div>

      <div className="client-body">
        <div className="field-row">
          <span className="field-key">Catégorie</span>
          <span className="field-value">{catLabel}</span>
        </div>

        {isSeller && !isClosed && (
          <div className="field-row">
            <span className="field-key">Phase</span>
            <span className="field-value">{getSellerStageLabel(c)}</span>
          </div>
        )}

        {!isBuyer && !isAfter && c.seller_kind && (
          <div className="field-row">
            <span className="field-key">Type</span>
            <span className="field-value">{c.seller_kind}</span>
          </div>
        )}

        {c.contact_origin && (
          <div className="field-row">
            <span className="field-key">Origine</span>
            <span className="field-value">{c.contact_origin}</span>
          </div>
        )}

        {!isBuyer && !isAfter && c.estimation_date && (
          <div className="field-row">
            <span className="field-key">Estimation</span>
            <span className="field-value">{formatDate(c.estimation_date)}</span>
          </div>
        )}

        {isBuyer && c.acquisition_date && (
          <div className="field-row">
            <span className="field-key">Date enregistrement</span>
            <span className="field-value">{formatDate(c.acquisition_date)}</span>
          </div>
        )}

        {isAfter && (c.sale_completed_at || c.created_at) && (
          <div className="field-row">
            <span className="field-key">Date de vente</span>
            {/* Ancienne fiche acquéreur devenue après-vente : date de l'acte (sale_completed_at) */}
            <span className="field-value">{formatDate(c.sale_completed_at || c.created_at)}</span>
          </div>
        )}

        {!isBuyer && !isAfter && c.property_address && (
          <div className="field-row">
            <span className="field-key">Adresse bien</span>
            <span className="field-value">{c.property_address}</span>
          </div>
        )}

        {isAfter && c.after_address && (
          <div className="field-row">
            <span className="field-key">Adresse</span>
            <span className="field-value">{c.after_address}</span>
          </div>
        )}

        {isBuyer && c.area && (
          <div className="field-row">
            <span className="field-key">Secteur</span>
            <span className="field-value">{c.area}</span>
          </div>
        )}

        {isBuyer && (c.budget_max || c.min_surface) && (
          <div className="field-row">
            <span className="field-key">Projet</span>
            <span className="field-value">
              {c.budget_max && `Budget max : ${c.budget_max} `}
              {c.min_surface && `— Surface min : ${c.min_surface} m²`}
              {c.bedrooms && ` — Chambres : ${c.bedrooms}`}
              {c.also_owner && " — Aussi propriétaire"}
            </span>
          </div>
        )}

        {c.consultant_feeling && (
          <div className="field-row">
            <span className="field-key">Ressenti</span>
            <span className="field-value">{c.consultant_feeling}</span>
          </div>
        )}

        {!isBuyer && !isAfter && c.sale_reason && (
          <div className="field-row">
            <span className="field-key">Raison vente / mise en location</span>
            <span className="field-value">{c.sale_reason}</span>
          </div>
        )}

        {!isBuyer && !isAfter && c.project_horizon && (
          <div className="field-row">
            <span className="field-key">Horizon projet</span>
            <span className="field-value">{c.project_horizon}</span>
          </div>
        )}

        {isAfter && c.client_birthday && (
          <div className="field-row">
            <span className="field-key">Anniversaire client</span>
            <span className="field-value">{formatDate(c.client_birthday)}</span>
          </div>
        )}

        {isAfter && c.context && (
          <div className="field-row">
            <span className="field-key">Contexte</span>
            <span className="field-value">{c.context}</span>
          </div>
        )}

        {isClosed && (
          <div className="closed-box">
            <strong>Dossier clos{closedDate(c) ? ` le ${formatDate(closedDate(c))}` : ""}</strong>
            <div>Motif : {closureReasonLabel(c.closure_reason || c.sale_result)}</div>
            {soldInfo && (
              <>
                <div>
                  {soldInfo.price != null && <>Prix : {formatCurrency(soldInfo.price)} · </>}
                  {soldInfo.feesTtc != null ? (
                    <>
                      Honoraires : {formatCurrency(soldInfo.feesTtc)} TTC ({formatCurrency(soldInfo.feesHt)} HT)
                    </>
                  ) : (
                    "Honoraires : —"
                  )}
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 2 }}>
                  {soldInfo.transactionId && (
                    <button type="button" className="link-button" onClick={() => onOpenTransaction(soldInfo.transactionId)}>
                      Voir la transaction →
                    </button>
                  )}
                  {soldInfo.afterClient && (
                    <button type="button" className="link-button" onClick={() => onOpenClient(soldInfo.afterClient)}>
                      Fiche après-vente de l’acquéreur →
                    </button>
                  )}
                </div>
              </>
            )}
            {keyDates.length > 0 && (
              <div className="closed-box-dates">
                {keyDates.map((d) => (
                  <span key={d.key}>
                    {d.label} : <strong>{formatDate(d.date)}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <div
            style={{
              fontSize: "0.8rem",
              marginBottom: comments.length ? 4 : 8,
              color: "#111827",
              fontWeight: 600,
            }}
          >
            Historique des relances
          </div>

          {comments.length > 0 && (
            <ul
              style={{
                listStyle: "none",
                paddingLeft: 0,
                marginTop: 0,
                marginBottom: 6,
                fontSize: "0.8rem",
                color: "#4b5563",
              }}
            >
              {comments
                .slice()
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map((n) => (
                  <li key={n.id}>
                    <strong>{formatDate(n.created_at)} :</strong> {n.body}
                  </li>
                ))}
            </ul>
          )}

          <textarea
            rows={2}
            placeholder={isClosed ? "Ajouter une note au dossier" : "Ajouter un commentaire (ex : relancé, client en réflexion…)"}
            value={commentInputs[c.id] || ""}
            onChange={(e) => handleCommentInputChange(c.id, e.target.value)}
            style={{
              width: "100%",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              padding: "6px 8px",
              fontSize: "0.85rem",
              resize: "vertical",
            }}
          />

          {showFollowUp && (
          <div className="nextdue-row">
            <div className="nextdue-label">Prochaine relance</div>
            <input
              type="date"
              value={nextDueInputs[c.id] || ""}
              onChange={(e) => setNextDueForClient(c.id, e.target.value)}
              className="nextdue-input"
            />
            <button
              type="button"
              className="btn-outline-small"
              onClick={() => setNextDueForClient(c.id, addDays(new Date(), 7))}
              title="Mettre +7 jours"
            >
              +7 j
            </button>
            <button
              type="button"
              className="btn-outline-small"
              onClick={() => setNextDueForClient(c.id, addDays(new Date(), 14))}
              title="Mettre +14 jours"
            >
              +14 j
            </button>
            <button
              type="button"
              className="btn-outline-small"
              onClick={() => setNextDueForClient(c.id, addDays(new Date(), 21))}
              title="Mettre +21 jours"
            >
              +21 j
            </button>
            <button
              type="button"
              className="btn-outline-small"
              onClick={() => setNextDueForClient(c.id, addDays(new Date(), 30))}
              title="Mettre +30 jours"
            >
              +30 j
            </button>
          </div>
          )}
        </div>
      </div>

      <div className="client-footer">
        {isClosed && (
          <>
            <button className="btn-outline-small" onClick={() => onAddClosedNote(c)} type="button">
              Ajouter la note
            </button>
            {isAdmin && (
              <button className="btn-outline-small" onClick={() => onReopen(c)} type="button">
                Rouvrir le dossier
              </button>
            )}
          </>
        )}

        {c.status === "active" && !isSold && (
          <>
            <button className="btn-outline-small" onClick={() => handleValidateRelance(c)} type="button">
              Valider relance
            </button>

            {/* Actions de phase, dans l'ordre : la première est l'action principale */}
            {sellerPhaseActions(c).map((action) => (
              <button
                key={action.key}
                className={action.primary ? "btn-primary" : "btn-outline-small"}
                onClick={() => phaseHandlers[action.key](c)}
                type="button"
                title={action.hint || PHASE_ACTION_TITLES[action.key]}
              >
                {action.label}
              </button>
            ))}

            <button className="btn-outline-small" onClick={() => openEditModal(c)} type="button">
              Modifier
            </button>
          </>
        )}

        {/* Sous promesse : « Acte signé » ou « Promesse annulée » ; vendue : plus aucune action */}
        {!isClosed && !isPromise && !isSold && (
          <button className="btn-outline-small" onClick={() => openClosureModal(c)} type="button">
            Clôturer…
          </button>
        )}
      </div>
      {isPromise && c.status === "active" && (
        <div style={{ fontSize: "0.78rem", color: "#6b7280", textAlign: "right", marginTop: 4 }}>
          Acte signé : vente définitive chez le notaire.
        </div>
      )}
    </div>
  );
}