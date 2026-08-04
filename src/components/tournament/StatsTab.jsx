import React from "react";
import { Link } from "react-router-dom";
import { computePlayerStats } from "@/lib/playerStats";
import PlayerRankingsTable from "@/components/stats/PlayerRankingsTable";
import { ChevronRight } from "lucide-react";

export default function StatsTab({ teams, players, matches, goals, appearances, tournament }) {
  const teamById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const computed = computePlayerStats(players, goals, matches, appearances);

  return (
    <div className="space-y-4">
      <PlayerRankingsTable
        players={computed}
        teamById={teamById}
        matches={matches}
        goals={goals}
        appearances={appearances}
      />
      <Link
        to={`/tournament/${tournament.id}/stats`}
        className="flex items-center justify-center gap-1 rounded-full border border-border/60 py-3 text-sm font-medium transition-colors hover:bg-accent"
      >
        View full stats <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
}