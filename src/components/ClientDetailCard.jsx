// src/components/ClientDetailCard.jsx
// Contenu d'une fiche client : frise et sections par étape (vendeur), informations, relance,
// actions, historique. Utilisé dépliée dans la liste et sur la page /clients/:id.
import React from "react";
import { Link } from "react-router";
import { hasNoFollowUp, sellerPhaseActions } from "../lib/relance";
import { closedDate, closedDossierDates, closureReasonLabel } from "../lib/clientStatus";
import { formatPhone } from "../lib/contact";
import { MANDATE_TYPES, sellerTimeline, visibleSellerSections } from "../lib/stages";
import { clientPath } from "../lib/routes";
import { Badge, Button, Icon, Input, Textarea, cx, focusRing } from "./ui";

const PHASE_ACTION_TITLES = {
  to_mandat: "Mandat signé : prix et honoraires prévus facultatifs",
  to_promise: "Promesse ou compromis signé : enregistrer la transaction",
  promise_cancelled: "Motif obligatoire ; la fiche repasse sous mandat",
};

// Frise Estimation → Sous mandat → Sous promesse → Vendu / Clos
export function StageTimeline({ steps, formatDate }) {
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Étapes du dossier">
      {steps.map((s, i) => {
        const done = s.state === "done";
        const current = s.state === "current";
        return (
          <li key={s.key} className="relative min-w-0" aria-current={current ? "step" : undefined}>
            {i > 0 && (
              <span
                aria-hidden="true"
                className={cx("absolute top-3 right-1/2 h-0.5 w-full -translate-y-1/2", done || current ? "bg-primary" : "bg-line")}
              />
            )}
            <div className="relative flex flex-col items-center text-center">
              <span
                className={cx(
                  "flex size-6 items-center justify-center rounded-full text-[11px] font-bold ring-4 ring-surface",
                  done && "bg-primary text-white",
                  current && "bg-accent text-white",
                  !done && !current && "border border-line-strong bg-subtle text-ink-muted"
                )}
              >
                {done ? <Icon name="check" size={14} /> : i + 1}
              </span>
              <span className={cx("mt-1.5 text-xs font-semibold", done || current ? "text-ink" : "text-ink-muted")}>{s.label}</span>
              <span className="tabular text-[11px] text-ink-muted">{s.date ? formatDate(s.date) : current ? "en cours" : "—"}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Section({ title, icon, children, tone = "default", actions }) {
  return (
    <section className={cx("rounded-card border p-4", tone === "closed" ? "border-line-strong bg-subtle" : "border-line bg-surface")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
          {icon && <Icon name={icon} size={16} className="text-primary" />}
          {title}
        </h3>
        {actions}
      </div>
      <div className="text-sm text-ink-soft">{children}</div>
    </section>
  );
}

function Facts({ items }) {
  const shown = items.filter((i) => i && i.value !== null && i.value !== undefined && i.value !== "");
  if (!shown.length) return <p className="text-sm text-ink-muted">Rien de renseigné pour l’instant.</p>;
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {shown.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-medium text-ink-muted">{i.label}</dt>
          <dd className="tabular break-words text-sm font-semibold text-ink">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const QUICK_DAYS = [7, 14, 21, 30];

const linkClass = cx("rounded font-semibold text-primary hover:underline", focusRing);

export default function ClientDetailCard({
  c,
  variant = "inline",
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
  onPassMandat,
  onPromise,
  onSignSale,
  onCancelPromise,
  soldInfo, // fiche vendue : { date, price, feesTtc, feesHt, afterClient, transactionId }
  promiseInfo, // promesse : { transactionId, date, price, feesTtc, feesHt, buyerLabel }
  formatCurrency,
  onOpenClient,
  onOpenTransaction,
  promiseDate,
  onAddClosedNote,
  onReopen,
}) {
  const { label: nextLabel, delayLabel, diffDays } = getFollowupInfo(c);
  const comments = (commentsByClient[c.id] || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const isSeller = c.category === "seller";
  const isBuyer = c.category === "buyer";
  const isClosed = c.status === "closed";
  const stage = c.deal_stage || "pre_mandat";
  const isSold = isSeller && stage === "vendu";
  const isPromise = isSeller && stage === "sous_promesse";
  const showFollowUp = c.status === "active" && !hasNoFollowUp(c);
  const nextNote = showFollowUp && c.next_due_source !== "manual" ? c.next_due_note : "";
  const phaseHandlers = { to_mandat: onPassMandat, to_promise: onPromise, deed_signed: onSignSale, promise_cancelled: onCancelPromise };
  const steps = isSeller ? sellerTimeline(c, { promiseDate, deedDate: soldInfo?.date || null }) : [];
  const sections = isSeller ? visibleSellerSections(c, { promiseDate }) : null;
  const keyDates = isClosed ? closedDossierDates(c, { promiseDate, deedDate: soldInfo?.date || null }) : [];
  const money = (n) => {
    if (n === null || n === undefined || n === "") return null;
    const num = Number(String(n).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(num) ? formatCurrency(num) : String(n);
  };

  return (
    <div className="space-y-4">
      {variant === "inline" && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5 text-sm text-ink-soft">
            {(isAdmin || isManager) && <div className="text-xs text-ink-muted">Commercial : {getCommercialEmail(c.owner_id) || "—"}</div>}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {c.phone && (
                <a href={`tel:${c.phone}`} className={cx("inline-flex items-center gap-1.5 rounded hover:text-primary", focusRing)}>
                  <Icon name="phone" size={15} className="text-ink-muted" />
                  {formatPhone(c.phone)}
                </a>
              )}
              {c.email && (
                <a href={`mailto:${c.email}`} className={cx("inline-flex min-w-0 items-center gap-1.5 rounded hover:text-primary", focusRing)}>
                  <Icon name="mail" size={15} className="text-ink-muted" />
                  <span className="truncate">{c.email}</span>
                </a>
              )}
            </div>
          </div>
          <Link to={clientPath(c.id)} className={cx("inline-flex items-center gap-1 text-sm", linkClass)}>
            Ouvrir la fiche
            <Icon name="chevronRight" size={16} />
          </Link>
        </div>
      )}

      {isSeller && (
        <div className="rounded-card border border-line bg-surface px-3 py-4">
          <StageTimeline steps={steps} formatDate={formatDate} />
        </div>
      )}

      {/* Sections par étape (vendeur) ou informations du projet (acquéreur, après-vente) */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {isSeller && (
          <Section title="Estimation" icon="home">
            <Facts
              items={[
                { label: "Date de l’estimation", value: c.estimation_date ? formatDate(c.estimation_date) : null },
                { label: "Valeur estimée", value: money(c.estimation_value) },
                { label: "Adresse du bien", value: c.property_address },
                { label: "Type", value: c.seller_kind },
                { label: "Origine", value: c.contact_origin },
                { label: "Horizon", value: c.project_horizon },
              ]}
            />
          </Section>
        )}
        {isSeller && sections.mandat && (
          <Section title="Mandat" icon="key">
            <Facts
              items={[
                { label: "Date du mandat", value: c.mandat_at ? formatDate(c.mandat_at) : null },
                { label: "Prix de mise en vente", value: money(c.listing_price) },
                { label: "Honoraires prévus TTC", value: money(c.planned_fees_ttc) },
                { label: "Type de mandat", value: MANDATE_TYPES[c.mandate_type] || null },
              ]}
            />
          </Section>
        )}
        {isSeller && sections.promesse && (
          <Section
            title="Promesse"
            icon="clipboard"
            actions={
              promiseInfo?.transactionId && (
                <button type="button" className={cx("text-xs", linkClass)} onClick={() => onOpenTransaction(promiseInfo.transactionId)}>
                  Voir la transaction
                </button>
              )
            }
          >
            {promiseInfo ? (
              <Facts
                items={[
                  { label: "Date de promesse", value: promiseInfo.date ? formatDate(promiseInfo.date) : null },
                  { label: "Prix de vente", value: money(promiseInfo.price) },
                  {
                    label: "Honoraires",
                    value:
                      promiseInfo.feesTtc != null
                        ? `${formatCurrency(promiseInfo.feesTtc)} TTC · ${formatCurrency(promiseInfo.feesHt)} HT`
                        : null,
                  },
                  { label: "Acquéreur", value: promiseInfo.buyerLabel },
                ]}
              />
            ) : (
              <p className="text-sm text-ink-muted">Transaction non visible.</p>
            )}
          </Section>
        )}
        {!isSeller && (
          <Section title={humanCategory(c.category)} icon={isBuyer ? "search" : "home"}>
            <Facts
              items={
                isBuyer
                  ? [
                      { label: "Budget maximum", value: money(c.budget_max) },
                      { label: "Type de bien", value: c.project_type },
                      { label: "Pièces", value: c.rooms },
                      { label: "Secteurs", value: c.area },
                      { label: "Surface minimum", value: c.min_surface ? `${c.min_surface} m²` : null },
                      { label: "Chambres", value: c.bedrooms },
                      { label: "Enregistrement", value: c.acquisition_date ? formatDate(c.acquisition_date) : null },
                      { label: "Aussi propriétaire", value: c.also_owner ? "Oui" : null },
                      { label: "Notes", value: c.context },
                    ]
                  : [
                      { label: "Adresse", value: c.after_address },
                      {
                        label: "Date d’achat",
                        value: c.sale_completed_at || c.created_at ? formatDate(c.sale_completed_at || c.created_at) : null,
                      },
                      { label: "Anniversaire", value: c.client_birthday ? formatDate(c.client_birthday) : null },
                      { label: "Origine", value: c.contact_origin },
                      { label: "Contexte", value: c.context },
                    ]
              }
            />
          </Section>
        )}
        {c.consultant_feeling && (
          <Section title="Ressenti du conseiller" icon="user">
            <p className="whitespace-pre-line">{c.consultant_feeling}</p>
          </Section>
        )}
      </div>

      {/* Vendu ou Clos : synthèse du dossier */}
      {isClosed && (
        <Section title={`Dossier clos${closedDate(c) ? ` le ${formatDate(closedDate(c))}` : ""}`} icon="lock" tone="closed">
          <p>
            Motif : <strong className="text-ink">{closureReasonLabel(c.closure_reason || c.sale_result)}</strong>
          </p>
          {soldInfo && (
            <div className="mt-1 space-y-1">
              <p className="tabular">
                {soldInfo.price != null && <>Prix : {formatCurrency(soldInfo.price)} · </>}
                Honoraires :{" "}
                {soldInfo.feesTtc != null ? `${formatCurrency(soldInfo.feesTtc)} TTC (${formatCurrency(soldInfo.feesHt)} HT)` : "—"}
              </p>
              <div className="flex flex-wrap gap-4">
                {soldInfo.transactionId && (
                  <button type="button" className={linkClass} onClick={() => onOpenTransaction(soldInfo.transactionId)}>
                    Voir la transaction →
                  </button>
                )}
                {soldInfo.afterClient && (
                  <button type="button" className={linkClass} onClick={() => onOpenClient(soldInfo.afterClient)}>
                    Fiche après-vente de l’acquéreur →
                  </button>
                )}
              </div>
            </div>
          )}
          {keyDates.length > 0 && (
            <div className="tabular mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
              {keyDates.map((d) => (
                <span key={d.key}>
                  {d.label} : <strong className="text-ink-soft">{formatDate(d.date)}</strong>
                </span>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Relance et actions */}
      <section className="rounded-card border border-line bg-surface p-4">
        {showFollowUp && nextLabel && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <Icon name="clock" size={16} className="text-ink-muted" />
            <span className="font-semibold text-ink">{nextLabel}</span>
            {delayLabel && <Badge tone={diffDays < 0 ? "danger" : diffDays === 0 ? "accent" : "info"}>{delayLabel}</Badge>}
            {nextNote && <Badge tone="primary">{nextNote}</Badge>}
          </div>
        )}

        <Textarea
          rows={2}
          aria-label={isClosed ? "Note au dossier" : "Commentaire de relance"}
          placeholder={isClosed ? "Ajouter une note au dossier" : "Commentaire de relance (ex : relancé, client en réflexion…)"}
          value={commentInputs[c.id] || ""}
          onChange={(e) => handleCommentInputChange(c.id, e.target.value)}
        />

        {showFollowUp && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-ink-muted">Prochaine relance</span>
            <Input
              type="date"
              aria-label="Date de la prochaine relance"
              className="!w-auto"
              value={nextDueInputs[c.id] || ""}
              onChange={(e) => setNextDueForClient(c.id, e.target.value)}
            />
            {QUICK_DAYS.map((d) => (
              <Button key={d} size="sm" variant="secondary" onClick={() => setNextDueForClient(c.id, addDays(new Date(), d))} title={`Dans ${d} jours`}>
                +{d} j
              </Button>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {isClosed ? (
            <>
              <Button size="sm" variant="secondary" icon="plus" onClick={() => onAddClosedNote(c)}>
                Ajouter la note
              </Button>
              {isAdmin && (
                <Button size="sm" variant="danger" onClick={() => onReopen(c)}>
                  Rouvrir le dossier
                </Button>
              )}
            </>
          ) : (
            <>
              {!isSold && (
                <Button size="sm" icon="check" onClick={() => handleValidateRelance(c)}>
                  Valider la relance
                </Button>
              )}
              {sellerPhaseActions(c).map((action) => (
                <Button
                  key={action.key}
                  size="sm"
                  variant={action.primary ? "accent" : "secondary"}
                  onClick={() => phaseHandlers[action.key](c)}
                  title={action.hint || PHASE_ACTION_TITLES[action.key]}
                >
                  {action.label}
                </Button>
              ))}
              <span className="ml-auto flex flex-wrap gap-2">
                {!isSold && (
                  <Button size="sm" variant="quiet" onClick={() => openEditModal(c)}>
                    Modifier
                  </Button>
                )}
                {!isPromise && !isSold && (
                  <Button size="sm" variant="quiet" onClick={() => openClosureModal(c)}>
                    Clôturer…
                  </Button>
                )}
              </span>
            </>
          )}
        </div>
        {isPromise && !isClosed && <p className="mt-2 text-xs text-ink-muted">Acte signé : vente définitive chez le notaire.</p>}
      </section>

      {/* Historique des relances et notes */}
      <section>
        <h3 className="mb-2 text-sm font-bold text-ink">Historique</h3>
        {comments.length === 0 ? (
          <p className="text-sm text-ink-muted">Aucun commentaire pour l’instant.</p>
        ) : (
          <ol className="relative space-y-3 border-l border-line pl-4">
            {comments.map((n) => (
              <li key={n.id} className="relative text-sm">
                <span aria-hidden="true" className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-primary-line ring-2 ring-surface" />
                <span className="tabular text-xs font-semibold text-ink-muted">{formatDate(n.created_at)}</span>
                <p className="whitespace-pre-line text-ink-soft">{n.body}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
