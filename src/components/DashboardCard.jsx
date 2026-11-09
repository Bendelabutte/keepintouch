// src/components/DashboardCard.jsx
// Tableau de bord : les 5 fiches les plus urgentes d'une catégorie.
import React from "react";
import { DelayBadge } from "./CompactRow";
import { Button, Card } from "./ui";

export default function DashboardCard({ title, list, getFollowupInfo, onGo }) {
  return (
    <Card padding="none" className="flex h-full flex-col">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
      </div>
      {list.length === 0 ? (
        <p className="flex-1 px-5 py-6 text-sm text-ink-muted">Aucun client à relancer.</p>
      ) : (
        <ul className="flex-1 divide-y divide-line">
          {list.map((c) => {
            const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "(Sans nom)";
            const info = getFollowupInfo(c);
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="min-w-0 truncate font-medium text-ink">{name}</span>
                <DelayBadge diffDays={info.diffDays} delayLabel={info.delayLabel} />
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-line px-5 py-3">
        <Button variant="secondary" size="sm" onClick={onGo}>
          Voir les fiches à relancer
        </Button>
      </div>
    </Card>
  );
}
