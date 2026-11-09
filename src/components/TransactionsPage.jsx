// src/components/TransactionsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "../supabaseClient";
import { transactionPath } from "../lib/routes";
import { parseDateStr } from "../lib/dates";
import {
  PROPERTY_TYPE_LABELS,
  SIDE_LABELS,
  TRANSACTION_KIND_LABELS,
  DISPLAY_STATUS_LABELS,
  VALIDATED_LOCK_MESSAGE,
  canDeleteTransaction,
  canEditTransaction,
  deductionsTotal,
  displayStatus,
  groupParticipantsByUser,
  participantsVisibleTo,
  pendingStats,
  isAwaitingValidation,
  isValidated,
  validationLabel,
  isCancelled,
  netFeesHt,
  participantAmount,
  round2,
  transactionFeesHt,
} from "../lib/transactions";
import { DeductionAddForm, FeesBreakdown } from "./TransactionFormModal";
import { PageHeader } from "./AppShell";
import { Alert, Badge, Button, EmptyState, Field, Input, Modal, Select, SkeletonList, StatCard, Table, Td, Th, Tr, cx } from "./ui";

const personName = (c) => [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim();
const sellerDisplay = (t) => personName(t.seller) || t.seller_label || "—";
const buyerDisplay = (t) => personName(t.buyer) || t.buyer_label || "—";
const propertyDisplay = (t) =>
  [t.property?.address, [t.property?.postal_code, t.property?.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ") || "—";

// Date affichée en tête de ligne : vente / bail, sinon promesse, sinon encaissement, sinon création.
const mainDate = (t) => t.deed_date || t.preliminary_date || t.fees_received_at || t.created_at;

// « Benjamin Rondreux » → « Benjamin R. » ; un email garde sa partie avant @.
const shortName = (label) => {
  const raw = String(label || "").trim();
  if (!raw) return "—";
  if (raw.includes("@")) return raw.split("@")[0];
  const [first, ...rest] = raw.split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0].toUpperCase()}.` : first;
};

const rowData = (t) => {
  const feesHt = transactionFeesHt(t);
  return { feesHt, ded: deductionsTotal(t.deductions), net: netFeesHt(feesHt, t.deductions) };
};

const PartiesCell = ({ t }) => {
  const rental = t.kind === "rental";
  return (
    <>
      <div>
        <span className="text-ink-muted">{rental ? "Bailleur" : "Vendeur"} :</span> {sellerDisplay(t)}
      </div>
      <div>
        <span className="text-ink-muted">{rental ? "Locataire" : "Acquéreur"} :</span> {buyerDisplay(t)}
      </div>
    </>
  );
};

// Une ligne par personne (entrée + sortie regroupées) ; le détail par côté reste dans la fiche.
const ParticipantsCell = ({ t, viewer, net, profileLabel, formatCurrency }) =>
  groupParticipantsByUser(participantsVisibleTo(t.participants, viewer)).map((g) => (
    <div key={g.user_id} className="whitespace-nowrap">
      {shortName(profileLabel(g.user_id))} {g.share_pct} % · {formatCurrency(participantAmount(net, g.share_pct))}
    </div>
  ));

// Couleurs de statut : celles des phases de la fiche vendeur (promesse, vendu), annulée en rouge.
const STATUS_TONES = { promise: "promesse", sold: "vendu", rented: "premandat", cancelled: "danger" };
const StatusBadge = ({ tx }) => {
  const status = displayStatus(tx);
  return <Badge tone={STATUS_TONES[status]}>{DISPLAY_STATUS_LABELS[status]}</Badge>;
};

const ValidationBadge = ({ tx }) => {
  const label = validationLabel(tx);
  return label ? <Badge tone={isValidated(tx) ? "success" : "warning"}>{label}</Badge> : null;
};

const Fact = ({ label, children, className = "" }) => (
  <div className={cx("min-w-0", className)}>
    <dt className="text-sm text-ink-muted">{label}</dt>
    <dd className="tabular font-semibold text-ink">{children}</dd>
  </div>
);

function TransactionDetailModal({
  tx,
  viewer,
  profileLabel,
  formatCurrency,
  formatDate,
  onClose,
  onChanged,
  onEdit,
  onSignSale,
  onCancel,
}) {
  const { isAdmin, userId } = viewer;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feesReceivedAt, setFeesReceivedAt] = useState(tx.fees_received_at || "");
  // Admin : taux exceptionnels saisis, par participant (vide = taux du profil)
  const [rates, setRates] = useState(() =>
    Object.fromEntries((tx.participants || []).map((p) => [p.id, p.rate_override ?? ""]))
  );

  const editable = canEditTransaction(tx, userId, isAdmin) && !isCancelled(tx);
  const canDelete = canDeleteTransaction(tx, userId, isAdmin);
  const validatedLocked = !isAdmin && isValidated(tx);
  const feesHt = transactionFeesHt(tx);
  const isRental = tx.kind === "rental";
  const status = displayStatus(tx);

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await onChanged();
    } catch (err) {
      setError(err?.message || "Erreur (voir console).");
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  // Mise à jour directe : vérifie qu'une ligne a bien été modifiée (RLS silencieuses sur UPDATE).
  const updateTx = async (payload) => {
    const { data, error: err } = await supabase.from("transactions").update(payload).eq("id", tx.id).select("id");
    if (err) throw err;
    if (!data || data.length === 0) throw new Error("Aucune modification (transaction validée ou droits insuffisants).");
  };

  // Admin : date d'encaissement réelle si elle diffère de la date de vente / du bail.
  const saveFeesReceivedAt = () =>
    run(async () => {
      if (!feesReceivedAt) throw new Error("La date d'encaissement est obligatoire.");
      await updateTx({ fees_received_at: feesReceivedAt });
    });

  const validateTx = () =>
    run(async () => {
      const { error: err } = await supabase.rpc("validate_transaction", { p_id: tx.id });
      if (err) throw err;
    });

  const deleteTx = () =>
    run(async () => {
      if (!window.confirm("Supprimer définitivement cette transaction ?")) return;
      const { data, error: err } = await supabase.from("transactions").delete().eq("id", tx.id).select("id");
      if (err) throw err;
      if (!data || data.length === 0) throw new Error("Suppression refusée (droits insuffisants).");
      onClose();
    });

  const addDeduction = async (d) => {
    let ok = true;
    await run(async () => {
      if (deductionsTotal([...(tx.deductions || []), d]) > feesHt) {
        ok = false;
        throw new Error("Les déductions dépasseraient les honoraires HT.");
      }
      const { error: err } = await supabase.from("transaction_deductions").insert({
        transaction_id: tx.id,
        label: d.label.trim(),
        beneficiary: d.beneficiary?.trim() || null,
        amount_ht: d.amount_ht,
        reason: d.reason.trim(),
      });
      if (err) {
        ok = false;
        throw err;
      }
    });
    return ok;
  };

  // Taux exceptionnel d'un participant : la commission de la transaction est recalculée aussitôt.
  const saveRate = (participantId) =>
    run(async () => {
      const raw = String(rates[participantId] ?? "").replace(",", ".").trim();
      const rate = raw === "" ? null : Number(raw);
      if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) throw new Error("Taux entre 0 et 100 %.");
      const { error: err } = await supabase.rpc("set_participant_rate", { p_participant_id: participantId, p_rate: rate });
      if (err) throw err;
    });

  const recalculateCommissions = () =>
    run(async () => {
      const { error: err } = await supabase.rpc("recalculate_transaction_commissions", { p_tx: tx.id });
      if (err) throw err;
    });

  const deleteDeduction = (id) =>
    run(async () => {
      const { data, error: err } = await supabase.from("transaction_deductions").delete().eq("id", id).select("id");
      if (err) throw err;
      if (!data || data.length === 0) throw new Error("Suppression refusée (transaction validée ?).");
    });


  return (
    <Modal
      open
      size="lg"
      busy={busy}
      title={`${TRANSACTION_KIND_LABELS[tx.kind]} · ${propertyDisplay(tx)}`}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge tx={tx} />
          {tx.validated_at
            ? `Validée le ${formatDate(tx.validated_at)}${tx.validated_by ? ` par ${profileLabel(tx.validated_by)}` : ""}`
            : "Non validée"}
        </span>
      }
      onClose={onClose}
      footer={
        <>
          {canDelete && (
            <Button variant="danger" disabled={busy} onClick={deleteTx}>
              Supprimer
            </Button>
          )}
          {editable && (
            <Button variant="secondary" disabled={busy} onClick={() => onCancel(tx)}>
              {status === "promise" ? "Promesse annulée" : "Annuler la transaction"}
            </Button>
          )}
          {editable && (
            <Button variant="secondary" disabled={busy} onClick={() => onEdit(tx)}>
              Modifier
            </Button>
          )}
          {isAdmin && isAwaitingValidation(tx) && (
            <Button disabled={busy} onClick={validateTx}>
              Valider
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-6">
        {validatedLocked && <Alert tone="info">{VALIDATED_LOCK_MESSAGE}</Alert>}

        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <Fact label={isRental ? "Bailleur" : "Vendeur"}>{sellerDisplay(tx)}</Fact>
          <Fact label={isRental ? "Locataire" : "Acquéreur"}>{buyerDisplay(tx)}</Fact>
          <Fact label={isRental ? "Loyer CC" : "Prix"}>{tx.price !== null && tx.price !== undefined ? formatCurrency(tx.price) : "—"}</Fact>
          <Fact label={isRental ? "Date du bail" : "Date de vente"}>{tx.deed_date ? formatDate(tx.deed_date) : "—"}</Fact>
          {!isRental && tx.preliminary_date && <Fact label="Promesse">{formatDate(tx.preliminary_date)}</Fact>}
          <Fact label="Honoraires">
            {formatCurrency(feesHt)} HT · {formatCurrency(tx.fees_ttc || 0)} TTC ({Number(tx.vat_rate)} %)
          </Fact>
          {tx.property?.property_type && (
            <Fact label="Bien">
              {PROPERTY_TYPE_LABELS[tx.property.property_type]}
              {tx.property.surface ? ` · ${tx.property.surface} m²` : ""}
            </Fact>
          )}
          {tx.cancel_reason && (
            <Fact label="Motif d'annulation" className="sm:col-span-2">
              <span className="text-danger">{tx.cancel_reason}</span>
            </Fact>
          )}
          {tx.notes && (
            <Fact label="Notes" className="sm:col-span-2">
              <span className="font-normal whitespace-pre-line">{tx.notes}</span>
            </Fact>
          )}
        </dl>

        <section className="space-y-3">
          <h3 className="text-base font-semibold text-ink">Déductions avant commission</h3>
          {(tx.deductions || []).length === 0 ? (
            <p className="text-sm text-ink-muted">Aucune déduction.</p>
          ) : (
            <ul className="divide-y divide-line rounded-control border border-line">
              {(tx.deductions || []).map((d) => (
                <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <strong className="text-ink">{d.label}</strong>
                    {d.beneficiary ? ` · ${d.beneficiary}` : ""} · {formatCurrency(d.amount_ht)} HT
                    <span className="block text-ink-muted">{d.reason}</span>
                  </span>
                  {editable && (
                    <Button variant="quiet" size="xs" disabled={busy} onClick={() => deleteDeduction(d.id)}>
                      Supprimer
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {editable && <DeductionAddForm onAdd={addDeduction} disabled={busy} />}
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-semibold text-ink">Calcul des commissions</h3>
          <FeesBreakdown
            feesHt={feesHt}
            deductions={tx.deductions || []}
            participants={participantsVisibleTo(tx.participants, viewer)}
            profileLabel={profileLabel}
            formatCurrency={formatCurrency}
          />
        </section>

        {isAdmin && !isCancelled(tx) && (tx.participants || []).length > 0 && (
          <section className="space-y-3">
            <div>
              <h3 className="text-base font-semibold text-ink">Taux de commission exceptionnels</h3>
              <p className="mt-1 text-sm text-ink-muted">
                Vide = taux du profil du commercial selon le côté. Un taux exceptionnel recalcule sa commission.
              </p>
            </div>
            <ul className="space-y-2">
              {(tx.participants || []).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="min-w-48 flex-1 text-ink">
                    {profileLabel(p.user_id) || "—"} · {SIDE_LABELS[p.side]} {Number(p.share_pct)} %
                  </span>
                  <div className="relative w-32">
                    <Input
                      inputMode="decimal"
                      placeholder="profil"
                      className="pr-9"
                      aria-label={`Taux exceptionnel ${profileLabel(p.user_id) || ""} ${SIDE_LABELS[p.side]}`}
                      value={rates[p.id] ?? ""}
                      onChange={(e) => setRates((r) => ({ ...r, [p.id]: e.target.value }))}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-muted">%</span>
                  </div>
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => saveRate(p.id)}>
                    Appliquer
                  </Button>
                </li>
              ))}
            </ul>
            {tx.status === "cashed" && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={recalculateCommissions}>
                Recalculer les commissions aux taux actuels
              </Button>
            )}
          </section>
        )}

        {editable && status === "promise" && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => onSignSale(tx)}>Marquer comme vendue</Button>
            <span className="text-sm text-ink-muted">Seule la date de vente est demandée.</span>
          </div>
        )}

        {isAdmin && !isCancelled(tx) && tx.status === "cashed" && (
          <section className="space-y-3 border-t border-line pt-5">
            <h3 className="text-base font-semibold text-ink">Encaissement (admin)</h3>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Encaissement des honoraires" hint={`Par défaut égale à la date ${isRental ? "du bail" : "de vente"}. Sert au CA annuel.`}>
                <Input type="date" value={feesReceivedAt} onChange={(e) => setFeesReceivedAt(e.target.value)} />
              </Field>
              <Button variant="secondary" disabled={busy} onClick={saveFeesReceivedAt} className="mb-7">
                Enregistrer
              </Button>
            </div>
          </section>
        )}

        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}

export default function TransactionsPage({
  transactions,
  loading,
  loadError,
  onReload,
  isAdmin,
  isManager,
  userId,
  managedUserIds,
  onSignSale,
  onCancel,
  detailId = null, // /transactions/:id
  filterProfiles,
  profileLabel,
  formatCurrency,
  formatDate,
  onNew,
  onEdit,
}) {
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [dateField, setDateField] = useState("deed_date");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const navigate = useNavigate();
  const setDetailId = (id) => navigate(transactionPath(id));
  const [validatingId, setValidatingId] = useState(null);
  const [rowError, setRowError] = useState("");

  // Données toujours à jour sans bouton « Actualiser » : à l'arrivée sur la page et au retour sur l'onglet
  useEffect(() => {
    onReload?.();
    const onVisible = () => {
      if (document.visibilityState === "visible") onReload?.();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Admin : validation directe depuis la ligne (même effet que dans la fiche)
  const validateRow = async (e, tx) => {
    e.stopPropagation();
    setValidatingId(tx.id);
    setRowError("");
    const { error: err } = await supabase.rpc("validate_transaction", { p_id: tx.id });
    setValidatingId(null);
    if (err) {
      setRowError(`Validation impossible : ${err.message}`);
      return;
    }
    await onReload?.();
  };

  const renderValidation = (t) => (
    <span className="inline-flex flex-wrap items-center gap-2">
      <ValidationBadge tx={t} />
      {isAdmin && isAwaitingValidation(t) && (
        <Button size="xs" variant="secondary" loading={validatingId === t.id} disabled={!!validatingId} onClick={(e) => validateRow(e, t)}>
          Valider
        </Button>
      )}
    </span>
  );

  const viewer = useMemo(
    () => ({ userId, isAdmin, isManager, managedUserIds: managedUserIds || [] }),
    [userId, isAdmin, isManager, managedUserIds]
  );
  const seesAll = isAdmin || isManager;

  const filtered = useMemo(() => {
    const from = parseDateStr(dateFrom);
    const to = parseDateStr(dateTo);
    return (transactions || [])
      .filter((t) => kindFilter === "all" || t.kind === kindFilter)
      .filter((t) =>
        statusFilter === "all" ? true : statusFilter === "to_validate" ? isAwaitingValidation(t) : displayStatus(t) === statusFilter
      )
      .filter((t) => userFilter === "all" || (t.participants || []).some((p) => p.user_id === userFilter))
      .filter((t) => {
        if (!from && !to) return true;
        const d = parseDateStr(t[dateField]);
        if (!d) return false;
        return (!from || d >= from) && (!to || d <= to);
      })
      .sort((a, b) => String(mainDate(b) || "").localeCompare(String(mainDate(a) || "")));
  }, [transactions, kindFilter, statusFilter, userFilter, dateField, dateFrom, dateTo]);

  // Admin / manager : montants des transactions ; commercial : SA part de base nette.
  const totals = useMemo(() => {
    const live = filtered.filter((t) => !isCancelled(t));
    const cashed = live.filter((t) => t.fees_received_at);
    if (!seesAll) {
      const myShare = (list) =>
        round2(
          list.reduce((s, t) => {
            const net = netFeesHt(transactionFeesHt(t), t.deductions);
            const mine = participantsVisibleTo(t.participants, viewer).filter((p) => p.user_id === userId);
            return s + mine.reduce((x, p) => x + participantAmount(net, p.share_pct), 0);
          }, 0)
        );
      return [
        ["Ma part encaissée (base nette HT)", myShare(cashed)],
        ["Ma part sous promesse (projection)", pendingStats(live, [userId]).shareNetHt],
      ];
    }
    const feesCashed = round2(cashed.reduce((s, t) => s + transactionFeesHt(t), 0));
    const dedCashed = round2(cashed.reduce((s, t) => s + deductionsTotal(t.deductions), 0));
    return [
      ["Honoraires HT encaissés", feesCashed],
      ["Déductions HT (sur encaissés)", dedCashed],
      ["Base nette HT encaissée", round2(feesCashed - dedCashed)],
      ["Honoraires HT sous promesse", pendingStats(live).feesHt],
    ];
  }, [filtered, seesAll, viewer, userId]);

  const detail = detailId ? (transactions || []).find((t) => t.id === detailId) : null;

  const filterLabel = "text-sm font-semibold whitespace-nowrap text-ink-muted";

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Ventes et locations, honoraires et répartition."
        actions={
          <>
            <Button onClick={() => onNew("sale")}>Nouvelle vente</Button>
            <Button onClick={() => onNew("rental")}>Nouvelle location</Button>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="w-44">
          <Select aria-label="Type" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
            <option value="all">Tous types</option>
            <option value="sale">Ventes</option>
            <option value="rental">Locations</option>
          </Select>
        </div>
        <div className="w-48">
          <Select aria-label="Statut" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Tous statuts</option>
            {Object.entries(DISPLAY_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
            {isAdmin && <option value="to_validate">À valider</option>}
          </Select>
        </div>
        {(isAdmin || isManager) && (
          <div className="w-56">
            <Select aria-label="Commercial" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
              <option value="all">Tous commerciaux</option>
              {(filterProfiles || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {profileLabel(p.id)}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className={filterLabel}>Période sur</span>
          <div className="w-56">
            <Select aria-label="Date de référence" value={dateField} onChange={(e) => setDateField(e.target.value)}>
              <option value="deed_date">date de vente / bail</option>
              <option value="fees_received_at">date d'encaissement</option>
            </Select>
          </div>
          <Input type="date" aria-label="Du" className="!w-auto" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span className={filterLabel}>au</span>
          <Input type="date" aria-label="Au" className="!w-auto" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {loadError && <Alert className="mb-4">{loadError}</Alert>}
      {rowError && <Alert className="mb-4">{rowError}</Alert>}

      {loading && filtered.length === 0 ? (
        <SkeletonList rows={6} label="Chargement des transactions" />
      ) : filtered.length === 0 ? (
        <EmptyState title="Aucune transaction" text="Changez les filtres ou enregistrez une nouvelle vente." />
      ) : (
        <>
          {/* Tableau à partir de 1280 px, cartes en dessous */}
          <Table className="hidden xl:block">
            <thead>
              <tr>
                {["Date", "Type", "Bien", "Parties", "Prix", "Honoraires", "Base nette HT", "Participants", "Statut", "Validation"].map((h) => (
                  <Th key={h}>{h}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const r = rowData(t);
                return (
                  <Tr key={t.id} onClick={() => setDetailId(t.id)} className={isCancelled(t) ? "opacity-55" : ""}>
                    <Td className="whitespace-nowrap">{formatDate(mainDate(t))}</Td>
                    <Td>{TRANSACTION_KIND_LABELS[t.kind]}</Td>
                    <Td className="min-w-40">{propertyDisplay(t)}</Td>
                    <Td className="min-w-44">
                      <PartiesCell t={t} />
                    </Td>
                    <Td className="whitespace-nowrap">{t.price !== null && t.price !== undefined ? formatCurrency(t.price) : "—"}</Td>
                    <Td className="whitespace-nowrap">
                      {formatCurrency(t.fees_ttc || 0)}
                      <div className="text-ink-muted">{formatCurrency(r.feesHt)} HT</div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <strong>{formatCurrency(r.net)}</strong>
                      {r.ded > 0 && <div className="text-ink-muted">− {formatCurrency(r.ded)}</div>}
                    </Td>
                    <Td>
                      <ParticipantsCell t={t} viewer={viewer} net={r.net} profileLabel={profileLabel} formatCurrency={formatCurrency} />
                    </Td>
                    <Td className="whitespace-nowrap">
                      <StatusBadge tx={t} />
                    </Td>
                    <Td className="whitespace-nowrap">
                      {renderValidation(t)}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>

          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card xl:hidden">
            {filtered.map((t) => {
              const r = rowData(t);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setDetailId(t.id)}
                    className={cx(
                      "block w-full space-y-2 px-4 py-4 text-left text-sm transition hover:bg-canvas/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary sm:px-6",
                      isCancelled(t) && "opacity-55"
                    )}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <strong className="text-base text-ink">
                        {TRANSACTION_KIND_LABELS[t.kind]} · {formatDate(mainDate(t))}
                      </strong>
                      <StatusBadge tx={t} />
                    </span>
                    <span className="block text-ink-soft">{propertyDisplay(t)}</span>
                    <span className="block">
                      <PartiesCell t={t} />
                    </span>
                    <span className="tabular flex flex-wrap justify-between gap-3">
                      <span>
                        {formatCurrency(t.fees_ttc || 0)} TTC <span className="text-ink-muted">· {formatCurrency(r.feesHt)} HT</span>
                      </span>
                      <span>
                        Base <strong>{formatCurrency(r.net)}</strong>
                        {r.ded > 0 && <span className="text-ink-muted"> (− {formatCurrency(r.ded)})</span>}
                      </span>
                    </span>
                    <span className="block">
                      <ParticipantsCell t={t} viewer={viewer} net={r.net} profileLabel={profileLabel} formatCurrency={formatCurrency} />
                    </span>
                    {t.price !== null && t.price !== undefined && (
                      <span className="block text-ink-muted">Prix {formatCurrency(t.price)}</span>
                    )}
                  </button>
                  <div className="px-4 pb-4 sm:px-6">
                    {renderValidation(t)}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {totals.map(([label, value]) => (
          <StatCard key={label} label={label} value={formatCurrency(value)} />
        ))}
      </div>
      <p className="mt-2 text-sm text-ink-muted">Totaux calculés sur les transactions filtrées, annulées exclues.</p>

      {detail && (
        <TransactionDetailModal
          key={`${detail.id}-${detail.updated_at}`}
          tx={detail}
          viewer={viewer}
          profileLabel={profileLabel}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          onClose={() => setDetailId(null)}
          onChanged={onReload}
          onSignSale={onSignSale}
          onCancel={onCancel}
          onEdit={(t) => {
            setDetailId(null);
            onEdit(t);
          }}
        />
      )}
    </>
  );
}
