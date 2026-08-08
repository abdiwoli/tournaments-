// Fixture imports must resolve to database team and fixture IDs.  Text is only
// used to identify the two teams; it never decides a fixture's home/away side.

const TEAM_ALIASES = {
  "man united": "manchester united",
  "man city": "manchester city",
  inter: "inter milan",
  real: "real madrid",
  bayern: "bayern munich",
  "west ham": "west ham united",
};

export function normalizeTeamName(value) {
  const normalized = (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return TEAM_ALIASES[normalized] || normalized;
}

export function resolveTeamAlias(value, teams = []) {
  const target = normalizeTeamName(value);
  if (!target) return null;
  return teams.find((team) => normalizeTeamName(team.name) === target) || null;
}

function aliasesForTeam(team) {
  const canonical = normalizeTeamName(team.name);
  return [...new Set([canonical, ...Object.entries(TEAM_ALIASES)
    .filter(([, value]) => value === canonical)
    .map(([alias]) => alias)])];
}

// Returns database teams mentioned in the report, in report order.  Heading
// lines and score lines both work, including known short aliases.
export function extractTeamsFromText(text, teams = []) {
  const found = [];
  for (const rawLine of (text || "").split(/\r?\n/)) {
    const line = normalizeTeamName(rawLine);
    if (!line) continue;
    for (const team of teams) {
      if (aliasesForTeam(team).some((alias) => line === alias || new RegExp(`(^| )${alias.replace(/ /g, "\\s+")}(?= |$)`).test(line))) {
        if (!found.some((item) => item.id === team.id)) found.push(team);
      }
    }
  }
  return found;
}

export function extractTeamScoresFromText(text, teams = []) {
  const scores = new Map();
  for (const rawLine of (text || "").split(/\r?\n/)) {
    const namedScorePair = rawLine.match(/(\d+)\s*[:;,-]\s*(\d+)/);
    const mentionedTeams = extractTeamsFromText(rawLine, teams);
    if (namedScorePair && mentionedTeams.length === 2) {
      scores.set(mentionedTeams[0].id, Number(namedScorePair[1]));
      scores.set(mentionedTeams[1].id, Number(namedScorePair[2]));
    }
    for (const team of teams) {
      for (const alias of aliasesForTeam(team)) {
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
        // Team name immediately followed by its score: "PSG 1; Man united 3",
        // "PSG 1 - Man United 3", and the separator-free variant all match.
        const match = rawLine.match(new RegExp(`(?:^|\\b)${escaped}\\s+(\\d+)(?=\\s*(?:[;:,-]|vs\\b|$|[A-Za-z]))`, "i"));
        if (match) scores.set(team.id, Number(match[1]));
      }
    }
  }
  return scores;
}

export function isCompletedFixture(fixture) {
  return ["closed", "completed"].includes((fixture?.status || "").toLowerCase());
}

export function findMatchingOpenFixture(matches, firstTeamId, secondTeamId, currentRound) {
  const pair = matches.filter((match) =>
    !isCompletedFixture(match) &&
    ((match.home_team_id === firstTeamId && match.away_team_id === secondTeamId) ||
      (match.home_team_id === secondTeamId && match.away_team_id === firstTeamId))
  );
  return pair.find((match) => Number(match.round) === Number(currentRound)) || pair[0] || null;
}

export function resolveFixture({ text, teams, matches, currentRound }) {
  const detectedTeams = extractTeamsFromText(text, teams);
  if (detectedTeams.length < 2) {
    return { fixture: null, detectedTeams, reason: "teams_not_found" };
  }
  const [firstTeam, secondTeam] = detectedTeams;
  const fixture = findMatchingOpenFixture(matches, firstTeam.id, secondTeam.id, currentRound);
  if (fixture) return { fixture, detectedTeams: [firstTeam, secondTeam], reason: null };

  const completedFixture = matches.find((match) =>
    isCompletedFixture(match) &&
    ((match.home_team_id === firstTeam.id && match.away_team_id === secondTeam.id) ||
      (match.home_team_id === secondTeam.id && match.away_team_id === firstTeam.id))
  ) || null;
  return { fixture: null, completedFixture, detectedTeams: [firstTeam, secondTeam], reason: completedFixture ? "completed" : "fixture_not_found" };
}
