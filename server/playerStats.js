const FINAL_STATUSES = new Set(['closed', 'completed']);
const RANK_CHAINS = { goals: ['goals', 'assists', 'motm'], motm: ['motm', 'goals', 'assists'], assists: ['assists', 'goals', 'motm'] };
export const isFinalizedMatch = (match) => FINAL_STATUSES.has(match.status);
function roundKey(match) { return Number.isFinite(Number(match.round)) ? `round:${Number(match.round)}` : null; }
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function selectLeaguePeriod(matches, timeFilter, tournament) {
  const leagueMatches = matches.filter((match) => timeFilter !== 'season' || !match.season || !tournament?.season || match.season === tournament.season);
  const finalized = leagueMatches.filter(isFinalizedMatch);
  if (timeFilter === 'all' || timeFilter === 'season') return { matches: finalized, rounds: [...new Set(finalized.map(roundKey).filter(Boolean))].sort((a, b) => Number(a.slice(6)) - Number(b.slice(6))) };
  const byRound = new Map();
  for (const match of finalized) { const key = roundKey(match); if (key) byRound.set(key, [...(byRound.get(key) || []), match]); }
  const wanted = timeFilter === 'last3' ? 3 : 5;
  const keys = new Set([...byRound.keys()].sort((a, b) => Number(b.slice(6)) - Number(a.slice(6))).slice(0, wanted));
  return { matches: finalized.filter((match) => keys.has(roundKey(match))), rounds: [...keys].sort((a, b) => Number(a.slice(6)) - Number(b.slice(6))) };
}

export function buildPlayerRankings({ tournament, players, teams, matches, goals, appearances, timeFilter = 'all', rankBy = 'goals' }) {
  const safeTimeFilter = ['all', 'last3', 'last5', 'season'].includes(timeFilter) ? timeFilter : 'all';
  const safeRankBy = RANK_CHAINS[rankBy] ? rankBy : 'goals';
  const period = selectLeaguePeriod(matches, safeTimeFilter, tournament), selectedIds = new Set(period.matches.map((match) => match.id));
  const closedIds = new Set(period.matches.filter((match) => match.status === 'closed').map((match) => match.id));
  const legacyIds = new Set(period.matches.filter((match) => match.status === 'completed').map((match) => match.id));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const stats = new Map(players.map((player) => [player.id, { player, goals: 0, assists: 0, motm: 0, matchIds: new Set() }]));
  for (const appearance of appearances) { const row = stats.get(appearance.player_id); if (row && closedIds.has(appearance.match_id)) { row.goals += number(appearance.goals); row.assists += number(appearance.assists); row.matchIds.add(appearance.match_id); } }
  for (const goal of goals) { if (!legacyIds.has(goal.match_id)) continue; const scorer = stats.get(goal.player_id), assister = stats.get(goal.assist_player_id); if (scorer) { scorer.goals += number(goal.count ?? 1); scorer.assists += number(goal.assists); scorer.matchIds.add(goal.match_id); } if (assister) { assister.assists += 1; assister.matchIds.add(goal.match_id); } }
  for (const match of period.matches) { const row = stats.get(match.motm_player_id); if (row) row.motm += 1; }
  const matchById = new Map(period.matches.map((match) => [match.id, match]));
  const rows = [...stats.values()].map(({ player, goals: playerGoals, assists, motm, matchIds }) => ({ player_id: player.id, player_name: player.name, team_id: player.team_id, team_name: teamById.get(player.team_id)?.name || null, goals: playerGoals, assists, motm, matches: matchIds.size, matches_considered: [...matchIds].map((matchId) => ({ id: matchId, round: matchById.get(matchId)?.round ?? null })) })).sort((a, b) => { for (const key of RANK_CHAINS[safeRankBy]) if (b[key] !== a[key]) return b[key] - a[key]; return (a.player_name || '').localeCompare(b.player_name || ''); }).map((row, index) => ({ ...row, rank: index + 1 }));
  return { rows, timeFilter: safeTimeFilter, rankBy: safeRankBy, selectedMatchIds: [...selectedIds], selectedRounds: period.rounds.map((key) => Number(key.slice(6))) };
}

export function buildPlayerBreakdown({ tournament, player, teams, matches, goals, appearances, timeFilter = 'all' }) {
  const safeTimeFilter = ['all', 'last3', 'last5', 'season'].includes(timeFilter) ? timeFilter : 'all';
  const period = selectLeaguePeriod(matches, safeTimeFilter, tournament), teamById = new Map(teams.map((team) => [team.id, team])), byRound = new Map();
  for (const match of period.matches) { const key = roundKey(match); if (key) byRound.set(key, [...(byRound.get(key) || []), match]); }
  const performance = (match) => { let goalsTotal = 0, assistsTotal = 0, yellow = 0, red = 0, played = false; const source = match.status === 'closed' ? appearances : goals; for (const record of source) { if (record.match_id !== match.id || record.player_id !== player.id) continue; played = true; goalsTotal += number(record.goals ?? record.count ?? 1); assistsTotal += number(record.assists); yellow += number(record.yellow_cards); red += number(record.red_cards); } return { goals: goalsTotal, assists: assistsTotal, yellow, red, played, motm: match.motm_player_id === player.id }; };
  const rounds = [...byRound.entries()].sort(([a], [b]) => Number(b.slice(6)) - Number(a.slice(6))).map(([key, roundMatches]) => { const matchRows = roundMatches.filter((match) => [match.home_team_id, match.away_team_id].includes(player.team_id)).map((match) => ({ ...match, home_team_name: teamById.get(match.home_team_id)?.name || 'TBD', away_team_name: teamById.get(match.away_team_id)?.name || 'TBD', performance: performance(match) })); const totals = matchRows.reduce((sum, row) => ({ goals: sum.goals + row.performance.goals, assists: sum.assists + row.performance.assists, yellow: sum.yellow + row.performance.yellow, red: sum.red + row.performance.red, motm: sum.motm + Number(row.performance.motm), matches: sum.matches + Number(row.performance.played) }), { goals: 0, assists: 0, yellow: 0, red: 0, motm: 0, matches: 0 }); return { round: Number(key.slice(6)), label: `Round ${Number(key.slice(6))}`, goals: totals.goals, assists: totals.assists, yellow: totals.yellow, red: totals.red, motm: totals.motm, matches_played: totals.matches, played: totals.matches > 0, matches: matchRows }; });
  return { timeFilter: safeTimeFilter, selectedRounds: period.rounds.map((key) => Number(key.slice(6))), rounds, totals: rounds.reduce((sum, round) => ({ goals: sum.goals + round.goals, assists: sum.assists + round.assists, yellow: sum.yellow + round.yellow, red: sum.red + round.red, motm: sum.motm + round.motm, matches: sum.matches + round.matches_played }), { goals: 0, assists: 0, yellow: 0, red: 0, motm: 0, matches: 0 }) };
}
