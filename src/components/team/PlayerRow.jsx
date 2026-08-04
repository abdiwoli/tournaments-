const db = globalThis.__LOCAL_DB__;

import React from "react";
import { Link } from "react-router-dom";

import { Trash2 } from "lucide-react";

export default function PlayerRow({ player, canEdit, reload }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-xs font-semibold">{player.number ?? "–"}</span>
      <div className="min-w-0 flex-1">
        <Link to={`/player/${player.id}`} className="truncate font-medium hover:underline">{player.name}</Link>
        <div className="text-xs text-muted-foreground">{[player.position, player.nationality].filter(Boolean).join(" · ") || "Player"}</div>
      </div>
      {[
        { label: "Goals", value: player.computedGoals ?? 0, color: "text-green-600" },
        { label: "Assists", value: player.computedAssists ?? 0, color: "text-blue-600" },
        { label: "Yellow", value: player.computedYellow ?? 0, color: "text-yellow-600" },
        { label: "Red", value: player.computedRed ?? 0, color: "text-red-600" },
      ].map((s) => (
        <div key={s.label} className="flex flex-col items-center">
          <span className={`text-lg font-semibold tabular-nums ${s.color}`}>{s.value}</span>
          <span className="w-14 text-center text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</span>
        </div>
      ))}
      {canEdit && (
        <button onClick={async () => { await db.entities.Player.delete(player.id); await reload(); }} aria-label="Remove player" className="text-muted-foreground hover:text-destructive">
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
