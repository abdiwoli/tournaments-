const db = globalThis.__LOCAL_DB__;

import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

import TeamAvatar from "@/components/team/TeamAvatar";
import { ArrowLeft, Target, Zap, Trophy, Activity } from "lucide-react";


export default function PlayerDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const player = await db.entities.Player.get(id);
      const [goals, appearances, matches, teams, tournament] = await Promise.all([
        db.entities.Goal.filter({ player_id: id }, "created_date", 5000),
        db.entities.Appearance.filter({ player_id: id }, "created_date", 5000),
        db.entities.Match.filter({ tournament_id: player.tournament_id }, "round", 5000),
        db.entities.Team.filter({ tournament_id: player.tournament_id }, "created_date", 1000),
        db.entities.Tournament.get(player.tournament_id).catch(() => null),
      ]);
      const team = teams.find((t) => t.id === player.team_id);
      setData({ player, team, goals, appearances, matches, teams, tournament });
    })();
  }, [id]);

  if (!data) return <div className="py-24 text-center text-muted-foreground">Loading…</div>;

  const { player, team, goals, appearances, matches, teams, tournament } = data;
  const teamById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const matchById = Object.fromEntries(matches.map((m) => [m.id, m]));
  const finalizedMatches = matches.filter((m) => m.status === "completed" || m.status === "closed");
  const closedMatchIds = new Set(matches.filter((m) => m.status === "closed").map((m) => m.id));
  const completedMatchIds = new Set(matches.filter((m) => m.status === "completed").map((m) => m.id));

  // Closed matches: stats + appearance from Appearance records
  const myAppearances = appearances.filter((a) => closedMatchIds.has(a.match_id));
  // Legacy completed matches: stats from Goal records
  const validEvents = goals.filter((g) => completedMatchIds.has(g.match_id));

  const totalGoals = myAppearances.reduce((s, a) => s + (a.goals || 0), 0) + validEvents.reduce((s, g) => s + (g.count ?? 1), 0);
  const totalAssists = myAppearances.reduce((s, a) => s + (a.assists || 0), 0) + validEvents.reduce((s, g) => s + (g.assists || 0), 0);
  const totalYellow = myAppearances.reduce((s, a) => s + (a.yellow_cards || 0), 0) + validEvents.reduce((s, g) => s + (g.yellow_cards || 0), 0);
  const totalRed = myAppearances.reduce((s, a) => s + (a.red_cards || 0), 0) + validEvents.reduce((s, g) => s + (g.red_cards || 0), 0);
  const motmCount = finalizedMatches.filter((m) => m.motm_player_id === player.id).length;
  // Matches played = closed matches with appearance + completed matches with goal event
  const playedMatchIds = new Set([...myAppearances.map((a) => a.match_id), ...validEvents.map((g) => g.match_id)]);
  const matchesPlayed = playedMatchIds.size;

  // Group stats by match for history — include closed matches with appearances (even zero-stat)
  const statsByMatchId = {};
  myAppearances.forEach((a) => {
    const s = statsByMatchId[a.match_id] || (statsByMatchId[a.match_id] = { goals: 0, assists: 0, yellow: 0, red: 0 });
    s.goals += a.goals || 0;
    s.assists += a.assists || 0;
    s.yellow += a.yellow_cards || 0;
    s.red += a.red_cards || 0;
  });
  validEvents.forEach((g) => {
    const s = statsByMatchId[g.match_id] || (statsByMatchId[g.match_id] = { goals: 0, assists: 0, yellow: 0, red: 0 });
    s.goals += g.count ?? 1;
    s.assists += g.assists || 0;
    s.yellow += g.yellow_cards || 0;
    s.red += g.red_cards || 0;
  });

  const matchHistory = Object.entries(statsByMatchId)
    .map(([matchId, stats]) => {
      const m = matchById[matchId];
      if (!m) return null;
      const motm = m.motm_player_id === player.id;
      return { match: m, ...stats, motm };
    })
    .filter(Boolean)
    .sort((a, b) => (b.match.round || 0) - (a.match.round || 0));

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const StatCard = ({ icon, label, value }) => (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4 text-center backdrop-blur-xl">
      <div className="mx-auto mb-1 flex h-5 items-center justify-center">{icon}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );

  return (
    <div>
      <Link
        to={tournament ? `/tournament/${tournament.id}/stats` : "/"}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to stats
      </Link>

      <div className="mb-6 flex items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-foreground/90 to-foreground/60 text-xl font-semibold text-background">
          {player.name?.[0]?.toUpperCase() || "?"}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{player.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {team && <TeamAvatar team={team} size={20} />}
            <Link to={team ? `/team/${team.id}` : "#"} className="hover:underline">{team?.name || "—"}</Link>
            {player.position && <span>· {player.position}</span>}
            {tournament && <Link to={`/tournament/${tournament.id}`} className="hover:underline">· {tournament.name}</Link>}
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
        <StatCard icon={<Target className="w-4 h-4 text-green-600" />} label="Goals" value={totalGoals} />
        <StatCard icon={<Zap className="w-4 h-4 text-blue-500" />} label="Assists" value={totalAssists} />
        <StatCard icon={<Trophy className="w-4 h-4 text-amber-500" />} label="MOTM" value={motmCount} />
        <StatCard icon={<span className="inline-block w-3 h-4 rounded-sm bg-yellow-400" />} label="Yellow" value={totalYellow} />
        <StatCard icon={<span className="inline-block w-3 h-4 rounded-sm bg-red-500" />} label="Red" value={totalRed} />
        <StatCard icon={<Activity className="w-4 h-4 text-muted-foreground" />} label="Played" value={matchesPlayed} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">Match history</h2>
        {matchHistory.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No match events recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {matchHistory.map(({ match: m, goals: g, assists: a, yellow, red, motm }) => {
              const home = teamById[m.home_team_id];
              const away = teamById[m.away_team_id];
              const isHome = m.home_team_id === player.team_id;
              const badgeParts = [];
              if (g > 0) badgeParts.push(<span key="g" className="text-green-600">{g}G</span>);
              if (a > 0) badgeParts.push(<span key="a" className="text-blue-600">{a}A</span>);
              if (yellow > 0) badgeParts.push(<span key="y" className="text-yellow-600">{yellow}Y</span>);
              if (red > 0) badgeParts.push(<span key="r" className="text-red-600">{red}R</span>);
              return (
                <div key={m.id} className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl">
                  <div className="flex items-center gap-3">
                    <span className={`shrink-0 rounded-full px-2.5 py-1.5 text-xs font-bold ${badgeParts.length > 0 ? "bg-foreground text-background" : "bg-accent text-muted-foreground"}`}>
                      {badgeParts.length > 0 ? badgeParts.reduce((acc, p, i) => i === 0 ? [p] : [...acc, " · ", p], []) : "—"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <TeamAvatar team={home} size={18} />
                        <span className={`truncate font-medium ${isHome ? "" : "text-muted-foreground"}`}>{home?.name || "TBD"}</span>
                        <span className="tabular-nums font-semibold">{m.home_score} – {m.away_score}</span>
                        <TeamAvatar team={away} size={18} />
                        <span className={`truncate font-medium ${!isHome ? "" : "text-muted-foreground"}`}>{away?.name || "TBD"}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{m.round_label || `Round ${m.round}`}</span>
                        {m.scheduled_at && <span>· {formatDate(m.scheduled_at)}</span>}
                        {motm && <span className="inline-flex items-center gap-0.5 text-amber-600"><Trophy className="w-3 h-3" />MOTM</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
