const db = globalThis.__LOCAL_DB__;

import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

import TeamAvatar from "@/components/team/TeamAvatar";
import { ArrowLeft, Target, Zap, Trophy, Activity, ArrowUpDown, Filter, Check, X, ChevronDown } from "lucide-react";

export default function PlayerDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);

  // State to track if match history should be sorted by goals
  const [sortByGoals, setSortByGoals] = useState(false);

  // States for managing selected rounds and popover visibility
  const [selectedRounds, setSelectedRounds] = useState([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

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

  // Base match history array
  const rawMatchHistory = Object.entries(statsByMatchId)
    .map(([matchId, stats]) => {
      const m = matchById[matchId];
      if (!m) return null;
      const motm = m.motm_player_id === player.id;
      return { match: m, ...stats, motm };
    })
    .filter(Boolean);

  // Extract all unique available rounds played by the player
  const availableRounds = Array.from(
    new Set(rawMatchHistory.map((item) => String(item.match.round_label || `Round ${item.match.round}`)))
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // Helper functions for round selection management
  const toggleRoundSelection = (roundName) => {
    setSelectedRounds((prev) =>
      prev.includes(roundName)
        ? prev.filter((r) => r !== roundName)
        : [...prev, roundName]
    );
  };

  const removeSingleRound = (roundName) => {
    setSelectedRounds((prev) => prev.filter((r) => r !== roundName));
  };

  const selectAllRounds = () => setSelectedRounds([...availableRounds]);
  const clearAllRounds = () => setSelectedRounds([]);

  // Filter match history based on selected rounds (if none selected -> show all)
  const filteredMatchHistory = selectedRounds.length > 0
    ? rawMatchHistory.filter((item) => {
        const roundLabel = String(item.match.round_label || `Round ${item.match.round}`);
        return selectedRounds.includes(roundLabel);
      })
    : rawMatchHistory;

  // Calculate total goals scored ONLY in the selected rounds
  const sumGoalsInSelectedRounds = filteredMatchHistory.reduce((sum, item) => sum + item.goals, 0);

  // Sort match history (by goals descending or round descending)
  const matchHistory = [...filteredMatchHistory].sort((a, b) => {
    if (sortByGoals) {
      if (b.goals !== a.goals) {
        return b.goals - a.goals;
      }
    }
    return (b.match.round || 0) - (a.match.round || 0);
  });

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
    <div className="relative">
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

      {/* Round Filter Bar */}
      <div className="mb-6 rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          <button
            onClick={() => setIsFilterOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl bg-foreground text-background px-3.5 py-2 text-xs font-semibold shadow-sm hover:opacity-90 transition-all"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Select Rounds</span>
            {selectedRounds.length > 0 && (
              <span className="ml-1 rounded-full bg-green-500 text-white px-2 py-0.5 text-[10px] font-bold">
                {selectedRounds.length}
              </span>
            )}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isFilterOpen ? "rotate-180" : ""}`} />
          </button>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground text-xs">
              {selectedRounds.length > 0 ? "Sum for selected:" : "Total overall:"}
            </span>
            <span className="text-base font-bold text-green-600 dark:text-green-400">
              {sumGoalsInSelectedRounds} Goal{sumGoalsInSelectedRounds === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {selectedRounds.length > 0 ? (
          <div className="mt-3 pt-3 border-t border-border/40 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Active rounds:</span>
            {selectedRounds.map((rnd) => (
              <span
                key={rnd}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400"
              >
                {rnd}
                <button
                  onClick={() => removeSingleRound(rnd)}
                  className="hover:bg-green-500/20 rounded p-0.5 transition-colors"
                  title="Remove round"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              onClick={clearAllRounds}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear filter
            </button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Click "Select Rounds" above to filter statistics for specific matchday rounds.
          </p>
        )}
      </div>

      {/* Round Selector Modal Overlay */}
      {isFilterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-5 shadow-2xl space-y-4">
            
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-green-500" />
                <h3 className="font-semibold text-sm">Choose Rounds to Calculate</h3>
              </div>
              <button
                onClick={() => setIsFilterOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{selectedRounds.length} of {availableRounds.length} selected</span>
              <div className="space-x-3">
                <button onClick={selectAllRounds} className="hover:text-foreground underline font-medium">
                  Select All
                </button>
                <button onClick={clearAllRounds} className="hover:text-foreground underline font-medium">
                  Clear
                </button>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {availableRounds.map((rnd) => {
                const isSelected = selectedRounds.includes(rnd);
                return (
                  <button
                    key={rnd}
                    onClick={() => toggleRoundSelection(rnd)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      isSelected
                        ? "bg-green-600 text-white font-semibold shadow-sm"
                        : "bg-muted/50 hover:bg-muted text-foreground"
                    }`}
                  >
                    <span>{rnd}</span>
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-border/60">
              <button
                onClick={() => setIsFilterOpen(false)}
                className="w-full py-2 rounded-xl bg-foreground text-background text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                Apply Filter ({selectedRounds.length > 0 ? `${selectedRounds.length} Rounds` : "Show All"})
              </button>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Match history {selectedRounds.length > 0 ? `(${selectedRounds.length} selected)` : ""}
          </h2>
          <button
            onClick={() => setSortByGoals((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition-all ${
              sortByGoals
                ? "border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400"
                : "border-border/60 bg-card/60 text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <ArrowUpDown className="h-3 w-3" />
            {sortByGoals ? "Sorted by Goals" : "Sort by Goals"}
          </button>
        </div>

        {matchHistory.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No matches found for the selected rounds.</p>
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