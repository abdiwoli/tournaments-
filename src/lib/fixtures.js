// Fixture generators for the supported tournament formats.

function roundRobinRounds(teamIds) {
  const ids = [...teamIds];
  if (ids.length % 2 !== 0) ids.push(null); // bye
  const n = ids.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i];
      const b = ids[n - 1 - i];
      if (a && b) pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop());
  }
  return rounds;
}

export function generateFixtures({ format, teams, tournamentId, venues = [], maxRound }) {
  const ids = teams.map((t) => t.id);
  const matches = [];
  const venueAt = (i) => (venues.length ? venues[i % venues.length] : "");

  if (format === "knockout" || format === "double_elimination") {
    const size = Math.pow(2, Math.ceil(Math.log2(Math.max(ids.length, 2))));
    const padded = [...ids, ...Array(size - ids.length).fill(null)];
    for (let i = 0; i < size / 2; i++) {
      matches.push({
        tournament_id: tournamentId,
        round: 1,
        round_label: size === 2 ? "Final" : size === 4 ? "Semi-final" : `Round of ${size}`,
        home_team_id: padded[i * 2] || "",
        away_team_id: padded[i * 2 + 1] || "",
        venue: venueAt(i),
        status: "scheduled",
      });
    }
    return matches;
  }

  if (format === "swiss") {
    const pairs = [];
    for (let i = 0; i < ids.length - 1; i += 2) pairs.push([ids[i], ids[i + 1]]);
    return pairs.map(([h, a], i) => ({
      tournament_id: tournamentId, round: 1, round_label: "Swiss Round 1",
      home_team_id: h, away_team_id: a, venue: venueAt(i), status: "scheduled",
    }));
  }

  const rounds = roundRobinRounds(ids);
  const allRounds = format === "league" ? [...rounds, ...rounds.map((r) => r.map(([h, a]) => [a, h]))] : rounds;
  allRounds.forEach((pairs, ri) => {
    pairs.forEach(([h, a], i) => {
      matches.push({
        tournament_id: tournamentId, round: ri + 1, round_label: `Round ${ri + 1}`,
        home_team_id: h, away_team_id: a, venue: venueAt(matches.length + i), status: "scheduled",
      });
    });
  });
  if (maxRound != null && maxRound > 0) return matches.filter((m) => m.round <= maxRound);
  return matches;
}