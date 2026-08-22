import dotenv from 'dotenv';
import express from 'express';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { buildPlayerBreakdown, buildPlayerRankings } from './playerStats.js';
import { buildStandings, isFinalized, knockoutRoundLabel, roundRobinRounds, validateGroupConfiguration } from './competition.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.resolve(root, '.env.local') });
dotenv.config({ path: path.resolve(root, '.env') });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Set it in .env.local or .env.');

const uploadsDir = process.env.VERCEL ? '/tmp/uploads' : path.resolve(root, 'uploads');
try {
  fs.mkdirSync(uploadsDir, { recursive: true });
} catch {
  // Ignore error if filesystem is read-only
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('sslmode=') || process.env.VERCEL ? { rejectUnauthorized: false } : undefined,
});

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_date TIMESTAMPTZ NOT NULL,
  google_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS records (
  entity TEXT NOT NULL,
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_date TIMESTAMPTZ NOT NULL,
  updated_date TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_records_entity ON records(entity);

CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
`;
await pool.query(schema);

const entities = new Set(['Tournament', 'Team', 'Player', 'Match', 'TournamentPermission', 'Goal', 'Appearance', 'TournamentGroup']);
const memberRoles = new Set(['follower', 'results', 'goals', 'teams', 'fixtures', 'admin']);
const secret = process.env.JWT_SECRET || 'development-only-change-me';
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const present = (row) => row && ({ id: row.id, ...row.data, created_date: row.created_date, updated_date: row.updated_date });
const auth = (req, _res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  try { req.user = token && jwt.verify(token, secret); } catch { req.user = null; }
  next();
};
const requireAuth = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Authentication required' });
const signed = (user) => ({
  access_token: jwt.sign({ id: user.id, email: user.email, role: user.role }, secret, { expiresIn: '7d' }),
  user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
});

const app = express();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const configuredOrigin = process.env.FRONTEND_URL;
  const localOrigin = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (origin && (localOrigin || origin === configuredOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(auth);
app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

async function getRecord(entity, recordId) {
  const result = await pool.query('SELECT * FROM records WHERE entity=$1 AND id=$2', [entity, recordId]);
  return present(result.rows[0]);
}

async function getTournament(tournamentId) {
  return tournamentId ? getRecord('Tournament', tournamentId) : null;
}

async function createRecord(entity, data, recordId = id()) {
  const stamp = now();
  await pool.query('INSERT INTO records (entity,id,data,created_date,updated_date) VALUES ($1,$2,$3::jsonb,$4,$5)', [entity, recordId, JSON.stringify(data), stamp, stamp]);
  return { id: recordId, ...data, created_date: stamp, updated_date: stamp };
}

async function updateRecord(entity, recordId, changes) {
  const old = await getRecord(entity, recordId);
  if (!old) return null;
  const data = { ...old, ...changes };
  delete data.id; delete data.created_date; delete data.updated_date;
  const stamp = now();
  await pool.query('UPDATE records SET data=$1::jsonb,updated_date=$2 WHERE entity=$3 AND id=$4', [JSON.stringify(data), stamp, entity, recordId]);
  return { id: recordId, ...data, created_date: old.created_date, updated_date: stamp };
}

async function records(entity, filter = {}, sort = 'created_date', limit = 100) {
  const result = await pool.query('SELECT * FROM records WHERE entity=$1', [entity]);
  let output = result.rows.map(present).filter((record) =>
    Object.entries(filter).every(([key, condition]) => {
      if (condition && typeof condition === 'object') {
        if ('$in' in condition) return condition.$in.includes(record[key]);
        if ('$lte' in condition) return record[key] <= condition.$lte;
      }
      return record[key] === condition;
    })
  );
  const descending = String(sort || '').startsWith('-');
  const key = String(sort || 'created_date').replace(/^-/, '');
  output.sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? ''), undefined, { numeric: true }));
  if (descending) output.reverse();
  return output.slice(0, Number(limit) || 100);
}

app.get('/api/tournaments/:id/player-stats', route(async (req, res) => {
  const tournament = await getTournament(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  const [players, teams, matches, goals, appearances] = await Promise.all([
    records('Player', { tournament_id: tournament.id }, 'name', 10000),
    records('Team', { tournament_id: tournament.id }, 'name', 10000),
    records('Match', { tournament_id: tournament.id }, 'round', 10000),
    records('Goal', { tournament_id: tournament.id }, 'created_date', 50000),
    records('Appearance', { tournament_id: tournament.id }, 'created_date', 50000),
  ]);
  const result = buildPlayerRankings({
    tournament, players, teams, matches, goals, appearances,
    timeFilter: req.query.timeFilter,
    rankBy: req.query.rankBy,
  });
  if (req.query.debug === '1') {
    console.info('[stats]', tournament.name, result.timeFilter, result.rankBy, 'rounds=', result.selectedRounds, 'matches=', result.selectedMatchIds.length);
  }
  res.json(result);
}));

app.get('/api/tournaments/:id/player-stats/:playerId', route(async (req, res) => {
  const tournament = await getTournament(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  const player = await getRecord('Player', req.params.playerId);
  if (!player || player.tournament_id !== tournament.id) return res.status(404).json({ error: 'Player not found' });
  const [teams, matches, goals, appearances] = await Promise.all([
    records('Team', { tournament_id: tournament.id }, 'name', 10000),
    records('Match', { tournament_id: tournament.id }, 'round', 10000),
    records('Goal', { tournament_id: tournament.id }, 'created_date', 50000),
    records('Appearance', { tournament_id: tournament.id }, 'created_date', 50000),
  ]);
  const result = buildPlayerBreakdown({ tournament, player, teams, matches, goals, appearances, timeFilter: req.query.timeFilter });
  if (req.query.debug === '1') console.info('[player-stats]', player.name, result.timeFilter, 'rounds=', result.selectedRounds, 'matches=', result.rounds.flatMap((round) => round.matches.filter((match) => match.performance.played).map((match) => match.id)));
  res.json(result);
}));

const normalizedMemberRole = (role) => role === 'full_admin' ? 'admin' : role;
const membershipKey = (membership) => `${membership.tournament_id}:${membership.user_id}`;
const membershipUpdatedAt = (membership) => Date.parse(membership.updated_date || membership.created_date) || 0;

function latestMemberships(memberships) {
  const latest = new Map();
  for (const membership of memberships) {
    const previous = latest.get(membershipKey(membership));
    if (!previous || membershipUpdatedAt(membership) > membershipUpdatedAt(previous)) latest.set(membershipKey(membership), membership);
  }
  return [...latest.values()];
}

async function membership(tournamentId, userId) { return latestMemberships(await records('TournamentPermission', { tournament_id: tournamentId, user_id: userId }, 'created_date', 1000))[0]; }
async function memberRole(tournamentId, userId) { return normalizedMemberRole((await membership(tournamentId, userId))?.role); }
async function hasRole(tournament, user, allowed = []) { return !!tournament && !!user && (tournament.created_by_id === user.id || user.role === 'admin' || allowed.includes(await memberRole(tournament.id, user.id))); }

async function canWrite(entity, record, changes, user) {
  const data = { ...record, ...changes };
  if (entity === 'Tournament') return !!user && (data.created_by_id === user.id || user.role === 'admin');
  const tournament = await getTournament(data.tournament_id);
  if (entity === 'Team' || entity === 'Player') return hasRole(tournament, user, ['teams', 'admin']);
  if (entity === 'TournamentGroup') return hasRole(tournament, user, ['fixtures', 'admin']);
  if (entity === 'Match') {
    const resultEdit = ['home_score', 'away_score', 'motm_player_id', 'motm_player_name'].some((key) => key in changes) || ['closed', 'completed', 'live'].includes(changes.status);
    return hasRole(tournament, user, resultEdit ? ['results', 'goals', 'admin'] : ['fixtures', 'admin']);
  }
  if (entity === 'Goal' || entity === 'Appearance') return hasRole(tournament, user, ['results', 'goals', 'admin']);
  return false;
}

const stageMatches = async (tournamentId, stage) => records('Match', { tournament_id: tournamentId }, 'round', 10000).then((matches) => matches.filter((match) => (match.stage || 'LEAGUE_STAGE') === stage));
const groupName = (index) => `Group ${String.fromCharCode(65 + index)}`;

async function generateKnockoutBracket(tournament, teamIds) {
  if (teamIds.length < 2 || (teamIds.length & (teamIds.length - 1)) !== 0) throw new Error('Knockout participants must be a power of two.');
  const rounds = Math.log2(teamIds.length);
  const allRounds = [];
  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    const size = teamIds.length >> roundIndex;
    const previous = allRounds[roundIndex - 1] || [];
    const matches = [];
    for (let slot = 0; slot < size / 2; slot += 1) {
      const recordId = id();
      const firstRound = roundIndex === 0;
      matches.push(await createRecord('Match', {
        tournament_id: tournament.id,
        stage: 'KNOCKOUT_STAGE',
        knockout_round: roundIndex + 1,
        bracket_slot: slot + 1,
        round: roundIndex + 1,
        round_label: knockoutRoundLabel(size),
        home_team_id: firstRound ? teamIds[slot * 2] : '',
        away_team_id: firstRound ? teamIds[slot * 2 + 1] : '',
        home_source_match_id: firstRound ? null : previous[slot * 2]?.id,
        away_source_match_id: firstRound ? null : previous[slot * 2 + 1]?.id,
        status: firstRound ? 'scheduled' : 'pending',
      }, recordId));
    }
    allRounds.push(matches);
  }
  return allRounds.flat();
}

async function completeGroupStage(tournament) {
  if (tournament.current_stage === 'KNOCKOUT_STAGE') return;
  const groups = await records('TournamentGroup', { tournament_id: tournament.id }, 'order', 1000);
  const groupMatches = await stageMatches(tournament.id, 'GROUP_STAGE');
  if (!groups.length || !groupMatches.length || groupMatches.some((match) => !isFinalized(match))) return;
  const teams = await records('Team', { tournament_id: tournament.id }, 'name', 10000);
  const qualifiers = [];
  for (const group of groups) {
    const groupTeams = teams.filter((team) => team.group_id === group.id);
    const table = buildStandings(groupTeams, groupMatches.filter((match) => match.group_id === group.id), tournament);
    for (const [position, row] of table.entries()) {
      const qualified = position < tournament.qualifiers_per_group;
      await updateRecord('Team', row.team.id, { qualification_status: qualified ? 'qualified' : 'eliminated', group_position: position + 1 });
      if (qualified) qualifiers.push({ groupOrder: group.order, position, teamId: row.team.id });
    }
  }
  // Seed by finishing position, then group. This keeps same-group teams apart in the opening pairings for the common 2-qualifier configuration.
  const ordered = qualifiers.sort((left, right) => left.position - right.position || left.groupOrder - right.groupOrder).map((entry) => entry.teamId);
  await generateKnockoutBracket(tournament, ordered);
  await updateRecord('Tournament', tournament.id, { current_stage: 'KNOCKOUT_STAGE', status: 'ongoing' });
}

async function advanceKnockoutWinner(match) {
  if ((match.stage || '') !== 'KNOCKOUT_STAGE' || !isFinalized(match)) return;
  const winner = match.winner_team_id || (match.home_score > match.away_score ? match.home_team_id : match.away_score > match.home_score ? match.away_team_id : null);
  if (!winner) return;
  const children = (await stageMatches(match.tournament_id, 'KNOCKOUT_STAGE')).filter((candidate) => candidate.home_source_match_id === match.id || candidate.away_source_match_id === match.id);
  for (const child of children) {
    const changes = child.home_source_match_id === match.id ? { home_team_id: winner } : { away_team_id: winner };
    const updated = await updateRecord('Match', child.id, changes);
    if (updated.home_team_id && updated.away_team_id) await updateRecord('Match', child.id, { status: 'scheduled' });
  }
  if (!children.length) await updateRecord('Tournament', match.tournament_id, { current_stage: 'COMPLETED', status: 'completed', winner_team_id: winner });
}

async function processCompetitionResult(match) {
  const tournament = await getTournament(match.tournament_id);
  if (!tournament || !isFinalized(match)) return;
  if ((match.stage || '') === 'GROUP_STAGE') await completeGroupStage(tournament);
  if ((match.stage || '') === 'KNOCKOUT_STAGE') await advanceKnockoutWinner(match);
}

app.get('/api/tournaments/:id/standings', route(async (req, res) => {
  const tournament = await getTournament(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  const [teams, matches, groups] = await Promise.all([
    records('Team', { tournament_id: tournament.id }, 'name', 10000),
    records('Match', { tournament_id: tournament.id }, 'round', 10000),
    records('TournamentGroup', { tournament_id: tournament.id }, 'order', 1000),
  ]);
  if (tournament.format !== 'group_stage_knockout') return res.json({ type: 'league', current_stage: tournament.current_stage || 'LEAGUE_STAGE', standings: buildStandings(teams, matches.filter((match) => !match.stage || match.stage === 'LEAGUE_STAGE'), tournament) });
  const groupStandings = groups.map((group) => ({ ...group, standings: buildStandings(teams.filter((team) => team.group_id === group.id), matches.filter((match) => match.stage === 'GROUP_STAGE' && match.group_id === group.id), tournament) }));
  res.json({ type: 'group_stage_knockout', current_stage: tournament.current_stage || 'GROUP_STAGE', groups: groupStandings });
}));

app.post('/api/tournaments/:id/fixtures/generate', requireAuth, route(async (req, res) => {
  const tournament = await getTournament(req.params.id);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  if (!(await hasRole(tournament, req.user, ['fixtures', 'admin']))) return res.status(403).json({ error: 'You do not have permission to manage fixtures.' });
  const teams = await records('Team', { tournament_id: tournament.id }, 'created_date', 10000);
  const existing = await records('Match', { tournament_id: tournament.id }, 'created_date', 1);
  if (existing.length) return res.status(409).json({ error: 'Fixtures already exist. Clear them before generating a new schedule.' });
  if (teams.length < 2) return res.status(400).json({ error: 'At least two teams are required.' });

  if (tournament.format === 'group_stage_knockout') {
    const groupCount = Number(tournament.group_count);
    const qualifiersPerGroup = Number(tournament.qualifiers_per_group);
    validateGroupConfiguration({ groupCount, qualifiersPerGroup, teamCount: teams.length });
    const groups = [];
    for (let index = 0; index < groupCount; index += 1) groups.push(await createRecord('TournamentGroup', { tournament_id: tournament.id, name: groupName(index), order: index + 1, qualifiers_per_group: qualifiersPerGroup, stage: 'GROUP_STAGE' }));
    for (const [index, team] of teams.entries()) await updateRecord('Team', team.id, { group_id: groups[index % groupCount].id, group_name: groups[index % groupCount].name, qualification_status: 'pending' });
    const generated = [];
    for (const group of groups) {
      const groupTeams = (await records('Team', { group_id: group.id }, 'created_date', 1000));
      roundRobinRounds(groupTeams.map((team) => team.id)).forEach((pairs, roundIndex) => pairs.forEach(([home, away], slot) => generated.push({
        tournament_id: tournament.id, stage: 'GROUP_STAGE', group_id: group.id, round: roundIndex + 1, round_label: `${group.name} · Round ${roundIndex + 1}`, home_team_id: home, away_team_id: away, venue: (tournament.venues || [])[generated.length % (tournament.venues || []).length] || '', status: 'scheduled', bracket_slot: slot + 1,
      })));
    }
    for (const match of generated) await createRecord('Match', match);
    const updatedTournament = await updateRecord('Tournament', tournament.id, { current_stage: 'GROUP_STAGE', status: 'ongoing' });
    return res.status(201).json({ tournament: updatedTournament, groups, matches: generated });
  }

  if (tournament.format === 'knockout') {
    const size = 2 ** Math.ceil(Math.log2(teams.length));
    // Preserve existing knockout compatibility: incomplete brackets contain TBD/bye slots.
    const matches = await generateKnockoutBracket(tournament, [...teams.map((team) => team.id), ...Array(size - teams.length).fill('')]);
    const updatedTournament = await updateRecord('Tournament', tournament.id, { current_stage: 'KNOCKOUT_STAGE', status: 'ongoing' });
    return res.status(201).json({ tournament: updatedTournament, groups: [], matches });
  }

  const rounds = roundRobinRounds(teams.map((team) => team.id));
  const allRounds = tournament.format === 'league' ? [...rounds, ...rounds.map((pairs) => pairs.map(([home, away]) => [away, home]))] : rounds;
  const generated = allRounds.flatMap((pairs, roundIndex) => pairs.map(([home, away], slot) => ({ tournament_id: tournament.id, stage: 'LEAGUE_STAGE', round: roundIndex + 1, round_label: `Round ${roundIndex + 1}`, home_team_id: home, away_team_id: away, venue: (tournament.venues || [])[slot % (tournament.venues || []).length] || '', status: 'scheduled' })));
  for (const match of generated) await createRecord('Match', match);
  const updatedTournament = await updateRecord('Tournament', tournament.id, { current_stage: 'LEAGUE_STAGE', status: 'ongoing' });
  res.status(201).json({ tournament: updatedTournament, groups: [], matches: generated });
}));

app.post('/api/auth/register', route(async (req, res) => {
  const { email, password, full_name = '' } = req.body;
  if (!email || !password || password.length < 6) return res.status(400).json({ error: 'Use an email and a password with at least 6 characters.' });
  const normalized = email.toLowerCase();
  if ((await pool.query('SELECT 1 FROM users WHERE email=$1', [normalized])).rowCount) return res.status(409).json({ error: 'An account with this email already exists.' });
  const user = { id: id(), email: normalized, full_name, role: 'user', created_date: now() };
  await pool.query('INSERT INTO users (id,email,password_hash,full_name,role,created_date) VALUES ($1,$2,$3,$4,$5,$6)', [user.id, user.email, await bcrypt.hash(password, 12), user.full_name, user.role, user.created_date]);
  res.json(signed(user));
}));

app.post('/api/auth/login', route(async (req, res) => {
  const userResult = await pool.query('SELECT * FROM users WHERE email=$1', [(req.body.email || '').toLowerCase()]);
  const user = userResult.rows[0];
  if (!user || !(await bcrypt.compare(req.body.password || '', user.password_hash))) return res.status(401).json({ error: 'Invalid email or password.' });
  res.json(signed(user));
}));

app.get('/api/auth/me', requireAuth, route(async (req, res) => {
  const result = await pool.query('SELECT id,email,full_name,role FROM users WHERE id=$1', [req.user.id]);
  if (!result.rows[0]) return res.status(401).json({ error: 'Session is invalid.' });
  res.json(result.rows[0]);
}));

app.post('/api/auth/reset-request', route(async (req, res) => {
  const user = (await pool.query('SELECT id FROM users WHERE email=$1', [(req.body.email || '').toLowerCase()])).rows[0];
  if (!user) return res.json({ ok: true });
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query('INSERT INTO password_resets (token,user_id,expires_at) VALUES ($1,$2,$3)', [token, user.id, Date.now() + 1800000]);
  res.json({ ok: true, reset_token: token });
}));

app.post('/api/auth/reset', route(async (req, res) => {
  const reset = (await pool.query('SELECT * FROM password_resets WHERE token=$1 AND expires_at>$2', [req.body.resetToken, Date.now()])).rows[0];
  if (!reset || !req.body.newPassword || req.body.newPassword.length < 6) return res.status(400).json({ error: 'This reset link is invalid or expired.' });
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(req.body.newPassword, 12), reset.user_id]);
  await pool.query('DELETE FROM password_resets WHERE token=$1', [req.body.resetToken]);
  res.json({ ok: true });
}));

const googleState = new Map();
const mobileReturnUrl = (value) => {
  if (typeof value !== 'string') return null;
  return /^(exp|exps):\/\//.test(value) || /^tourtmentmobile:\/\//.test(value) ? value : null;
};

app.get('/api/auth/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(503).send('Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.');
  const state = crypto.randomBytes(24).toString('hex');
  googleState.set(state, { expires: Date.now() + 600000, returnUrl: mobileReturnUrl(req.query.return_url) });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback',
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/api/auth/google/callback', route(async (req, res) => {
  const { code, state } = req.query;
  const stateData = googleState.get(state);
  googleState.delete(state);
  if (!code || !stateData || stateData.expires < Date.now()) return res.status(400).send('Google sign-in session expired. Please try again.');
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback';
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenResponse.json();
  if (!tokenResponse.ok) throw new Error(tokens.error_description || 'Google token exchange failed');
  const profile = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } })).json();
  if (!profile.email) throw new Error('Google did not provide an email address');
  let user = (await pool.query('SELECT * FROM users WHERE google_id=$1 OR email=$2', [profile.sub, profile.email.toLowerCase()])).rows[0];
  if (!user) {
    user = { id: id(), email: profile.email.toLowerCase(), password_hash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12), full_name: profile.name || profile.email.split('@')[0], role: 'user', created_date: now(), google_id: profile.sub };
    await pool.query('INSERT INTO users (id,email,password_hash,full_name,role,created_date,google_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [user.id, user.email, user.password_hash, user.full_name, user.role, user.created_date, user.google_id]);
  } else if (!user.google_id) {
    await pool.query('UPDATE users SET google_id=$1 WHERE id=$2', [profile.sub, user.id]);
  }
  const result = signed(user);
  if (stateData.returnUrl) {
    const separator = stateData.returnUrl.includes('?') ? '&' : '?';
    return res.redirect(`${stateData.returnUrl}${separator}access_token=${encodeURIComponent(result.access_token)}`);
  }
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.redirect(`${frontendUrl}/?access_token=${encodeURIComponent(result.access_token)}`);
}));

app.get('/api/entities/:entity', route(async (req, res) => {
  if (!entities.has(req.params.entity)) return res.status(404).json({ error: 'Unknown entity' });
  let filter = {};
  try {
    filter = JSON.parse(req.query.filter || '{}');
  } catch {
    return res.status(400).json({ error: 'Invalid filter' });
  }

  // Extract top-level query params (e.g. ?match_id=... or ?tournament_id=...) and merge them with filter
  const { filter: _f, sort, limit, ...queryParams } = req.query;
  filter = { ...queryParams, ...filter };

  let output = await records(req.params.entity, filter, req.query.sort, req.query.limit);
  if (req.params.entity === 'TournamentPermission') {
    output = req.user ? output.filter((p) => p.user_id === req.user.id) : [];
    const all = await records('Tournament', {}, 'created_date', 10000);
    const owned = new Set(all.filter((t) => t.created_by_id === req.user?.id).map((t) => t.id));
    if (req.user?.role === 'admin') output = await records(req.params.entity, filter, req.query.sort, req.query.limit);
    else output = output.concat((await records(req.params.entity, filter, req.query.sort, req.query.limit)).filter((p) => owned.has(p.tournament_id) && !output.some((x) => x.id === p.id)));
    output = latestMemberships(output);
  }
  res.json(output);
}));

app.get('/api/entities/:entity/:id', route(async (req, res) => {
  if (!entities.has(req.params.entity)) return res.status(404).json({ error: 'Unknown entity' });
  const output = await getRecord(req.params.entity, req.params.id);
  output ? res.json(output) : res.status(404).json({ error: 'Record not found' });
}));

app.post('/api/entities/:entity', requireAuth, route(async (req, res) => {
  const entity = req.params.entity;
  if (!entities.has(entity)) return res.status(404).json({ error: 'Unknown entity' });
  const record = { ...req.body };
  if (entity === 'Tournament') {
    if (record.format === 'group_knockout') record.format = 'group_stage_knockout';
    if (record.format === 'group_stage_knockout') {
      const groupCount = Number(record.group_count);
      const qualifiersPerGroup = Number(record.qualifiers_per_group);
      if (!Number.isInteger(groupCount) || groupCount < 2 || !Number.isInteger(qualifiersPerGroup) || qualifiersPerGroup < 1) return res.status(400).json({ error: 'Group + Knockout requires valid group_count and qualifiers_per_group values.' });
      record.current_stage = record.current_stage || 'GROUP_STAGE';
    }
    record.created_by_id = req.user.id;
  }
  else if (entity === 'TournamentPermission') {
    const tournament = await getTournament(record.tournament_id);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    const isSelfFollow = !record.user_id || record.user_id === req.user.id;
    if (isSelfFollow) {
      const existing = await membership(tournament.id, req.user.id);
      if (existing) return res.status(200).json(existing);
      record.user_id = req.user.id;
      record.user_email = req.user.email;
      record.user_name = req.user.full_name || '';
      record.role = 'follower';
    } else {
      if (!(await hasRole(tournament, req.user, ['admin']))) return res.status(403).json({ error: 'Only the owner can add staff.' });
      record.role = normalizedMemberRole(record.role || 'follower');
      if (!memberRoles.has(record.role)) return res.status(400).json({ error: 'Invalid membership role.' });
      if (await membership(tournament.id, record.user_id)) return res.status(409).json({ error: 'This user already follows the tournament.' });
    }
    record.tournament_owner_id = tournament.created_by_id;
  } else if (!(await canWrite(entity, record, record, req.user))) return res.status(403).json({ error: 'You do not have permission to modify this tournament.' });
  const stamp = now(), recordId = id();
  await pool.query('INSERT INTO records (entity,id,data,created_date,updated_date) VALUES ($1,$2,$3::jsonb,$4,$5)', [entity, recordId, JSON.stringify(record), stamp, stamp]);
  res.status(201).json({ id: recordId, ...record, created_date: stamp, updated_date: stamp });
}));

app.post('/api/entities/:entity/bulk', requireAuth, route(async (req, res) => {
  const entity = req.params.entity, items = req.body.items || [];
  if (!entities.has(entity) || !Array.isArray(items)) return res.status(400).json({ error: 'Invalid bulk request' });
  if (entity === 'TournamentPermission' || (await Promise.all(items.map((item) => canWrite(entity, item, item, req.user)))).some((allowed) => !allowed)) return res.status(403).json({ error: 'You do not have permission to modify one or more records.' });
  const stamp = now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const output = [];
    for (const data of items) {
      const recordId = id();
      await client.query('INSERT INTO records (entity,id,data,created_date,updated_date) VALUES ($1,$2,$3::jsonb,$4,$5)', [entity, recordId, JSON.stringify(data), stamp, stamp]);
      output.push({ id: recordId, ...data, created_date: stamp, updated_date: stamp });
    }
    await client.query('COMMIT');
    res.status(201).json(output);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

app.patch('/api/entities/:entity/:id', requireAuth, route(async (req, res) => {
  const entity = req.params.entity, old = await getRecord(entity, req.params.id);
  if (!old) return res.status(404).json({ error: 'Record not found' });
  const claiming = entity === 'Tournament' && !old.created_by_id && req.body.created_by_id === req.user.id;
  if (entity === 'TournamentPermission') {
    const tournament = await getTournament(old.tournament_id);
    if (!(await hasRole(tournament, req.user, ['admin']))) return res.status(403).json({ error: 'Only the owner can change permissions.' });
    if (['tournament_id', 'user_id', 'tournament_owner_id'].some((key) => key in req.body && req.body[key] !== old[key])) return res.status(400).json({ error: 'A membership cannot be moved to another user or tournament.' });
    if ('role' in req.body) {
      req.body.role = normalizedMemberRole(req.body.role);
      if (!memberRoles.has(req.body.role)) return res.status(400).json({ error: 'Invalid membership role.' });
    }
  } else if (!claiming && !(await canWrite(entity, old, req.body, req.user))) return res.status(403).json({ error: 'You do not have permission to modify this tournament.' });
  const data = { ...old, ...req.body };
  delete data.id;
  delete data.created_date;
  delete data.updated_date;
  if (entity === 'Match' && isFinalized(data)) {
    if (data.stage === 'KNOCKOUT_STAGE' && data.home_score === data.away_score && !data.winner_team_id) return res.status(400).json({ error: 'A knockout match cannot end in a draw without winner_team_id.' });
    if (data.winner_team_id && ![data.home_team_id, data.away_team_id].includes(data.winner_team_id)) return res.status(400).json({ error: 'winner_team_id must be one of the competing teams.' });
  }
  const stamp = now();
  await pool.query('UPDATE records SET data=$1::jsonb,updated_date=$2 WHERE entity=$3 AND id=$4', [JSON.stringify(data), stamp, entity, old.id]);
  const updated = { id: old.id, ...data, created_date: old.created_date, updated_date: stamp };
  if (entity === 'Match' && isFinalized(updated)) {
    await processCompetitionResult(updated);
  }
  res.json(updated);
}));

app.delete('/api/entities/:entity/:id', requireAuth, route(async (req, res) => {
  const entity = req.params.entity, old = await getRecord(entity, req.params.id);
  if (!old) return res.status(404).end();
  if (entity === 'TournamentPermission') {
    const tournament = await getTournament(old.tournament_id);
    if (old.user_id !== req.user.id && !(await hasRole(tournament, req.user, ['admin']))) return res.status(403).json({ error: 'Only the owner can revoke this membership.' });
  } else if (!(await canWrite(entity, old, {}, req.user))) return res.status(403).json({ error: 'You do not have permission to modify this tournament.' });
  await pool.query('DELETE FROM records WHERE entity=$1 AND id=$2', [entity, req.params.id]);
  res.status(204).end();
}));

app.delete('/api/entities/:entity', requireAuth, route(async (req, res) => {
  let filter = {};
  try {
    filter = JSON.parse(req.query.filter || '{}');
  } catch {
    return res.status(400).json({ error: 'Invalid filter' });
  }
  const { filter: _f, sort, limit, ...queryParams } = req.query;
  filter = { ...queryParams, ...filter };

  const doomed = await records(req.params.entity, filter);
  if ((await Promise.all(doomed.map((record) => canWrite(req.params.entity, record, {}, req.user)))).some((allowed) => !allowed)) return res.status(403).json({ error: 'You do not have permission to delete one or more records.' });
  await pool.query('DELETE FROM records WHERE id = ANY($1::text[])', [doomed.map((record) => record.id)]);
  res.json({ deleted: doomed.length });
}));

app.post('/api/functions/validateFixture', requireAuth, route(async (req, res) => {
  const { tournament_id, round, home_team_id, away_team_id, match_id } = req.body;
  if (!(await hasRole(await getTournament(tournament_id), req.user, ['fixtures', 'admin']))) return res.status(403).json({ error: 'You do not have permission to manage fixtures.' });
  if (!tournament_id || !round || !home_team_id || !away_team_id) return res.status(400).json({ error: 'Missing required fields (tournament_id, round, home_team_id, away_team_id)' });
  if (home_team_id === away_team_id) return res.status(400).json({ error: 'Home and away teams must be different' });
  const conflict = (await records('Match', { tournament_id })).find((match) => match.round === Number(round) && match.id !== match_id && [match.home_team_id, match.away_team_id].some((team) => team === home_team_id || team === away_team_id));
  if (conflict) return res.status(409).json({ error: 'A selected team already has a match in this round.' });
  res.json({ valid: true });
}));

const upload = multer({ storage: multer.diskStorage({ destination: uploadsDir, filename: (_req, file, cb) => cb(null, `${id()}${path.extname(file.originalname)}`) }) });
app.post('/api/uploads', requireAuth, upload.single('file'), (req, res) => res.json({ file_url: `/uploads/${req.file.filename}` }));
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: 'Internal server error' }); });

if (!process.env.VERCEL) {
  const server = app.listen(Number(process.env.PORT || 3001), () => console.log(`Local API listening on http://localhost:${process.env.PORT || 3001}`));
  server.on('error', (error) => { if (error.code === 'EADDRINUSE') console.warn(`Local API is already running on port ${process.env.PORT || 3001}; using the existing instance.`); else throw error; });
}

export { app };
export default app;
