// src/components/TransactionsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { parseDateStr } from "../lib/dates";
import {
  PROPERTY_TYPE_LABELS,
  SIDE_LABELS,
  TRANSACTION_KIND_LABELS,
  DISPLAY_STATUS_LABELS,
  ACTED_LOCK_MESSAGE,
  canDeleteTransaction,
  canEditTransaction,
  deductionsTotal,
  displayStatus,
  groupParticipantsByUser,
  participantsVisibleTo,
  pendingStats,
  isActedTransaction,
  isCancelled,
  netFeesHt,
  participantAmount,
  round2,
  transactionFeesHt,
} from "../lib/transactions";
import { DeductionAddForm, FeesBreakdown } from "./TransactionFormModal";

const cell = { padding: "8px 10px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top", fontSize: "0.86rem" };
const head = { ...cell, fontWeight: 700, background: "#f9fafb", whiteSpace: "nowrap", textAlign: "left" };
const sub = { fontSize: "0.76rem", color: "#6b7280", fontWeight: 400 };
const fieldStyle = {
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  fontSize: "0.9rem",
  background: "#fff",
  boxSizing: "border-box",
};

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
        <span style={sub}>{rental ? "Bailleur" : "Vendeur"} :</span> {sellerDisplay(t)}
      </div>
      <div>
        <span style={sub}>{rental ? "Locataire" : "Acquéreur"} :</span> {buyerDisplay(t)}
      </div>
    </>
  );
};

// Une ligne par personne (entrée + sortie regroupées) ; le détail par côté reste dans la fiche.
const ParticipantsCell = ({ t, viewer, net, profileLabel, formatCurrency }) =>
  groupParticipantsByUser(participantsVisibleTo(t.participants, viewer)).map((g) => (
    <div key={g.user_id} style={{ whiteSpace: "nowrap" }}>
      {shortName(profileLabel(g.user_id))} {g.share_pct} % · {formatCurrency(participantAmount(net, g.share_pct))}
    </div>
  ));

const StatusBadge = ({ tx }) => {
  const status = displayStatus(tx);
  const colors = {
    promise: ["#fef3c7", "#92400e"],
    sold: ["#ecfdf5", "#047857"],
    rented: ["#eff6ff", "#1d4ed8"],
    cancelled: ["#fef2f2", "#b91c1c"],
  }[status];
  return (
    <span style={{ background: colors[0], color: colors[1], borderRadius: 999, padding: "2px 8px", fontSize: "0.78rem", whiteSpace: "nowrap" }}>
      {DISPLAY_STATUS_LABELS[status]}
    </span>
  );
};

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
  const actedLocked = !isAdmin && isActedTransaction(tx);
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
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal admin-modal-xl" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 860 }}>
        <div className="admin-modal-head">
          <div>
            <h2>
              {TRANSACTION_KIND_LABELS[tx.kind]} · {propertyDisplay(tx)}
            </h2>
            <p className="admin-modal-sub">
              <StatusBadge tx={tx} />{" "}
              {tx.validated_at
                ? `Validée le ${formatDate(tx.validated_at)}${tx.validated_by ? ` par ${profileLabel(tx.validated_by)}` : ""}`
                : "Non validée"}
            </p>
          </div>
          <button type="button" className="btn-outline" onClick={onClose}>
            Fermer
          </button>
        </div>

        {actedLocked && (
          <div className="admin-alert" style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb" }}>
            {ACTED_LOCK_MESSAGE}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, fontSize: "0.9rem" }}>
          <div><strong>{isRental ? "Bailleur" : "Vendeur"} :</strong> {sellerDisplay(tx)}</div>
          <div><strong>{isRental ? "Locataire" : "Acquéreur"} :</strong> {buyerDisplay(tx)}</div>
          <div><strong>{isRental ? "Loyer CC" : "Prix"} :</strong> {tx.price !== null && tx.price !== undefined ? formatCurrency(tx.price) : "—"}</div>
          <div><strong>{isRental ? "Date du bail" : "Date de vente"} :</strong> {tx.deed_date ? formatDate(tx.deed_date) : "—"}</div>
          {!isRental && tx.preliminary_date && <div><strong>Promesse :</strong> {formatDate(tx.preliminary_date)}</div>}
          <div><strong>Honoraires :</strong> {formatCurrency(feesHt)} HT · {formatCurrency(tx.fees_ttc || 0)} TTC ({Number(tx.vat_rate)} %)</div>
          {tx.property?.property_type && (
            <div><strong>Bien :</strong> {PROPERTY_TYPE_LABELS[tx.property.property_type]}{tx.property.surface ? ` · ${tx.property.surface} m²` : ""}</div>
          )}
          {tx.cancel_reason && <div style={{ color: "#b91c1c" }}><strong>Motif d'annulation :</strong> {tx.cancel_reason}</div>}
          {tx.notes && <div style={{ gridColumn: "1 / -1" }}><strong>Notes :</strong> {tx.notes}</div>}
        </div>

        <h3>Déductions avant commission</h3>
        {(tx.deductions || []).length === 0 && <p style={{ fontSize: "0.88rem", color: "#6b7280" }}>Aucune déduction.</p>}
        {(tx.deductions || []).map((d) => (
          <div key={d.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6, fontSize: "0.9rem" }}>
            <span>
              <strong>{d.label}</strong>
              {d.beneficiary ? ` · ${d.beneficiary}` : ""} · {formatCurrency(d.amount_ht)} HT
              <br />
              <span style={{ color: "#6b7280" }}>{d.reason}</span>
            </span>
            {editable && (
              <button type="button" className="btn-outline-small" disabled={busy} onClick={() => deleteDeduction(d.id)}>
                Supprimer
              </button>
            )}
          </div>
        ))}
        {editable && <DeductionAddForm onAdd={addDeduction} disabled={busy} />}

        <h3>Calcul des commissions</h3>
        <FeesBreakdown
          feesHt={feesHt}
          deductions={tx.deductions || []}
          participants={participantsVisibleTo(tx.participants, viewer)}
          profileLabel={profileLabel}
          formatCurrency={formatCurrency}
        />

        {isAdmin && !isCancelled(tx) && (tx.participants || []).length > 0 && (
          <div style={{ marginTop: 12 }}>
            <strong style={{ fontSize: "0.9rem" }}>Taux de commission exceptionnels</strong>
            <p className="admin-modal-sub" style={{ margin: "2px 0 6px" }}>
              Vide = taux du profil du commercial selon le côté. Un taux exceptionnel recalcule sa commission.
            </p>
            {(tx.participants || []).map((p) => (
              <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4, fontSize: "0.88rem" }}>
                <span style={{ minWidth: 180 }}>
                  {profileLabel(p.user_id) || "—"} · {SIDE_LABELS[p.side]} {Number(p.share_pct)} %
                </span>
                <input
                  style={{ ...fieldStyle, width: 90 }}
                  inputMode="decimal"
                  placeholder="profil"
                  aria-label={`Taux exceptionnel ${profileLabel(p.user_id) || ""} ${SIDE_LABELS[p.side]}`}
                  value={rates[p.id] ?? ""}
                  onChange={(e) => setRates((r) => ({ ...r, [p.id]: e.target.value }))}
                />
                <span>%</span>
                <button type="button" className="btn-outline-small" disabled={busy} onClick={() => saveRate(p.id)}>
                  Appliquer
                </button>
              </div>
            ))}
            {tx.status === "cashed" && (
              <button type="button" className="btn-outline-small" style={{ marginTop: 8 }} disabled={busy} onClick={recalculateCommissions}>
                Recalculer les commissions aux taux actuels
              </button>
            )}
          </div>
        )}

        {editable && status === "promise" && (
          <div style={{ marginTop: 14 }}>
            <button type="button" className="btn-primary" onClick={() => onSignSale(tx)}>
              Marquer comme vendue
            </button>
            <span className="admin-modal-sub" style={{ marginLeft: 8 }}>
              Seule la date de vente est demandée.
            </span>
          </div>
        )}

        {isAdmin && !isCancelled(tx) && tx.status === "cashed" && (
          <>
            <h3>Admin</h3>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", fontSize: "0.85rem" }}>
              <label>
                Encaissement des honoraires
                <br />
                <input type="date" style={fieldStyle} value={feesReceivedAt} onChange={(e) => setFeesReceivedAt(e.target.value)} />
              </label>
              <button type="button" className="btn-secondary" disabled={busy} onClick={saveFeesReceivedAt}>Enregistrer</button>
            </div>
            <p className="admin-modal-sub">Par défaut égale à la date {isRental ? "du bail" : "de vente"}. Sert au CA annuel.</p>
          </>
        )}

        {error && <p className="error-text" style={{ marginTop: 12 }}>{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
          {canDelete && (
            <button type="button" className="btn-outline" disabled={busy} onClick={deleteTx}>Supprimer</button>
          )}
          {editable && (
            <button type="button" className="btn-outline" disabled={busy} onClick={() => onCancel(tx)}>
              {status === "promise" ? "Promesse annulée" : "Annuler la transaction"}
            </button>
          )}
          {editable && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => onEdit(tx)}>Modifier</button>
          )}
          {isAdmin && !tx.validated_at && !isCancelled(tx) && (
            <button type="button" className="btn-primary" disabled={busy} onClick={validateTx}>Valider</button>
          )}
        </div>
        {!editable && !actedLocked && !isCancelled(tx) && tx.validated_at && (
          <p className="admin-modal-sub" style={{ textAlign: "right" }}>Transaction validée : lecture seule.</p>
        )}
      </div>
    </div>
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
  focusTransactionId,
  onFocusHandled,
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
  const [detailId, setDetailId] = useState(null);

  useEffect(() => {
    if (!focusTransactionId) return;
    setDetailId(focusTransactionId);
    onFocusHandled?.();
  }, [focusTransactionId, onFocusHandled]);
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
      .filter((t) => statusFilter === "all" || displayStatus(t) === statusFilter)
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

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 className="dash-page-title" style={{ margin: 0 }}>Transactions</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn-outline" onClick={onReload} disabled={loading}>Actualiser</button>
          <button type="button" className="btn-primary" onClick={() => onNew("sale")}>Nouvelle vente</button>
          <button type="button" className="btn-primary" onClick={() => onNew("rental")}>Nouvelle location</button>
        </div>
      </div>

      <div className="filters-row" style={{ justifyContent: "flex-start" }}>
        <div className="filter-group">
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
            <option value="all">Tous types</option>
            <option value="sale">Ventes</option>
            <option value="rental">Locations</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Tous statuts</option>
            {Object.entries(DISPLAY_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          {(isAdmin || isManager) && (
            <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
              <option value="all">Tous commerciaux</option>
              {(filterProfiles || []).map((p) => (
                <option key={p.id} value={p.id}>{profileLabel(p.id)}</option>
              ))}
            </select>
          )}
        </div>
        <div className="filter-group">
          <span>Période sur</span>
          <select value={dateField} onChange={(e) => setDateField(e.target.value)}>
            <option value="deed_date">date de vente / bail</option>
            <option value="fees_received_at">date d'encaissement</option>
          </select>
          <input type="date" style={fieldStyle} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span>au</span>
          <input type="date" style={fieldStyle} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {loadError && <p className="error-text">{loadError}</p>}

      <style>{`
        .tx-cards { display: none; }
        @media (max-width: 1279px) {
          .tx-table-wrap { display: none; }
          .tx-cards { display: flex; flex-direction: column; gap: 10px; }
        }
      `}</style>

      <div className="tx-table-wrap" style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Date", "Type", "Bien", "Parties", "Prix", "Honoraires", "Base nette HT", "Participants", "Statut", "Validée"].map((h) => (
                <th key={h} style={head}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td style={{ ...cell, color: "#6b7280" }} colSpan={10}>
                  {loading ? "Chargement…" : "Aucune transaction."}
                </td>
              </tr>
            )}
            {filtered.map((t) => {
              const r = rowData(t);
              return (
                <tr key={t.id} onClick={() => setDetailId(t.id)} style={{ cursor: "pointer", opacity: isCancelled(t) ? 0.55 : 1 }}>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>{formatDate(mainDate(t))}</td>
                  <td style={cell}>{TRANSACTION_KIND_LABELS[t.kind]}</td>
                  <td style={cell}>{propertyDisplay(t)}</td>
                  <td style={cell}>
                    <PartiesCell t={t} />
                  </td>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>{t.price !== null && t.price !== undefined ? formatCurrency(t.price) : "—"}</td>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>
                    {formatCurrency(t.fees_ttc || 0)}
                    <div style={sub}>{formatCurrency(r.feesHt)} HT</div>
                  </td>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>
                    <strong>{formatCurrency(r.net)}</strong>
                    {r.ded > 0 && <div style={sub}>− {formatCurrency(r.ded)} de déductions</div>}
                  </td>
                  <td style={cell}>
                    <ParticipantsCell t={t} viewer={viewer} net={r.net} profileLabel={profileLabel} formatCurrency={formatCurrency} />
                  </td>
                  <td style={cell}><StatusBadge tx={t} /></td>
                  <td style={cell}>{t.validated_at ? "Oui" : "Non"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="tx-cards">
        {filtered.length === 0 && (
          <p style={{ color: "#6b7280" }}>{loading ? "Chargement…" : "Aucune transaction."}</p>
        )}
        {filtered.map((t) => {
          const r = rowData(t);
          return (
            <div
              key={t.id}
              onClick={() => setDetailId(t.id)}
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 12,
                fontSize: "0.88rem",
                cursor: "pointer",
                opacity: isCancelled(t) ? 0.55 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong>
                  {TRANSACTION_KIND_LABELS[t.kind]} · {formatDate(mainDate(t))}
                </strong>
                <StatusBadge tx={t} />
              </div>
              <div style={{ marginTop: 4 }}>{propertyDisplay(t)}</div>
              <div style={{ marginTop: 6 }}>
                <PartiesCell t={t} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                <span>
                  {formatCurrency(t.fees_ttc || 0)} TTC
                  <div style={sub}>{formatCurrency(r.feesHt)} HT</div>
                </span>
                <span style={{ textAlign: "right" }}>
                  Base <strong>{formatCurrency(r.net)}</strong>
                  {r.ded > 0 && <div style={sub}>− {formatCurrency(r.ded)} de déductions</div>}
                </span>
              </div>
              <div style={{ marginTop: 8 }}>
                <ParticipantsCell t={t} viewer={viewer} net={r.net} profileLabel={profileLabel} formatCurrency={formatCurrency} />
              </div>
              <div style={{ ...sub, marginTop: 6 }}>
                {t.price !== null && t.price !== undefined ? `Prix ${formatCurrency(t.price)} · ` : ""}
                {t.validated_at ? "Validée" : "Non validée"}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 14 }}>
        {totals.map(([label, value]) => (
          <div key={label} className="conversion-card">
            <div className="conversion-card-title">{label}</div>
            <div className="conversion-card-value">{formatCurrency(value)}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: "0.8rem", color: "#6b7280" }}>
        Totaux calculés sur les transactions filtrées, annulées exclues.
      </p>

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
