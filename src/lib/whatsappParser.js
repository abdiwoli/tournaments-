// Deterministic, rule-based parser for WhatsApp-style match reports.
// No AI/LLM dependency. Registered team names (passed in) have PRIORITY over
// player names: a word that matches a registered team is never saved as a player.
// Note: The parser extracts teamA and teamB in order of appearance in text.
// The scheduled fixture in the tournament determines which team is Home and which is Away.

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

export function similarity(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const d = levenshtein(na, nb);
  return 1 - d / Math.max(na.length, nb.length);
}

export function nameMatch(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

// Find every registered team that appears in `line` (case/space/emoji insensitive).
export function findTeamMentions(line, registeredTeams) {
  const lowLine = norm(line);
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
  // Fallback fuzzy search if no exact alphanumeric substring matches
  if (mentions.length === 0) {
    for (const t of registeredTeams) {
      if (similarity(line, t) >= 0.7) {
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

// Match a line that is (approximately) a team heading — exact, substring, or fuzzy.
export function matchHeading(line, registeredTeams) {
  const clean = stripEmoji(line).trim();
  const c = norm(clean);
  if (!c) return null;
  for (const t of registeredTeams) if (c === norm(t)) return t;
  for (const t of registeredTeams) {
    const lt = norm(t);
    if (c.includes(lt) || (lt.length >= 4 && lt.includes(c))) return t;
  }
  let best = null;
  let bestScore = 0;
  for (const t of registeredTeams) {
    const s = similarity(clean, t);
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  return bestScore >= 0.6 ? best : null;
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

  // Remove goal and assist patterns like (2g), (2g.), (2 g), ( 2 g ), (1a), 2g, etc.
  name = name
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

  // Extract goals & assists
  const gMatches = stripped.match(/(?:^|\s|\()(\d+)\s*[Gg]\.?(?:\s|\)|$)/g) || [];
  const aMatches = stripped.match(/(?:^|\s|\()(\d+)\s*[Aa]\.?(?:\s|\)|$)/g) || [];

  const extractDigits = (arr) =>
    arr.reduce((sum, str) => {
      const d = str.match(/\d+/);
      return sum + (d ? parseInt(d[0], 10) : 0);
    }, 0);

  const goals = extractDigits(gMatches);
  const assists = extractDigits(aMatches);

  const name = cleanPlayerName(line);

  return { team: teamName, name, goals, assists, played: true };
}

export function suggestClosest(name, players) {
  if (!players || !players.length) return null;
  let best = null;
  let bestScore = 0;
  for (const p of players) {
    const s = similarity(name, p.name);
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

export function parseWhatsAppReport(text, registeredTeams = []) {
  if (!text || !text.trim()) throw new Error("Report text is empty.");
  const teams = registeredTeams.filter(Boolean);

  const rawLines = text.split(/\r?\n/);

  const detectedTeams = []; // order of appearance: teamA, teamB
  const playerBlocks = {}; // team name -> [playerObjects]
  let currentTeam = null;
  let isCollectingPlayers = false;
  let hasStartedPlayerList = false;
  let motmRaw = null;

  // Score state
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
    // If we haven't started adding players yet, skip leading empty lines under the team header.
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

    // 3. Standalone score lines e.g. "8:0" or "8 - 0"
    const standalone = L.match(/^(\d+)\s*[:\-]\s*(\d+)$/);
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
        if (/^[:\-]$/.test(seg)) pairs.push([i, i + 1]);
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
    const heading = matchHeading(L, teams);
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
        // Sanity check: do not treat metadata lines as player names
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
  const sumGoals = (arr) => arr.reduce((s, p) => s + p.goals, 0);

  let teamAScore;
  let teamBScore;
  let finalWinner;
  if (winnerTeam) {
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
  } else if (winnerFromKeyword) {
    finalWinner = winnerFromKeyword;
    teamAScore = sumGoals(teamAPlayers);
    teamBScore = sumGoals(teamBPlayers);
  } else if (standaloneHome !== null) {
    teamAScore = standaloneHome;
    teamBScore = standaloneAway;
    finalWinner = teamAScore > teamBScore ? teamA : teamBScore > teamAScore ? teamB : null;
  } else {
    teamAScore = sumGoals(teamAPlayers);
    teamBScore = sumGoals(teamBPlayers);
    finalWinner = teamAScore > teamBScore ? teamA : teamBScore > teamAScore ? teamB : null;
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
  const totalGoals = players.reduce((s, p) => s + p.goals, 0);
  if ((Object.keys(teamScores).length > 0 || winnerTeam) && totalGoals !== teamAScore + teamBScore) {
    warnings.push(
      `Total goals from player stats (${totalGoals}) don't match the reported score (${teamAScore}-${teamBScore}). Please review.`
    );
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