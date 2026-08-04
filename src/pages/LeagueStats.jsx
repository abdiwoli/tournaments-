const db = globalThis.__LOCAL_DB__;

import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

import { buildStandings } from "@/lib/standings";
import { computePlayerStats } from "@/lib/playerStats";
import TeamAvatar from "@/components/team/TeamAvatar";
import StatList from "@/components/stats/StatList";
import PlayerRankingsTable from "@/components/stats/PlayerRankingsTable";
import { BarChart3 } from "lucide-react";

export default function LeagueStats() {
  const { id } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const [tournament, teams, players, matches, goals, appearances] = await Promise.all([
        db.entities.Tournament.get(id),
        db.entities.Team.filter({ tournament_id: id }, "created_date", 1000),
        db.entities.Player.filter({ tournament_id: id }, "-goals", 2000),
        db.entities.Match.filter({ tournament_id: id }, "round", 5000),
        db.entities.Goal.filter({ tournament_id: id }, "created_date", 5000),
        db.entities.Appearance.filter({ tournament_id: id }, "created_date", 10000),
      ]);
      setData({ tournament, teams, players, matches, goals, appearances });
    })();
  }, [id]);

  if (!data) return <div className="py-24 text-center text-muted-foreground">Loading…</div>;

  const { tournament, teams, players, matches, goals, appearances } = data;
  const teamById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const withTeam = (p) => ({ ...p, team: teamById[p.team_id] });

  const computed = computePlayerStats(players, goals, matches, appearances);
  const topScorers = computed.filter((p) => p.computedGoals > 0).sort((a, b) => b.computedGoals - a.computedGoals).slice(0, 10).map(withTeam);
  const topAssists = computed.filter((p) => p.computedAssists > 0).sort((a, b) => b.computedAssists - a.computedAssists).slice(0, 10).map(withTeam);

  const standings = buildStandings(teams, matches, tournament);
  const teamGoals = teams
    .map((t) => ({ team: t, goals: goals.filter((g) => g.team_id === t.id).reduce((s, g) => s + (g.count ?? 1), 0) }))
    .sort((a, b) => b.goals - a.goals);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-foreground text-background"><BarChart3 className="w-5 h-5" /></span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tournament.name}</h1>
          <p className="text-sm text-muted-foreground">Statistics & rankings</p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatList title="Top scorers" items={topScorers} valueKey="computedGoals" valueLabel="goals" />
        <StatList title="Top assists" items={topAssists} valueKey="computedAssists" valueLabel="assists" />
      </div>

      <div className="mb-6">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">Team rankings</h2>
        <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-3 pl-5 pr-2 text-left font-medium">#</th>
                  <th className="py-3 pr-2 text-left font-medium">Team</th>
                  <th className="py-3 px-2 text-center font-medium">P</th>
                  <th className="py-3 px-2 text-center font-medium">W</th>
                  <th className="py-3 px-2 text-center font-medium">D</th>
                  <th className="py-3 px-2 text-center font-medium">L</th>
                  <th className="py-3 px-2 text-center font-medium">GF</th>
                  <th className="py-3 px-2 text-center font-medium">GA</th>
                  <th className="py-3 px-2 text-center font-medium">GD</th>
                  <th className="py-3 px-2 pr-5 text-center font-medium">PTS</th>
                </tr>
              </thead>
              <tbody>
                {standings.length === 0 ? (
                  <tr><td colSpan={10} className="py-10 text-center text-muted-foreground">No teams yet.</td></tr>
                ) : standings.map((r, i) => (
                  <tr key={r.team.id} className="border-b border-border/40 last:border-0">
                    <td className="py-3 pl-5 pr-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-3 pr-2">
                      <div className="flex items-center gap-2">
                        <TeamAvatar team={r.team} size={28} />
                        <Link to={`/team/${r.team.id}`} className="truncate font-medium hover:underline">{r.team.name}</Link>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center tabular-nums">{r.played}</td>
                    <td className="py-3 px-2 text-center tabular-nums">{r.wins}</td>
                    <td className="py-3 px-2 text-center tabular-nums">{r.draws}</td>
                    <td className="py-3 px-2 text-center tabular-nums">{r.losses}</td>
                    <td className="py-3 px-2 text-center tabular-nums">{r.gf}</td>
                    <td className="py-3 px-2 text-center tabular-nums">{r.ga}</td>
                    <td className="py-3 px-2 text-center tabular-nums">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                    <td className="py-3 px-2 pr-5 text-center font-semibold tabular-nums">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">Player stats</h2>
        <PlayerRankingsTable players={players} teamById={teamById} matches={matches} goals={goals} appearances={appearances} tournament={tournament} />
      </div>
    </div>
  );
}
