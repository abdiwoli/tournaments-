import React from "react";
import TeamAvatar from "@/components/team/TeamAvatar";

export default function PlayerStatsTable({ players, teamById }) {
  const rows = players
    .map((p) => ({ ...p, team: teamById[p.team_id] }))
    .sort((a, b) => (b.goals || 0) - (a.goals || 0) || (b.assists || 0) - (a.assists || 0));

  return (
    <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-3 pl-5 pr-2 text-left font-medium">#</th>
              <th className="py-3 pr-2 text-left font-medium">Player</th>
              <th className="py-3 px-2 text-left font-medium">Team</th>
              <th className="py-3 px-2 text-center font-medium">G</th>
              <th className="py-3 px-2 text-center font-medium">A</th>
              <th className="py-3 px-2 text-center font-medium">YC</th>
              <th className="py-3 px-2 text-center font-medium">RC</th>
              <th className="py-3 px-2 pr-5 text-center font-medium">MP</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="py-10 text-center text-muted-foreground">No players yet.</td></tr>
            ) : rows.map((p, i) => (
              <tr key={p.id} className="border-b border-border/40 last:border-0">
                <td className="py-3 pl-5 pr-2 text-muted-foreground">{i + 1}</td>
                <td className="py-3 pr-2">
                  <div className="font-medium">{p.name}</div>
                  {p.position && <div className="text-xs text-muted-foreground">{p.position}</div>}
                </td>
                <td className="py-3 px-2">
                  <div className="flex items-center gap-2">
                    {p.team && <TeamAvatar team={p.team} size={24} />}
                    <span className="truncate text-xs text-muted-foreground">{p.team?.name || "—"}</span>
                  </div>
                </td>
                <td className="py-3 px-2 text-center font-semibold tabular-nums">{p.goals || 0}</td>
                <td className="py-3 px-2 text-center font-semibold tabular-nums">{p.assists || 0}</td>
                <td className="py-3 px-2 text-center tabular-nums text-yellow-600">{p.yellow_cards || 0}</td>
                <td className="py-3 px-2 text-center tabular-nums text-red-600">{p.red_cards || 0}</td>
                <td className="py-3 px-2 pr-5 text-center tabular-nums text-muted-foreground">{p.matches_played || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}