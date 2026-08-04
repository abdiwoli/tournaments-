/**
 * Compute player statistics dynamically from Appearance records (closed matches)
 * and Goal records (legacy "completed" matches).
 *
 * - Matches Played is NEVER inferred from goals/assists/cards. For closed matches,
 *   every Appearance record counts as one match played — even if the player had
 *   zero stats. For legacy completed matches, a Goal record counts as one match.
 * - Goals / Assists / Cards are summed from Appearance (closed) + Goal (completed).
 * - MOTM is counted from the match's motm_player_id field on finalized matches.
 */
export const isFinalized = (m) => m.status === "completed" || m.status === "closed";

export function computePlayerStats(players, goals, matches, appearances = []) {
  const closedMatchIds = new Set(
    matches.filter((m) => m.status === "closed").map((m) => m.id)
  );
  const completedMatchIds = new Set(
    matches.filter((m) => m.status === "completed").map((m) => m.id)
  );

  const statsByPlayer = {};

  // Legacy "completed" matches — stats from Goal records
  goals.forEach((g) => {
    if (!completedMatchIds.has(g.match_id)) return;
    const s =
      statsByPlayer[g.player_id] ||
      (statsByPlayer[g.player_id] = { goals: 0, assists: 0, yellowCards: 0, redCards: 0, matchIds: new Set() });
    s.goals += g.count ?? 1;
    s.assists += g.assists || 0;
    s.yellowCards += g.yellow_cards || 0;
    s.redCards += g.red_cards || 0;
    s.matchIds.add(g.match_id);
  });

  // "closed" matches — stats + appearances from Appearance records
  appearances.forEach((a) => {
    if (!closedMatchIds.has(a.match_id)) return;
    const s =
      statsByPlayer[a.player_id] ||
      (statsByPlayer[a.player_id] = { goals: 0, assists: 0, yellowCards: 0, redCards: 0, matchIds: new Set() });
    s.goals += a.goals || 0;
    s.assists += a.assists || 0;
    s.yellowCards += a.yellow_cards || 0;
    s.redCards += a.red_cards || 0;
    // Every appearance counts as a match played — independent of stats
    s.matchIds.add(a.match_id);
  });

  const motmByPlayer = {};
  matches
    .filter((m) => isFinalized(m) && m.motm_player_id)
    .forEach((m) => {
      motmByPlayer[m.motm_player_id] = (motmByPlayer[m.motm_player_id] || 0) + 1;
    });

  return players.map((p) => {
    const s = statsByPlayer[p.id];
    return {
      ...p,
      computedGoals: s?.goals || 0,
      computedAssists: s?.assists || 0,
      computedYellow: s?.yellowCards || 0,
      computedRed: s?.redCards || 0,
      computedMotm: motmByPlayer[p.id] || 0,
      computedMatches: s?.matchIds.size || 0,
    };
  });
}