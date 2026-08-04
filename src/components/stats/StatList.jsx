import React from "react";
import { Link } from "react-router-dom";
import TeamAvatar from "@/components/team/TeamAvatar";

export default function StatList({ title, items, valueKey, valueLabel }) {
  return (
    <div className="rounded-3xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-3 text-sm">
              <span className="w-4 text-muted-foreground">{i + 1}</span>
              {it.team && <TeamAvatar team={it.team} size={28} />}
              <span className="min-w-0 flex-1">
                {it.id ? (
                  <Link to={`/player/${it.id}`} className="block truncate font-medium hover:underline">{it.name}</Link>
                ) : (
                  <span className="block truncate font-medium">{it.name}</span>
                )}
                {it.team && <span className="block truncate text-xs text-muted-foreground">{it.team.name}</span>}
              </span>
              <span className="font-semibold tabular-nums">{it[valueKey]}<span className="ml-1 text-xs font-normal text-muted-foreground">{valueLabel}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}