// Shared tournament competition algorithms.
export const FINAL_STATUSES = new Set(['completed', 'closed', 'final']);

export const isFinalized = (match) => FINAL_STATUSES.has(String(match.status || '').toLowerCase());

export function roundRobinRounds(teamIds) {
  const ids = [...teamIds];
  if (ids.length % 2) ids.push(null);
  const rounds = [];
  for (let round = 0; round < ids.length - 1; round += 1) {
    const pairs = [];
    for (let index = 0; index < ids.length / 2; index += 1) {
      const home = ids[index];
      const away = ids[ids.length - 1 - index];
      if (home && away) pairs.push(round % 2 ? [away, home] : [home, away]);
    }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop());
  }
  return rounds;
}

export function isPowerOfTwo(value) {
  return Number.isInteger(value) && value > 1 && (value & (value - 1)) === 0;
}

export function knockoutRoundLabel(size) {
  if (size === 2) return 'Final';
  if (size === 4) return 'Semi-final';
  if (size === 8) return 'Quarter-final';
  return `Round of ${size}`;
}

export function buildStandings(teams, matches, tournament) {
  const pointsWin = tournament?.points_win ?? 3;
  const pointsDraw = tournament?.points_draw ?? 1;
  const pointsLoss = tournament?.points_loss ?? 0;
  const rows = teams.map((team) => ({ team, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, points: 0 }));
  const byTeamId = new Map(rows.map((row) => [row.team.id, row]));

  for (const match of matches) {
    if (!isFinalized(match) || match.home_score == null || match.away_score == null) continue;
    const home = byTeamId.get(match.home_team_id);
    const away = byTeamId.get(match.away_team_id);
    if (!home || !away) continue;
    home.played += 1; away.played += 1;
    home.gf += Number(match.home_score); home.ga += Number(match.away_score);
    away.gf += Number(match.away_score); away.ga += Number(match.home_score);
    if (match.home_score > match.away_score) { home.wins += 1; away.losses += 1; home.points += pointsWin; away.points += pointsLoss; }
    else if (match.home_score < match.away_score) { away.wins += 1; home.losses += 1; away.points += pointsWin; home.points += pointsLoss; }
    else { home.draws += 1; away.draws += 1; home.points += pointsDraw; away.points += pointsDraw; }
  }
  return rows.map((row) => ({ ...row, gd: row.gf - row.ga })).sort((left, right) =>
    right.points - left.points || right.gd - left.gd || right.gf - left.gf || left.team.name.localeCompare(right.team.name));
}

export function validateGroupConfiguration({ groupCount, qualifiersPerGroup, teamCount }) {
  if (!Number.isInteger(groupCount) || groupCount < 2) throw new Error('Group + Knockout requires at least two groups.');
  if (groupCount > teamCount) throw new Error('The number of groups cannot exceed the number of teams.');
  if (!Number.isInteger(qualifiersPerGroup) || qualifiersPerGroup < 1) throw new Error('At least one team must qualify from each group.');
  if (qualifiersPerGroup >= Math.floor(teamCount / groupCount)) throw new Error('Each group must have at least one eliminated team.');
  const qualifiers = groupCount * qualifiersPerGroup;
  if (!isPowerOfTwo(qualifiers)) throw new Error('The total number of qualified teams must be a power of two (for example 4, 8, or 16).');
  return qualifiers;
}
