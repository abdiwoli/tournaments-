const db = globalThis.__LOCAL_DB__;

import React, { useEffect, useState } from "react";
import { buildStandings } from "@/lib/standings";

const formColors = { W: "bg-emerald-500", D: "bg-amber-500", L: "bg-rose-500" };

export default function StandingsTab({ teams, matches, tournament }) {
  const rows = buildStandings(teams, matches, tournament);
  const [groupTables, setGroupTables] = useState(null);
  useEffect(() => {
    let mounted = true;
    if (tournament.format !== "group_stage_knockout") { setGroupTables(null); return undefined; }
    db.competitions.standings(tournament.id).then((result) => { if (mounted) setGroupTables(result.groups || []); }).catch(() => { if (mounted) setGroupTables([]); });
    return () => { mounted = false; };
  }, [tournament.id, tournament.format, matches]);
  if (!teams.length) return <p className="py-12 text-center text-sm text-muted-foreground">Add teams to see standings.</p>;

  if (tournament.format === "group_stage_knockout") return (
    <div className="space-y-5">
      {groupTables == null && <p className="py-8 text-center text-sm text-muted-foreground">Loading group standings…</p>}
      {groupTables?.map((group) => <div key={group.id} className="overflow-x-auto rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl">
        <h3 className="border-b border-border/60 px-4 py-3 text-sm font-semibold">{group.name}</h3>
        <table className="w-full text-sm"><thead className="text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 text-left">#</th><th className="px-2 py-3 text-left">Team</th>{["P", "W", "D", "L", "GD", "Pts"].map((heading) => <th key={heading} className="px-2 py-3 text-center">{heading}</th>)}<th className="px-4 py-3 text-left">Status</th></tr></thead>
          <tbody>{group.standings.map((row, index) => <tr key={row.team.id} className="border-t border-border/40"><td className="px-4 py-3">{index + 1}</td><td className="px-2 py-3 font-medium">{row.team.name}</td><td className="px-2 py-3 text-center">{row.played}</td><td className="px-2 py-3 text-center">{row.wins}</td><td className="px-2 py-3 text-center">{row.draws}</td><td className="px-2 py-3 text-center">{row.losses}</td><td className="px-2 py-3 text-center">{row.gd}</td><td className="px-2 py-3 text-center font-semibold">{row.points}</td><td className="px-4 py-3 text-xs text-muted-foreground">{row.team.qualification_status || "pending"}</td></tr>)}</tbody>
        </table>
      </div>)}
    </div>
  );

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl sm:block">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="px-4 py-3 text-left font-medium">#</th>
              <th className="px-2 py-3 text-left font-medium">Team</th>
              {["P", "W", "D", "L", "GF", "GA", "GD", "Pts"].map((h) => <th key={h} className="px-2 py-3 text-center font-medium">{h}</th>)}
              <th className="px-4 py-3 text-left font-medium">Form</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.team.id} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-3 font-medium">{r.team.name}</td>
                {[r.played, r.wins, r.draws, r.losses, r.gf, r.ga, r.gd].map((v, k) => <td key={k} className="px-2 py-3 text-center text-muted-foreground">{v}</td>)}
                <td className="px-2 py-3 text-center font-semibold">{r.points}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {r.form.map((f, k) => <span key={k} className={`h-2 w-2 rounded-full ${formColors[f]}`} />)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 sm:hidden">
        {rows.map((r, i) => (
          <div key={r.team.id} className="rounded-2xl border border-border/60 bg-card/60 p-3 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{r.team.name}</span>
              <span className="font-semibold tabular-nums">{r.points}<span className="ml-1 text-xs font-normal text-muted-foreground">pts</span></span>
            </div>
            <div className="mt-2 grid grid-cols-5 gap-1 text-center text-xs">
              <div><div className="text-muted-foreground">P</div><div className="font-medium tabular-nums">{r.played}</div></div>
              <div><div className="text-muted-foreground">W</div><div className="font-medium tabular-nums text-emerald-600">{r.wins}</div></div>
              <div><div className="text-muted-foreground">D</div><div className="font-medium tabular-nums text-amber-600">{r.draws}</div></div>
              <div><div className="text-muted-foreground">L</div><div className="font-medium tabular-nums text-rose-600">{r.losses}</div></div>
              <div><div className="text-muted-foreground">GD</div><div className="font-medium tabular-nums">{r.gd > 0 ? `+${r.gd}` : r.gd}</div></div>
            </div>
            {r.form.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Form:</span>
                <div className="flex gap-1">
                  {r.form.map((f, k) => <span key={k} className={`h-2 w-2 rounded-full ${formColors[f]}`} />)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
