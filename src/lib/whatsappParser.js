// Deterministic, rule-based parser for WhatsApp-style match reports.
// No AI/LLM dependency. Registered team names (passed in) have PRIORITY over
// player names: a word that matches a registered team is never saved as a player.
// Note: The parser extracts teamA and teamB in order of appearance in text.
// The scheduled fixture in the tournament determines which team is Home and which is Away.

import { extractTeamScoresFromText, extractTeamsFromText, resolveTeamAlias } from "./fixtureResolver.js";

const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}\u{2B00}-\u{2BFF}\u{1F004}\u{1F0CF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}]/gu;

export function stripEmoji(s) {
  return (s || "").replace(EMOJI_RE, "").replace(/\s+/g, " ").trim();
}

// Alphanumeric normalized string for case/punctuation/space-insensitive comparison
export function norm(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return 0;
  let prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = [...curr];
  }
  return prev[n];
}

// Player matching is deliberately separate from player-block detection. This
// helper is used only to suggest an existing registered player after a player
// has already been extracted from the report.
export function nameSimilarity(a, b) {
  const normalizeName = (value) => (value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.9;
  return 1 - levenshtein(left, right) / Math.max(left.length, right.length);
}

// Expand common football team abbreviations to full terms
export function expandToken(token) {
  const t = (token || "").toLowerCase();
  if (t === "man") return "manchester";
  if (t === "utd") return "united";
  if (t === "int") return "inter";
  if (t === "barca") return "barcelona";
  if (t === "juve") return "juventus";
  if (t === "atm" || t === "atletico") return "atletico";
  if (t === "bvb" || t === "dortmund") return "dortmund";
  if (t === "psg") return "paris";
  if (t === "rma" || t === "real") return "real";
  return t;
}

export function getTokens(str) {
  const clean = stripEmoji(str).toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  return clean.split(/\s+/).filter(Boolean);
}

export function teamSimilarity(lineStr, registeredTeamStr) {
  const normLine = norm(lineStr);
  const normTeam = norm(registeredTeamStr);
  if (!normLine || !normTeam) return 0;
  if (normLine === normTeam) return 1;

  if (normLine.length >= 3 && normTeam.length >= 3) {
    if (normLine.includes(normTeam) || normTeam.includes(normLine)) return 0.95;
  }

  const lineTokens = getTokens(lineStr).map(expandToken).filter((t) => !["fc", "cf", "sc", "club"].includes(t));
  const teamTokens = getTokens(registeredTeamStr).map(expandToken).filter((t) => !["fc", "cf", "sc", "club"].includes(t));

  if (lineTokens.length === 0 || teamTokens.length === 0) return 0;

  let matchedCount = 0;
  for (const lt of lineTokens) {
    for (const tt of teamTokens) {
      if (lt === tt || (lt.length >= 3 && tt.startsWith(lt)) || (tt.length >= 3 && lt.startsWith(tt))) {
        matchedCount++;
        break;
      }
    }
  }

  const ratio = matchedCount / Math.max(lineTokens.length, teamTokens.length);
  if (ratio >= 0.5) return Math.max(ratio, 0.85);

  const expandedLine = lineTokens.join("");
  const expandedTeam = teamTokens.join("");
  const d = levenshtein(expandedLine, expandedTeam);
  const score = 1 - d / Math.max(expandedLine.length, expandedTeam.length);

  return score;
}

export function nameMatch(a, b) {
  const s = teamSimilarity(a, b);
  if (s >= 0.5) return true;
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

// Find every registered team that appears in `line` (case/space/emoji/abbreviation insensitive).
export function findTeamMentions(line, registeredTeams) {
  const cleanLine = stripEmoji(line).trim();
  const lowLine = norm(cleanLine);
  if (!lowLine) return [];
  const mentions = [];

  for (const t of registeredTeams) {
    const lt = norm(t);
    if (!lt) continue;
    let idx = lowLine.indexOf(lt);
    while (idx >= 0) {
      mentions.push({ team: t, start: idx, end: idx + lt.length });
      idx = lowLine.indexOf(lt, idx + lt.length);
    }
  }

  if (mentions.length === 0) {
    for (const t of registeredTeams) {
      if (teamSimilarity(cleanLine, t) >= 0.5) {
        mentions.push({ team: t, start: 0, end: lowLine.length });
      }
    }
  }

  mentions.sort((a, b) => b.team.length - a.team.length);
  const filtered = [];
  for (const m of mentions) {
    if (!filtered.some((f) => m.start < f.end && m.end > f.start)) filtered.push(m);
  }
  filtered.sort((a, b) => a.start - b.start);
  return filtered;
}

// Match a line that is (approximately) a team heading — exact, substring, or fuzzy/abbreviations.
export function matchHeading(line, registeredTeams) {
  const clean = stripEmoji(line).trim();
  if (!clean) return null;
  const c = norm(clean);

  for (const t of registeredTeams) if (c === norm(t)) return t;
  for (const t of registeredTeams) {
    const lt = norm(t);
    if (c.includes(lt) || (lt.length >= 4 && lt.includes(c))) return t;
  }

  let best = null;
  let bestScore = 0;
  for (const t of registeredTeams) {
    const s = teamSimilarity(clean, t);
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

function closestPrecedingTeam(num, mentions) {
  let best = null;
  for (const m of mentions) {
    if (m.end <= num.index && (!best || m.end > best.end)) best = m;
  }
  return best;
}

function extractScoreTokens(line, mentions) {
  return [...line.matchAll(/\d+/g)]
    .map((m) => ({ val: +m[0], index: m.index, end: m.index + m[0].length }))
    .filter((n) => !mentions.some((m) => n.index >= m.start && n.end <= m.end));
}

// Clean and normalize a raw player name string according to rules
export function cleanPlayerName(raw) {
  if (!raw) return "";
  let name = stripEmoji(raw).trim();

  // Remove leading index / bullet numbers like "1:", "1.", "1-", "1)", "1 "
  name = name.replace(/^\d+[\s:\-.)]+\s*/, "").trim();

  // Remove goal and assist patterns like (1g), (1g.), (1 g), ( 1 g ), (1a), 1g, 1 goal, 1 goals, etc.
  name = name
    .replace(/(?:^|\s|\()\d+\s*goals?\b\.?/gi, "")
    .replace(/(?:^|\s|\()\d+\s*assists?\b\.?/gi, "")
    .replace(/\(\s*\d+\s*[GgAa]\.?\s*\)/gi, "")
    .replace(/\[\s*\d+\s*[GgAa]\.?\s*\]/gi, "")
    .replace(/(?:^|\s)\d+\s*[GgAa]\.?(?:\s|$)/gi, " ");

  // Remove stray punctuation (leading, trailing, and internal stray punctuation)
  name = name
    .replace(/^[().,\-:;?!\/\\#]+|[().,\-:;?!\/\\#]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return name;
}

export function parsePlayerLine(line, teamName) {
  const cleanLine = stripEmoji(line).trim();
  const stripped = cleanLine.replace(/^\d+[\s:\-.)]+\s*/, "").trim();

  let goals = 0;
  let assists = 0;

  // Extract goals:
  // 1. "1 goal", "2 goals", "1goals"
  const wordGoalMatches = stripped.match(/(?:^|\s|\()(\d+)\s*goals?\b\.?/gi) || [];
  wordGoalMatches.forEach((m) => {
    const d = m.match(/\d+/);
    if (d) goals += parseInt(d[0], 10);
  });

  // 2. "(1g)", "(1g.)", "(1 g)", "( 1 g )", "1g", "2G", "[1g]"
  const shortGoalMatches = stripped.match(/(?:^|\s|\(|\[)(\d+)\s*[Gg]\.?(?:\s|\)|\]|$)/g) || [];
  shortGoalMatches.forEach((m) => {
    const d = m.match(/\d+/);
    if (d) goals += parseInt(d[0], 10);
  });

  // Extract assists:
  // 1. "1 assist", "2 assists"
  const wordAssistMatches = stripped.match(/(?:^|\s|\()(\d+)\s*assists?\b\.?/gi) || [];
  wordAssistMatches.forEach((m) => {
    const d = m.match(/\d+/);
    if (d) assists += parseInt(d[0], 10);
  });

  // 2. "(1a)", "(1a.)", "(1 a)", "( 1 a )", "1a", "2A", "[1a]"
  const shortAssistMatches = stripped.match(/(?:^|\s|\(|\[)(\d+)\s*[Aa]\.?(?:\s|\)|\]|$)/g) || [];
  shortAssistMatches.forEach((m) => {
    const d = m.match(/\d+/);
    if (d) assists += parseInt(d[0], 10);
  });

  const name = cleanPlayerName(line);

  return { team: teamName, name, goals, assists, played: true };
}

export function suggestClosest(name, players) {
  if (!players || !players.length) return null;
  let best = null;
  let bestScore = 0;
  for (const p of players) {
    const s = nameSimilarity(name, p.name);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  return bestScore >= 0.6 ? best : null;
}

// Regex to detect metadata lines that MUST NOT be parsed as player names
const METADATA_LINE_RE =
  /^(?:man|woman|women|player)\s+of\s+the\s+(?:match|mach|matc)|^(?:motm|wotm|potm|mvp|best\s+player)|^win{1,2}er[s]?\b|^win\b|^(?:round|leg|week|matchday|group|stage|cup|league)\b/i;

function parseWhatsAppReportLegacy(text, registeredTeams = []) {
  if (!text || !text.trim()) throw new Error("Report text is empty.");
  const teamRecords = registeredTeams.filter(Boolean).map((team) => typeof team === "string" ? { id: team, name: team } : team);
  const teams = teamRecords.map((team) => team.name);

  const rawLines = text.split(/\r?\n/);

  const detectedTeams = []; // order of appearance: teamA, teamB
  const playerBlocks = {}; // team name -> [playerObjects]
  let currentTeam = null;
  let isCollectingPlayers = false;
  let hasStartedPlayerList = false;
  let motmRaw = null;

  // Score state from text
  const teamScores = {};
  let winnerTeam = null;
  let winnerScore = null;
  let loserScore = null;
  let winnerFromKeyword = null;
  let standaloneHome = null;
  let standaloneAway = null;

  const pushTeam = (t) => {
    if (t && !detectedTeams.includes(t)) detectedTeams.push(t);
  };

  for (const rawLine of rawLines) {
    const L = stripEmoji(rawLine).trim();

    // 1. EMPTY LINES:
    // If we've already started adding players for current team, an empty line marks the END of the player section.
    if (!L) {
      if (hasStartedPlayerList) {
        isCollectingPlayers = false;
        hasStartedPlayerList = false;
      }
      continue;
    }

    // 2. MOTM / WOMAN OF THE MATCH / MVP awards check
    const motmMatch =
      L.match(/^(?:man|woman|women|player)\s+of\s+the\s+(?:match|mach|matc)\s*[:\-]?\s*(.+)$/i) ||
      L.match(/^(?:motm|wotm|potm|mvp|best\s+player)\s*[:\-]?\s*(.+)$/i);
    if (motmMatch) {
      motmRaw = cleanPlayerName(motmMatch[1]);
      isCollectingPlayers = false;
      hasStartedPlayerList = false;
      continue;
    }

    // 3. Standalone score lines e.g. "8:0", "8 - 0", "3.0"
    const standalone = L.match(/^(\d+)\s*[:\-.]\s*(\d+)$/);
    if (standalone) {
      standaloneHome = +standalone[1];
      standaloneAway = +standalone[2];
      isCollectingPlayers = false;
      hasStartedPlayerList = false;
      continue;
    }

    // 4. Header lines e.g. "ROUND 3" or tournament title
    if (/^(?:round|leg|week|matchday|group|stage|cup|league)\s*[:\-]?\s*\d*$/i.test(L)) {
      isCollectingPlayers = false;
      hasStartedPlayerList = false;
      continue;
    }

    const winnerKeyword = /^win{1,2}er[s]?\b/i.test(L) || /^win\b/i.test(L);
    const mentions = findTeamMentions(L, teams);
    const nums = extractScoreTokens(L, mentions);

    // 5. Result line: mentions a registered team AND has a score or a "Win/Winner" keyword
    if (mentions.length >= 1 && (nums.length > 0 || winnerKeyword)) {
      isCollectingPlayers = false;
      hasStartedPlayerList = false;
      for (const t of mentions) pushTeam(t.team);
      if (winnerKeyword) winnerFromKeyword = mentions[0]?.team || null;

      const pairs = [];
      for (let i = 0; i < nums.length - 1; i++) {
        const seg = L.slice(nums[i].end, nums[i + 1].index).trim();
        if (/^[:\-.]\s*$/.test(seg) || seg === "") pairs.push([i, i + 1]);
      }
      const used = new Set();
      for (const [i, j] of pairs) {
        used.add(i);
        used.add(j);
        const firstTeam = closestPrecedingTeam(nums[i], mentions);
        const secondTeam = mentions.find((mm) => mm !== firstTeam);
        if (firstTeam && secondTeam) {
          teamScores[firstTeam.team] = nums[i].val;
          teamScores[secondTeam.team] = nums[j].val;
        } else if (firstTeam) {
          winnerTeam = firstTeam.team;
          winnerScore = nums[i].val;
          loserScore = nums[j].val;
        }
      }
      for (let i = 0; i < nums.length; i++) {
        if (used.has(i)) continue;
        const t = closestPrecedingTeam(nums[i], mentions);
        if (t) teamScores[t.team] = nums[i].val;
      }
      continue;
    }

    // 6. Check if line is a Team Heading
    const heading = resolveTeamAlias(L, teamRecords)?.name || matchHeading(L, teams);
    if (heading) {
      currentTeam = heading;
      isCollectingPlayers = true;
      hasStartedPlayerList = false;
      pushTeam(heading);
      continue;
    }

    // 7. Check metadata line again before adding as player
    if (METADATA_LINE_RE.test(L)) {
      isCollectingPlayers = false;
      hasStartedPlayerList = false;
      continue;
    }

    // 8. Otherwise: if we are in player collection mode right after a team header, add player
    if (currentTeam && isCollectingPlayers) {
      const playerObj = parsePlayerLine(rawLine, currentTeam);
      if (playerObj && playerObj.name) {
        if (METADATA_LINE_RE.test(playerObj.name)) {
          isCollectingPlayers = false;
          hasStartedPlayerList = false;
          continue;
        }
        if (!playerBlocks[currentTeam]) playerBlocks[currentTeam] = [];
        playerBlocks[currentTeam].push(playerObj);
        hasStartedPlayerList = true;
      }
    }
  }

  // A score line can use aliases (for example "Man united") that are not
  // literal substrings of the registered name. Add those ID-resolved teams.
  for (const team of extractTeamsFromText(text, teamRecords)) pushTeam(team.name);

  if (detectedTeams.length < 2) {
    throw new Error(
      "Could not find two team headings. List both teams (matching the registered tournament teams) above their player lists."
    );
  }

  const teamA = detectedTeams[0];
  const teamB = detectedTeams[1];
  const teamAPlayers = (playerBlocks[teamA] || []).filter((p) => p.name);
  const teamBPlayers = (playerBlocks[teamB] || []).filter((p) => p.name);
  const players = [...teamAPlayers, ...teamBPlayers];

  const sumGoals = (arr) => arr.reduce((s, p) => s + (p.goals || 0), 0);
  const teamAGoals = sumGoals(teamAPlayers);
  const teamBGoals = sumGoals(teamBPlayers);
  const explicitScores = extractTeamScoresFromText(text, teamRecords);

  let teamAScore;
  let teamBScore;
  let finalWinner;

  // Calculate score:
  // If player goal statistics were recorded (sum > 0), use player goals as the primary score calculation
  if (explicitScores.has(teamRecords.find((team) => team.name === teamA)?.id) || explicitScores.has(teamRecords.find((team) => team.name === teamB)?.id)) {
    teamAScore = explicitScores.get(teamRecords.find((team) => team.name === teamA)?.id) ?? teamAGoals;
    teamBScore = explicitScores.get(teamRecords.find((team) => team.name === teamB)?.id) ?? teamBGoals;
    finalWinner = teamAScore > teamBScore ? teamA : teamBScore > teamAScore ? teamB : winnerFromKeyword || null;
  } else if (teamAGoals > 0 || teamBGoals > 0) {
    teamAScore = teamAGoals;
    teamBScore = teamBGoals;
    finalWinner =
      teamAScore > teamBScore ? teamA : teamBScore > teamAScore ? teamB : winnerTeam || winnerFromKeyword || null;
  } else if (winnerTeam) {
    finalWinner = winnerTeam;
    if (nameMatch(winnerTeam, teamA)) {
      teamAScore = winnerScore;
      teamBScore = loserScore;
    } else {
      teamBScore = winnerScore;
      teamAScore = loserScore;
    }
  } else if (Object.keys(teamScores).length > 0) {
    teamAScore = teamScores[teamA] ?? 0;
    teamBScore = teamScores[teamB] ?? 0;
    finalWinner =
      teamAScore > teamBScore ? teamA : teamBScore > teamAScore ? teamB : winnerFromKeyword || null;
  } else if (standaloneHome !== null) {
    teamAScore = standaloneHome;
    teamBScore = standaloneAway;
    finalWinner = teamAScore > teamBScore ? teamA : teamBScore > teamAScore ? teamB : null;
  } else {
    teamAScore = 0;
    teamBScore = 0;
    finalWinner = winnerFromKeyword || null;
  }

  let manOfTheMatch = null;
  if (motmRaw) {
    const matched = players.find((p) => nameMatch(p.name, motmRaw));
    manOfTheMatch = matched ? matched.name : motmRaw;
  }

  const warnings = [];
  if (winnerFromKeyword && !nameMatch(winnerFromKeyword, teamA) && !nameMatch(winnerFromKeyword, teamB)) {
    warnings.push(`Winner "${winnerFromKeyword}" doesn't match either team (${teamA} or ${teamB}).`);
  }
  if (motmRaw && !players.some((p) => nameMatch(p.name, motmRaw))) {
    warnings.push(`Player of the match "${motmRaw}" was not found in either team lineup.`);
  }

  return {
    detectedTeams,
    teamA,
    teamB,
    teamAScore,
    teamBScore,
    // Alias for backward compatibility
    homeTeam: teamA,
    awayTeam: teamB,
    homeScore: teamAScore,
    awayScore: teamBScore,
    winner: finalWinner,
    manOfTheMatch,
    players,
    warnings,
  };
}

// The importer reports have a deliberate shape.  This state machine uses the
// position of a line in that shape—not a global "looks like a player" guess—to
// decide whether it belongs to a lineup.
export function parseWhatsAppReport(text, registeredTeams = []) {
  if (!text || !text.trim()) throw new Error("Report text is empty.");
  const teamRecords = registeredTeams.filter(Boolean).map((team) => typeof team === "string" ? { id: team, name: team } : team);
  const rawLines = text.split(/\r?\n/);
  const blocks = new Map();
  const detectedTeams = [];
  const warnings = [];
  let state = "FIND_TEAM_1";
  let currentTeam = null;
  let motmRaw = null;
  let awardType = null;
  let round = null;
  const debug = (...detail) => {
    if (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) console.debug("[Parser]", ...detail);
  };

  const addTeam = (team) => {
    if (!detectedTeams.some((item) => item.id === team.id)) detectedTeams.push(team);
    if (!blocks.has(team.id)) blocks.set(team.id, []);
  };
  const isBlank = (line) => !stripEmoji(line).trim();
  const awardFrom = (line) => line.match(/^(man|woman|women|player)\s+of\s+the\s+(?:match|mach|matc)\s*[:\-]?\s*(.+)$/i) || line.match(/^(motm|wotm|potm|mvp|best\s+player)\s*[:\-]?\s*(.+)$/i);

  for (const rawLine of rawLines) {
    const line = stripEmoji(rawLine).trim();
    const roundMatch = line.match(/\b(?:round|leg|week|matchday)\s*[:\-]?\s*(\d+)\b/i);
    if (roundMatch) round = Number(roundMatch[1]);

    if (state === "FIND_TEAM_1") {
      const team = resolveTeamAlias(line, teamRecords);
      if (team) {
        addTeam(team); currentTeam = team; state = "WAITING_FOR_TEAM_1_PLAYERS";
        debug("Team 1 alias resolved:", line, "→", team.name);
      }
      continue;
    }

    if (state === "WAITING_FOR_TEAM_1_PLAYERS" || state === "WAITING_FOR_TEAM_2_PLAYERS") {
      if (isBlank(rawLine)) continue; // blanks before a block are explicitly allowed
      const block = blocks.get(currentTeam.id);
      block.push(parsePlayerLine(rawLine, currentTeam.name));
      state = state === "WAITING_FOR_TEAM_1_PLAYERS" ? "TEAM_1_PLAYER_BLOCK" : "TEAM_2_PLAYER_BLOCK";
      continue;
    }

    if (state === "TEAM_1_PLAYER_BLOCK" || state === "TEAM_2_PLAYER_BLOCK") {
      if (isBlank(rawLine)) {
        // This is the key structural boundary: never resume this block.
        state = state === "TEAM_1_PLAYER_BLOCK" ? "FIND_TEAM_2" : "MATCH_STATISTICS";
        currentTeam = null;
        continue;
      }
      const block = blocks.get(currentTeam.id);
      if (block.length < 8) block.push(parsePlayerLine(rawLine, currentTeam.name));
      else warnings.push(`${currentTeam.name} has more than 8 consecutive player lines; extra lines were ignored.`);
      continue;
    }

    if (state === "FIND_TEAM_2") {
      if (isBlank(rawLine)) continue;
      const team = resolveTeamAlias(line, teamRecords);
      if (team && team.id !== detectedTeams[0]?.id) {
        addTeam(team); currentTeam = team; state = "WAITING_FOR_TEAM_2_PLAYERS";
        debug("Team 2 alias resolved:", line, "→", team.name);
      } else {
        warnings.push(`Expected the second team after ${detectedTeams[0]?.name || "the first team"}; ignored "${line}".`);
      }
      continue;
    }

    // Match statistics and awards are intentionally never added to a player
    // block, regardless of whether a line resembles a person's name.
    if (state === "MATCH_STATISTICS" || state === "AWARDS") {
      if (isBlank(rawLine)) continue;
      const award = awardFrom(line);
      if (award) {
        awardType = /woman|women|wotm/i.test(award[1]) ? "Woman of the Match" : "Man of the Match";
        motmRaw = cleanPlayerName(award[2]);
        state = "AWARDS";
      }
    }
  }

  if (detectedTeams.length < 2) throw new Error("Could not find two team blocks in the expected report structure.");
  const [teamARecord, teamBRecord] = detectedTeams;
  const teamA = teamARecord.name;
  const teamB = teamBRecord.name;
  const teamAPlayers = blocks.get(teamARecord.id) || [];
  const teamBPlayers = blocks.get(teamBRecord.id) || [];
  debug("Team 1 player block:", teamAPlayers.map((player) => player.name));
  debug("Team 2 player block:", teamBPlayers.map((player) => player.name));
  for (const [team, players] of [[teamA, teamAPlayers], [teamB, teamBPlayers]]) {
    if (players.length < 3 || players.length > 8) warnings.push(`${team} has ${players.length} players; expected 3–8 in one consecutive player block.`);
  }

  const scores = extractTeamScoresFromText(text, teamRecords);
  const teamAScore = scores.get(teamARecord.id) ?? teamAPlayers.reduce((sum, player) => sum + (player.goals || 0), 0);
  const teamBScore = scores.get(teamBRecord.id) ?? teamBPlayers.reduce((sum, player) => sum + (player.goals || 0), 0);
  const allPlayers = [...teamAPlayers, ...teamBPlayers];
  const motmPlayer = motmRaw ? allPlayers.find((player) => nameMatch(player.name, motmRaw)) : null;
  if (motmRaw && !motmPlayer) warnings.push(`Player of the match "${motmRaw}" was not found in either player block.`);
  debug("Players detected:", allPlayers.length);
  debug("Score:", `${teamA} ${teamAScore}`, `${teamB} ${teamBScore}`);
  if (motmRaw) debug("Award:", `${awardType || "Player of the Match"} → ${motmRaw}`);

  return {
    detectedTeams: [teamA, teamB], teamA, teamB, teamAScore, teamBScore,
    homeTeam: teamA, awayTeam: teamB, homeScore: teamAScore, awayScore: teamBScore,
    winner: teamAScore > teamBScore ? teamA : teamBScore > teamAScore ? teamB : null,
    manOfTheMatch: motmPlayer?.name || motmRaw || null,
    playerOfMatch: motmPlayer ? { name: motmPlayer.name, team: motmPlayer.team, awardType } : null,
    awardType,
    awardTeam: motmPlayer?.team || null,
    round,
    players: allPlayers,
    warnings,
  };
}
