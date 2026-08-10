import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import TeamAvatar from "@/components/team/TeamAvatar";
import { ChevronUp, ChevronDown, Search, Trophy, X, Filter } from "lucide-react";

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

export default function PlayerRankingsTable({
  players = [],
  teamById = {},
  matches = [],
  goals = [],
  appearances = [],
}) {
  const [selectedRounds, setSelectedRounds] = useState([]); // Empty = All Rounds
  const [isRoundOverlayOpen, setIsRoundOverlayOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("all"); // Team Filter State
  const [sortKey, setSortKey] = useState("goals");
  const [sortDir, setSortDir] = useState("desc");
  const [query, setQuery] = useState("");

  // Unique sorted list of available round numbers
  const availableRounds = useMemo(() => {
    const rounds = new Set();
    matches.forEach((m) => {
      if (m.round !== undefined && m.round !== null && m.round !== "") {
        rounds.add(Number(m.round));
      }
    });
    return Array.from(rounds).sort((a, b) => a - b);
  }, [matches]);

  const finalizedMatches = useMemo(
    () =>
      matches
        .filter((m) => m.status === "completed" || m.status === "closed")
        .sort(
          (a, b) =>
            (b.round || 0) - (a.round || 0) ||
            new Date(b.scheduled_at || b.created_date || 0) -
              new Date(a.scheduled_at || a.created_date || 0)
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

  // Compute active match IDs matching selected multi-rounds
  const activeMatchIds = useMemo(() => {
    let matchesSubset = finalizedMatches;

    if (selectedRounds.length > 0) {
      matchesSubset = matchesSubset.filter((m) =>
        selectedRounds.includes(Number(m.round))
      );
    }

    return new Set(matchesSubset.map((m) => m.id));
  }, [finalizedMatches, selectedRounds]);

  const toggleRound = (roundNum) => {
    setSelectedRounds((prev) =>
      prev.includes(roundNum)
        ? prev.filter((r) => r !== roundNum)
        : [...prev, roundNum]
    );
  };

  const handleSelectAll = () => {
    if (selectedRounds.length === availableRounds.length) {
      setSelectedRounds([]);
    } else {
      setSelectedRounds([...availableRounds]);
    }
  };

  const rows = useMemo(() => {
    return players.map((p) => {
      const inActiveMatches = (mid) => activeMatchIds.has(mid);

      const myAppearances = appearances.filter(
        (a) =>
          a.player_id === p.id &&
          closedMatchIds.has(a.match_id) &&
          inActiveMatches(a.match_id)
      );

      const myEvents = goals.filter(
        (g) =>
          g.player_id === p.id &&
          completedMatchIds.has(g.match_id) &&
          inActiveMatches(g.match_id)
      );

      const goalsCount =
        myAppearances.reduce((s, a) => s + (a.goals || 0), 0) +
        myEvents.reduce((s, g) => s + (g.count ?? 1), 0);

      const assistsCount =
        myAppearances.reduce((s, a) => s + (a.assists || 0), 0) +
        myEvents.reduce((s, g) => s + (g.assists || 0), 0);

      const yellowCards =
        myAppearances.reduce((s, a) => s + (a.yellow_cards || 0), 0) +
        myEvents.reduce((s, g) => s + (g.yellow_cards || 0), 0);

      const redCards =
        myAppearances.reduce((s, a) => s + (a.red_cards || 0), 0) +
        myEvents.reduce((s, g) => s + (g.red_cards || 0), 0);

      const playedMatchIds = new Set([
        ...myAppearances.map((a) => a.match_id),
        ...myEvents.map((g) => g.match_id),
      ]);
      const matchesPlayed = playedMatchIds.size;

      // Deduplicate MOTM across both data sources per match
      const motmMatchIds = new Set([
        ...myAppearances.filter((a) => a.motm).map((a) => a.match_id),
        ...finalizedMatches
          .filter(
            (m) => activeMatchIds.has(m.id) && m.motm_player_id === p.id
          )
          .map((m) => m.id),
      ]);
      const motmCount = motmMatchIds.size;

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
  }, [
    players,
    teamById,
    goals,
    appearances,
    activeMatchIds,
    closedMatchIds,
    completedMatchIds,
    finalizedMatches,
  ]);

  // Unique list of available teams sorted alphabetically
  const availableTeams = useMemo(() => {
    if (Object.keys(teamById).length > 0) {
      return Object.values(teamById).sort((a, b) =>
        (a.name || "").localeCompare(b.name || "")
      );
    }
    const teamMap = new Map();
    rows.forEach((r) => {
      if (r.team_id && r.team) teamMap.set(r.team_id, r.team);
    });
    return Array.from(teamMap.values()).sort((a, b) =>
      (a.name || "").localeCompare(b.name || "")
    );
  }, [teamById, rows]);

  // Apply Team and Query filtering
  const filtered = useMemo(() => {
    let result = rows;

    // Filter by team
    if (selectedTeamId && selectedTeamId !== "all") {
      result = result.filter(
        (p) => String(p.team_id) === String(selectedTeamId)
      );
    }

    // Filter by search query
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.team?.name?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [rows, selectedTeamId, query]);

  const sorted = useMemo(() => {
    const chain = TIE_BREAKERS[sortKey] || ["computedGoals"];
    const dirMul = sortDir === "desc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const primary = chain[0];
      const primaryDiff = ((b[primary] || 0) - (a[primary] || 0)) * dirMul;
      if (primaryDiff !== 0) return primaryDiff;
      for (let i = 1; i < chain.length; i++) {
        const diff = (b[chain[i]] || 0) - (a[chain[i]] || 0);
        if (diff !== 0) return diff;
      }
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ col }) => {
    if (sortKey !== col)
      return <ChevronUp className="ml-1 inline w-3 h-3 opacity-30" />;
    return sortDir === "desc" ? (
      <ChevronDown className="ml-1 inline w-3 h-3" />
    ) : (
      <ChevronUp className="ml-1 inline w-3 h-3" />
    );
  };

  const allRoundsSelected =
    availableRounds.length > 0 &&
    (selectedRounds.length === 0 ||
      selectedRounds.length === availableRounds.length);

  return (
    <div>
      {/* Controls Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {/* Left Side Controls: Round Filter & Team Filter */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Round Selection Overlay Button */}
          <div className="relative">
            <button
              onClick={() => setIsRoundOverlayOpen((prev) => !prev)}
              className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3.5 py-1.5 text-sm font-medium transition-colors hover:border-foreground/40"
            >
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <span>
                {allRoundsSelected
                  ? "All Rounds"
                  : selectedRounds.length === 1
                  ? `Round ${selectedRounds[0]}`
                  : `${selectedRounds.length} Rounds Selected`}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </button>

            {/* Overlay Popover */}
            {isRoundOverlayOpen && (
              <>
                <div
                  className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px]"
                  onClick={() => setIsRoundOverlayOpen(false)}
                />

                <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded-2xl border border-border/80 bg-card/95 p-3 shadow-2xl backdrop-blur-xl">
                  <div className="mb-2 flex items-center justify-between border-b border-border/40 pb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Filter Rounds
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSelectAll}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {selectedRounds.length === availableRounds.length
                          ? "Deselect All"
                          : "Select All"}
                      </button>
                      {selectedRounds.length > 0 && (
                        <button
                          onClick={() => setSelectedRounds([])}
                          className="text-xs text-muted-foreground hover:text-foreground underline"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {/* Quick "All" pill button */}
                    <button
                      onClick={() => setSelectedRounds([])}
                      className={`rounded-xl py-1.5 text-xs font-medium transition-all ${
                        selectedRounds.length === 0
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted/40 hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      All
                    </button>

                    {availableRounds.map((r) => {
                      const isSelected = selectedRounds.includes(r);
                      return (
                        <button
                          key={r}
                          onClick={() => toggleRound(r)}
                          className={`rounded-xl py-1.5 text-xs font-medium transition-all ${
                            isSelected
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-muted/40 hover:bg-muted text-muted-foreground"
                          }`}
                        >
                          R{r}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Team Filter Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">Team</span>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-sm font-medium outline-none transition-colors focus:border-foreground"
            >
              <option value="all">All Teams</option>
              {availableTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sort Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort by</span>
          <select
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value);
              setSortDir("desc");
            }}
            className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-sm outline-none focus:border-foreground"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            className="grid h-8 w-8 place-items-center rounded-full border border-border/60 text-muted-foreground hover:text-foreground"
            title={sortDir === "desc" ? "Descending" : "Ascending"}
          >
            {sortDir === "desc" ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Search Input */}
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

      {/* Desktop Table */}
      <div className="hidden overflow-hidden rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-3 pl-5 pr-2 text-left font-medium">Rank</th>
                <th className="py-3 pr-2 text-left font-medium">Player</th>
                <th className="py-3 px-2 text-left font-medium">Team</th>
                <th
                  className="cursor-pointer py-3 px-2 text-center font-medium hover:text-foreground"
                  onClick={() => toggleSort("goals")}
                >
                  Goals<SortIcon col="goals" />
                </th>
                <th
                  className="cursor-pointer py-3 px-2 text-center font-medium hover:text-foreground"
                  onClick={() => toggleSort("assists")}
                >
                  Assists<SortIcon col="assists" />
                </th>
                <th
                  className="cursor-pointer py-3 px-2 text-center font-medium hover:text-foreground"
                  onClick={() => toggleSort("motm")}
                >
                  <Trophy className="mr-0.5 inline w-3 h-3" />
                  MOTM<SortIcon col="motm" />
                </th>
                <th
                  className="cursor-pointer py-3 px-2 text-center font-medium hover:text-foreground"
                  onClick={() => toggleSort("yc")}
                >
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-yellow-400 align-middle" />
                  <SortIcon col="yc" />
                </th>
                <th
                  className="cursor-pointer py-3 px-2 text-center font-medium hover:text-foreground"
                  onClick={() => toggleSort("rc")}
                >
                  <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500 align-middle" />
                  <SortIcon col="rc" />
                </th>
                <th
                  className="cursor-pointer py-3 px-2 pr-5 text-center font-medium hover:text-foreground"
                  onClick={() => toggleSort("matches")}
                >
                  Matches<SortIcon col="matches" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-muted-foreground">
                    {query
                      ? "No players match your search."
                      : selectedTeamId !== "all"
                      ? "No players found for the selected team."
                      : selectedRounds.length > 0
                      ? `No stats recorded for Round(s) ${selectedRounds.join(", ")}.`
                      : "No players yet."}
                  </td>
                </tr>
              ) : (
                sorted.map((p, i) => (
                  <tr key={p.id} className="border-b border-border/40 last:border-0">
                    <td className="py-3 pl-5 pr-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-3 pr-2">
                      <Link to={`/player/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      {p.position && (
                        <div className="text-xs text-muted-foreground">{p.position}</div>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        {p.team && <TeamAvatar team={p.team} size={24} />}
                        <span className="truncate text-xs text-muted-foreground">
                          {p.team?.name || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center font-semibold tabular-nums">
                      {p.computedGoals}
                    </td>
                    <td className="py-3 px-2 text-center font-semibold tabular-nums">
                      {p.computedAssists}
                    </td>
                    <td className="py-3 px-2 text-center font-semibold tabular-nums text-amber-600">
                      {p.computedMotm}
                    </td>
                    <td className="py-3 px-2 text-center tabular-nums text-yellow-600">
                      {p.yellowCards}
                    </td>
                    <td className="py-3 px-2 text-center tabular-nums text-red-600">
                      {p.redCards}
                    </td>
                    <td className="py-3 px-2 pr-5 text-center tabular-nums text-muted-foreground">
                      {p.matchesPlayed}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="space-y-2 sm:hidden">
        {sorted.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {query
              ? "No players match your search."
              : selectedTeamId !== "all"
              ? "No players found for the selected team."
              : selectedRounds.length > 0
              ? `No stats recorded for Round(s) ${selectedRounds.join(", ")}.`
              : "No players yet."}
          </p>
        ) : (
          sorted.map((p, i) => (
            <div
              key={p.id}
              className="rounded-2xl border border-border/60 bg-card/60 p-3 backdrop-blur-xl"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{i + 1}</span>
                {p.team && <TeamAvatar team={p.team} size={32} />}
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/player/${p.id}`}
                    className="block truncate font-medium hover:underline"
                  >
                    {p.name}
                  </Link>
                  <span className="truncate text-xs text-muted-foreground">
                    {p.team?.name || "—"}
                  </span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-6 gap-1 text-center">
                <div>
                  <div className="text-xs text-muted-foreground">G</div>
                  <div className="font-semibold tabular-nums text-green-600">
                    {p.computedGoals}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">A</div>
                  <div className="font-semibold tabular-nums text-blue-600">
                    {p.computedAssists}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">MOTM</div>
                  <div className="font-semibold tabular-nums text-amber-600">
                    {p.computedMotm}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Y</div>
                  <div className="font-semibold tabular-nums text-yellow-600">
                    {p.yellowCards}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">R</div>
                  <div className="font-semibold tabular-nums text-red-600">
                    {p.redCards}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">MP</div>
                  <div className="font-semibold tabular-nums text-muted-foreground">
                    {p.matchesPlayed}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}