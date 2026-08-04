// Deterministic, rule-based parser for WhatsApp-style match reports.
// No AI/LLM dependency. Registered team names (passed in) have PRIORITY over
// player names: a word that matches a registered team is never saved as a player.

const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}\u{2B00}-\u{2BFF}\u{1F004}\u{1F0CF}\u{1F900}-\u{1F9FF}]/gu;

function stripEmoji(s) {
  return s.replace(EMOJI_RE, "").replace(/\s+/g, " ").trim();
}

function norm(s) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function levenshtein(a, b) {
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

function similarity(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const d = levenshtein(na, nb);
  return 1 - d / Math.max(na.length, nb.length);
}

function nameMatch(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

// Find every registered team that appears in `line` as a case-insensitive substring.
function findTeamMentions(line, registeredTeams) {
  const low = norm(line);
  const mentions = [];
  for (const t of registeredTeams) {
    const lt = norm(t);
    let idx = low.indexOf(lt);
    while (idx >= 0) {
      mentions.push({ team: t, start: idx, end: idx + lt.length });
      idx = low.indexOf(lt, idx + lt.length);
    }
  }
  // Keep longest, non-overlapping matches; sort by position.
  mentions.sort((a, b) => b.team.length - a.team.length);
  const filtered = [];
  for (const m of mentions) {
    if (!filtered.some((f) => m.start < f.end && m.end > f.start)) filtered.push(m);
  }
  filtered.sort((a, b) => a.start - b.start);
  return filtered;
}

// Match a line that is (approximately) just a team heading — exact, substring, or
// fuzzy (typo-tolerant). Handles lowercase and misspellings like "intr miln".
function matchHeading(line, registeredTeams) {
  const c = norm(line);
  if (!c) return null;
  for (const t of registeredTeams) if (c === norm(t)) return t;
  for (const t of registeredTeams) {
    const lt = norm(t);
    if (c.includes(lt) || lt.includes(c)) return t;
  }
  let best = null;
  let bestScore = 0;
  for (const t of registeredTeams) {
    const s = similarity(c, norm(t));
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

// Number tokens in the line that are NOT part of a team-name span.
function extractScoreTokens(line, mentions) {
  return [...line.matchAll(/\d+/g)]
    .map((m) => ({ val: +m[0], index: m.index, end: m.index + m[0].length }))
    .filter((n) => !mentions.some((m) => n.index >= m.start && n.end <= m.end));
}

function parsePlayerLine(line, teamName) {
  // Strip a leading list index like "1:", "1 :", "2-", "3."
  const stripped = line.replace(/^\d+\s*[:\-.]?\s*/, "").trim();
  const gMatches = stripped.match(/(\d+)\s*[Gg]/g) || [];
  const aMatches = stripped.match(/(\d+)\s*[Aa]/g) || [];
  const goals = gMatches.reduce((s, m) => s + parseInt(m, 10), 0);
  const assists = aMatches.reduce((s, m) => s + parseInt(m, 10), 0);
  let name = stripped.replace(/\(?\s*\d+\s*[GgAa]\s*\)?/g, "");
  name = name.replace(/\s+/g, " ").trim().replace(/^[-:,;.]+|[-:,;.]+$/g, "").trim();
  if (!name) name = stripped.replace(/\s+/g, " ").trim();
  // Names are never split — "Abdi Ahmed" stays one player.
  return { team: teamName, name, goals, assists, played: true };
}

// Suggest the closest registered player for an unmatched/misspelled name.
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

export function parseWhatsAppReport(text, registeredTeams = []) {
  if (!text || !text.trim()) throw new Error("Report text is empty.");
  const teams = registeredTeams.filter(Boolean);

  const lines = text.split(/\r?\n/).map(stripEmoji);

  const detectedTeams = []; // order of first appearance → home, away
  const playerBlocks = {}; // team name -> [player]
  let currentTeam = null;
  let motmRaw = null;

  // Score state
  const teamScores = {}; // team -> explicit score (formats A & B)
  let winnerTeam = null; // one-team "WINNER X 6:0" pair
  let winnerScore = null;
  let loserScore = null;
  let winnerFromKeyword = null; // "Win X" with no score
  let standaloneHome = null;
  let standaloneAway = null;

  const pushTeam = (t) => {
    if (t && !detectedTeams.includes(t)) detectedTeams.push(t);
  };

  for (const L of lines) {
    if (!L) continue;
    if (/^round\s*[:\-]?\s*\d+$/i.test(L)) continue;
    let m = L.match(/^(?:man|woman|women)\s+of\s+the\s+match\s*[:\-]?\s*(.+)$/i);
    if (m) {
      motmRaw = m[1].trim();
      continue;
    }
    const standalone = L.match(/^(\d+)\s*[:\-]\s*(\d+)$/);
    if (standalone) {
      standaloneHome = +standalone[1];
      standaloneAway = +standalone[2];
      continue;
    }

    const winnerKeyword = /^win{1,2}er\b/i.test(L) || /^win\b/i.test(L);
    const mentions = findTeamMentions(L, teams);
    const nums = extractScoreTokens(L, mentions);

    // Result line: mentions a registered team AND has a score or a "Win/Winner" keyword.
    if (mentions.length >= 1 && (nums.length > 0 || winnerKeyword)) {
      for (const t of mentions) pushTeam(t.team);
      if (winnerKeyword) winnerFromKeyword = mentions[0]?.team || null;

      // Adjacent X:Y / X-Y pairs belong to (team, other team).
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
      // Remaining single numbers belong to the closest preceding team.
      for (let i = 0; i < nums.length; i++) {
        if (used.has(i)) continue;
        const t = closestPrecedingTeam(nums[i], mentions);
        if (t) teamScores[t.team] = nums[i].val;
      }
      continue;
    }

    // Team heading (possibly lowercase / misspelled).
    const heading = matchHeading(L, teams);
    if (heading) {
      if (currentTeam === null || heading !== currentTeam) {
        currentTeam = heading;
        pushTeam(heading);
      }
      continue;
    }

    // Otherwise it's a player line for the current team section.
    if (currentTeam) {
      if (!playerBlocks[currentTeam]) playerBlocks[currentTeam] = [];
      playerBlocks[currentTeam].push(parsePlayerLine(L, currentTeam));
    }
  }

  if (detectedTeams.length < 2) {
    throw new Error(
      "Could not find two team headings. List both teams (matching the registered tournament teams) above their player lists."
    );
  }

  const home = detectedTeams[0];
  const away = detectedTeams[1];
  const homePlayers = (playerBlocks[home] || []).filter((p) => p.name);
  const awayPlayers = (playerBlocks[away] || []).filter((p) => p.name);
  const players = [...homePlayers, ...awayPlayers];
  const sumGoals = (arr) => arr.reduce((s, p) => s + p.goals, 0);

  let homeScore;
  let awayScore;
  let finalWinner;
  if (winnerTeam) {
    // "WINNER X 6:0" — score is winnerGoals:loserGoals.
    finalWinner = winnerTeam;
    if (nameMatch(winnerTeam, home)) {
      homeScore = winnerScore;
      awayScore = loserScore;
    } else {
      awayScore = winnerScore;
      homeScore = loserScore;
    }
  } else if (Object.keys(teamScores).length > 0) {
    // Formats A ("X 0 Y 4") and B ("X : Y 6") — missing side defaults to 0.
    homeScore = teamScores[home] ?? 0;
    awayScore = teamScores[away] ?? 0;
    finalWinner =
      homeScore > awayScore ? home : awayScore > homeScore ? away : winnerFromKeyword || null;
  } else if (winnerFromKeyword) {
    // Format C: "Win X" with no score.
    finalWinner = winnerFromKeyword;
    homeScore = sumGoals(homePlayers);
    awayScore = sumGoals(awayPlayers);
  } else if (standaloneHome !== null) {
    homeScore = standaloneHome;
    awayScore = standaloneAway;
    finalWinner = homeScore > awayScore ? home : awayScore > homeScore ? away : null;
  } else {
    homeScore = sumGoals(homePlayers);
    awayScore = sumGoals(awayPlayers);
    finalWinner = homeScore > awayScore ? home : awayScore > homeScore ? away : null;
  }

  let manOfTheMatch = null;
  if (motmRaw) {
    const matched = players.find((p) => nameMatch(p.name, motmRaw));
    manOfTheMatch = matched ? matched.name : motmRaw.trim();
  }

  const warnings = [];
  if (winnerFromKeyword && !nameMatch(winnerFromKeyword, home) && !nameMatch(winnerFromKeyword, away)) {
    warnings.push(`Winner "${winnerFromKeyword}" doesn't match either team (${home} or ${away}).`);
  }
  if (motmRaw && !players.some((p) => nameMatch(p.name, motmRaw))) {
    warnings.push(`Player of the match "${motmRaw}" was not found in either team lineup.`);
  }
  const totalGoals = players.reduce((s, p) => s + p.goals, 0);
  if ((Object.keys(teamScores).length > 0 || winnerTeam) && totalGoals !== homeScore + awayScore) {
    warnings.push(
      `Total goals from player stats (${totalGoals}) don't match the reported score (${homeScore}-${awayScore}). Please review.`
    );
  }

  return {
    homeTeam: home,
    awayTeam: away,
    homeScore,
    awayScore,
    winner: finalWinner,
    manOfTheMatch,
    players,
    warnings,
  };
}