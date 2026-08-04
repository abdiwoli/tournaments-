import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import TeamAvatar from "@/components/team/TeamAvatar";
import { ChevronUp, ChevronDown, Search, Trophy, X } from "lucide-react";

const TIME_FILTERS = [
  { key: "all", label: "All-time" },
  { key: "last3", label: "Last 3" },
  { key: "last5", label: "Last 5" },
  { key: "season", label: "This season" },
];

// Tie-breaker chains for each sortable stat (always desc, name last as alpha asc)
const TIE_BREAKERS = {
  goals: ["computedGoals", "computedAssists", "computedMotm"],
  assists: ["computedAssists", "computedGoals", "computedMotm"],
  motm: ["computedMotm", "computedGoals", "computedAssists"],
  yc: ["yellowCards", "redCards", "computedGoals"],
  rc: ["redCards", "yellowCards", "computedGoals"],
  matches: ["matchesPlayed", "computedGoals", "computedAssists"],
};

const SORT_OPTIONS = [
  { key: "goals", label: "Goals" },
  { key: "assists", label: "Assists" },
  { key: "motm", label: "MOTM" },
  { key: "yc", label: "Yellow Cards" },
  { key: "rc", label: "Red Cards" },
  { key: "matches", label: "Matches Played" },
];

export default function PlayerRankingsTable({ players, teamById, matches, goals, appearances = [] }) {
  const [timeFilter, setTimeFilter] = useState("all");
  const [sortKey, setSortKey] = useState("goals");
  const [sortDir, setSortDir] = useState("desc");
  const [query, setQuery] = useState("");

  const finalizedMatches = useMemo(
    () => matches
      .filter((m) => m.status === "completed" || m.status === "closed")
      .sort((a, b) =>
        (b.round || 0) - (a.round || 0) ||
        new Date(b.scheduled_at || b.created_date || 0) - new Date(a.scheduled_at || a.created_date || 0)
      ),
    [matches]
  );

  const closedMatchIds = useMemo(
    () => new Set(matches.filter((m) => m.status === "closed").map((m) => m.id)),
    [matches]
  );
  const completedMatchIds = useMemo(
    () => new Set(matches.filter((m) => m.status === "completed").map((m) => m.id)),
    [matches]
  );

  const windowMatchIds = useMemo(() => {
    if (timeFilter === "all" || timeFilter === "season") return null;
    const n = timeFilter === "last3" ? 3 : 5;
    return new Set(finalizedMatches.slice(0, n).map((m) => m.id));
  }, [timeFilter, finalizedMatches]);

  const rows = useMemo(() => {
    return players.map((p) => {
      const inWindow = (mid) => !windowMatchIds || windowMatchIds.has(mid);
      // Closed matches: stats + appearances from Appearance records (every appearance = played)
      const myAppearances = appearances.filter((a) => a.player_id === p.id && closedMatchIds.has(a.match_id) && inWindow(a.match_id));
      // Legacy completed matches: stats from Goal records
      const myEvents = goals.filter((g) => g.player_id === p.id && completedMatchIds.has(g.match_id) && inWindow(g.match_id));

      const goalsCount = myAppearances.reduce((s, a) => s + (a.goals || 0), 0) + myEvents.reduce((s, g) => s + (g.count ?? 1), 0);
      const assistsCount = myAppearances.reduce((s, a) => s + (a.assists || 0), 0) + myEvents.reduce((s, g) => s + (g.assists || 0), 0);
      const yellowCards = myAppearances.reduce((s, a) => s + (a.yellow_cards || 0), 0) + myEvents.reduce((s, g) => s + (g.yellow_cards || 0), 0);
      const redCards = myAppearances.reduce((s, a) => s + (a.red_cards || 0), 0) + myEvents.reduce((s, g) => s + (g.red_cards || 0), 0);

      // Matches played = every closed match with an appearance + every completed match with a goal event
      const playedMatchIds = new Set([...myAppearances.map((a) => a.match_id), ...myEvents.map((g) => g.match_id)]);
      const matchesPlayed = playedMatchIds.size;

      const motmCount = (windowMatchIds ? finalizedMatches.filter((m) => windowMatchIds.has(m.id)) : finalizedMatches)
        .filter((m) => m.motm_player_id === p.id).length;

      return {
        ...p,
        team: teamById[p.team_id],
        computedGoals: goalsCount,
        computedAssists: assistsCount,
        computedMotm: motmCount,
        yellowCards,
        redCards,
        matchesPlayed,
      };
    });
  }, [players, teamById, goals, appearances, windowMatchIds, closedMatchIds, completedMatchIds, finalizedMatches]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) =>
      p.name?.toLowerCase().includes(q) ||
      p.team?.name?.toLowerCase().includes(q)
    );
  }, [rows, query]);

  const sorted = useMemo(() => {
    const chain = TIE_BREAKERS[sortKey] || ["computedGoals"];
    const dirMul = sortDir === "desc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      // Primary stat respects sortDir
      const primary = chain[0];
      const primaryDiff = ((b[primary] || 0) - (a[primary] || 0)) * dirMul;
      if (primaryDiff !== 0) return primaryDiff;
      // Remaining tie-breakers always desc (higher is better)
      for (let i = 1; i < chain.length; i++) {
        const diff = (b[chain[i]] || 0) - (a[chain[i]] || 0);
        if (diff !== 0) return diff;
      }
      // Final: alphabetical by name (asc)
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <ChevronUp className="ml-1 inline w-3 h-3 opacity-30" />;
    return sortDir === "desc" ? <ChevronDown className="ml-1 inline w-3 h-3" /> : <ChevronUp className="ml-1 inline w-3 h-3" />;
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {TIME_FILTERS.map((f) => (
            <button key={f.key} onClick={() => setTimeFilter(f.key)} className={`rounded-full px-3 py-1.5 text-sm transition-colors ${timeFilter === f.key ? "bg-foreground text-background" : "border border-border/60 text-muted-foreground hover:text-foreground"}`}>
              {f.label}
            </button>
          ))}
        </div>
        {/* Sort selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort by</span>
          <select
            value={sortKey}
            onChange={(e) => { setSortKey(e.target.value); setSortDir("desc"); }}
            className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-sm outline-none focus:border-foreground"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            className="grid h-8 w-8 place-items-center rounded-full border border-border/60 text-muted-foreground hover:text-foreground"
            title={sortDir === "desc" ? "Descending" : "Ascending"}
          >
            {sortDir === "desc" ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Search box */}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players or teams..."
          className="w-full rounded-full border border-border/60 bg-card py-2 pl-9 pr-9 text-sm outline-none focus:border-foreground"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            title="Clear"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-3 pl-5 pr-2 text-left font-medium">Rank</th>
                <th className="py-3 pr-2 text-left font-medium">Player</th>
                <th className="py-3 px-2 text-left font-medium">Team</th>
                <th className="cursor-pointer py-3 px-2 text-center font-medium hover:text-foreground" onClick={() => toggleSort("goals")}>Goals<SortIcon col="goals" /></th>
                <th className="cursor-pointer py-3 px-2 text-center font-medium hover:text-foreground" onClick={() => toggleSort("assists")}>Assists<SortIcon col="assists" /></th>
                <th className="cursor-pointer py-3 px-2 text-center font-medium hover:text-foreground" onClick={() => toggleSort("motm")}><Trophy className="mr-0.5 inline w-3 h-3" />MOTM<SortIcon col="motm" /></th>
                <th className="cursor-pointer py-3 px-2 text-center font-medium hover:text-foreground" onClick={() => toggleSort("yc")}><span className="inline-block w-2.5 h-2.5 rounded-sm bg-yellow-400 align-middle" /><SortIcon col="yc" /></th>
                <th className="cursor-pointer py-3 px-2 text-center font-medium hover:text-foreground" onClick={() => toggleSort("rc")}><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500 align-middle" /><SortIcon col="rc" /></th>
                <th className="cursor-pointer py-3 px-2 pr-5 text-center font-medium hover:text-foreground" onClick={() => toggleSort("matches")}>Matches<SortIcon col="matches" /></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">{query ? "No players match your search." : "No players yet."}</td></tr>
              ) : sorted.map((p, i) => (
                <tr key={p.id} className="border-b border-border/40 last:border-0">
                  <td className="py-3 pl-5 pr-2 text-muted-foreground">{i + 1}</td>
                  <td className="py-3 pr-2">
                    <Link to={`/player/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                    {p.position && <div className="text-xs text-muted-foreground">{p.position}</div>}
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      {p.team && <TeamAvatar team={p.team} size={24} />}
                      <span className="truncate text-xs text-muted-foreground">{p.team?.name || "—"}</span>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-center font-semibold tabular-nums">{p.computedGoals}</td>
                  <td className="py-3 px-2 text-center font-semibold tabular-nums">{p.computedAssists}</td>
                  <td className="py-3 px-2 text-center font-semibold tabular-nums text-amber-600">{p.computedMotm}</td>
                  <td className="py-3 px-2 text-center tabular-nums text-yellow-600">{p.yellowCards}</td>
                  <td className="py-3 px-2 text-center tabular-nums text-red-600">{p.redCards}</td>
                  <td className="py-3 px-2 pr-5 text-center tabular-nums text-muted-foreground">{p.matchesPlayed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 sm:hidden">
        {sorted.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{query ? "No players match your search." : "No players yet."}</p>
        ) : sorted.map((p, i) => (
          <div key={p.id} className="rounded-2xl border border-border/60 bg-card/60 p-3 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{i + 1}</span>
              {p.team && <TeamAvatar team={p.team} size={32} />}
              <div className="min-w-0 flex-1">
                <Link to={`/player/${p.id}`} className="block truncate font-medium hover:underline">{p.name}</Link>
                <span className="truncate text-xs text-muted-foreground">{p.team?.name || "—"}</span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-6 gap-1 text-center">
              <div><div className="text-xs text-muted-foreground">G</div><div className="font-semibold tabular-nums text-green-600">{p.computedGoals}</div></div>
              <div><div className="text-xs text-muted-foreground">A</div><div className="font-semibold tabular-nums text-blue-600">{p.computedAssists}</div></div>
              <div><div className="text-xs text-muted-foreground">MOTM</div><div className="font-semibold tabular-nums text-amber-600">{p.computedMotm}</div></div>
              <div><div className="text-xs text-muted-foreground">Y</div><div className="font-semibold tabular-nums text-yellow-600">{p.yellowCards}</div></div>
              <div><div className="text-xs text-muted-foreground">R</div><div className="font-semibold tabular-nums text-red-600">{p.redCards}</div></div>
              <div><div className="text-xs text-muted-foreground">MP</div><div className="font-semibold tabular-nums text-muted-foreground">{p.matchesPlayed}</div></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}