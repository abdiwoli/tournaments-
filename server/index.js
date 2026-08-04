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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.resolve(root, '.env.local') });
dotenv.config({ path: path.resolve(root, '.env') });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Set it in .env.local or .env.');

const dataDir = path.resolve(root, 'data');
const uploadsDir = path.resolve(root, 'uploads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined });
const schema = fs.readFileSync(path.resolve(root, 'server/schema.sql'), 'utf8');
await pool.query(schema);

const entities = new Set(['Tournament', 'Team', 'Player', 'Match', 'TournamentPermission', 'Goal', 'Appearance']);
const secret = process.env.JWT_SECRET || 'development-only-change-me';
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const present = (row) => row && ({ id: row.id, ...row.data, created_date: row.created_date, updated_date: row.updated_date });
const auth = (req, _res, next) => { const token = req.headers.authorization?.replace('Bearer ', ''); try { req.user = token && jwt.verify(token, secret); } catch { req.user = null; } next(); };
const requireAuth = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Authentication required' });
const signed = (user) => ({ access_token: jwt.sign({ id: user.id, email: user.email, role: user.role }, secret, { expiresIn: '7d' }), user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role } });
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(auth);
app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));


async function getRecord(entity, recordId) { const result = await pool.query('SELECT * FROM records WHERE entity=$1 AND id=$2', [entity, recordId]); return present(result.rows[0]); }
async function getTournament(tournamentId) { return tournamentId ? getRecord('Tournament', tournamentId) : null; }
async function records(entity, filter = {}, sort = 'created_date', limit = 100) {
  const result = await pool.query('SELECT * FROM records WHERE entity=$1', [entity]);
  let output = result.rows.map(present).filter((record) => Object.entries(filter).every(([key, condition]) => {
    if (condition && typeof condition === 'object') { if ('$in' in condition) return condition.$in.includes(record[key]); if ('$lte' in condition) return record[key] <= condition.$lte; }
    return record[key] === condition;
  }));
  const descending = String(sort || '').startsWith('-');
  const key = String(sort || 'created_date').replace(/^-/, '');
  output.sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? ''), undefined, { numeric: true }));
  if (descending) output.reverse();
  return output.slice(0, Number(limit) || 100);
}
async function memberRole(tournamentId, userId) { return (await records('TournamentPermission', { tournament_id: tournamentId, user_id: userId }, 'created_date', 1))[0]?.role; }
async function hasRole(tournament, user, allowed = []) { return !!tournament && !!user && (tournament.created_by_id === user.id || user.role === 'admin' || allowed.includes(await memberRole(tournament.id, user.id))); }
async function canWrite(entity, record, changes, user) {
  const data = { ...record, ...changes };
  if (entity === 'Tournament') return !!user && (data.created_by_id === user.id || user.role === 'admin');
  const tournament = await getTournament(data.tournament_id);
  if (entity === 'Team' || entity === 'Player') return hasRole(tournament, user, ['teams', 'admin']);
  if (entity === 'Match') { const resultEdit = ['home_score', 'away_score', 'motm_player_id', 'motm_player_name'].some((key) => key in changes) || ['closed', 'completed', 'live'].includes(changes.status); return hasRole(tournament, user, resultEdit ? ['results', 'goals', 'admin'] : ['fixtures', 'admin']); }
  if (entity === 'Goal' || entity === 'Appearance') return hasRole(tournament, user, ['results', 'goals', 'admin']);
  return false;
}

app.post('/api/auth/register', route(async (req, res) => { const { email, password, full_name = '' } = req.body; if (!email || !password || password.length < 6) return res.status(400).json({ error: 'Use an email and a password with at least 6 characters.' }); const normalized = email.toLowerCase(); if ((await pool.query('SELECT 1 FROM users WHERE email=$1', [normalized])).rowCount) return res.status(409).json({ error: 'An account with this email already exists.' }); const user = { id: id(), email: normalized, full_name, role: 'user', created_date: now() }; await pool.query('INSERT INTO users (id,email,password_hash,full_name,role,created_date) VALUES ($1,$2,$3,$4,$5,$6)', [user.id, user.email, await bcrypt.hash(password, 12), user.full_name, user.role, user.created_date]); res.json(signed(user)); }));
app.post('/api/auth/login', route(async (req, res) => { const userResult = await pool.query('SELECT * FROM users WHERE email=$1', [(req.body.email || '').toLowerCase()]); const user = userResult.rows[0]; if (!user || !(await bcrypt.compare(req.body.password || '', user.password_hash))) return res.status(401).json({ error: 'Invalid email or password.' }); res.json(signed(user)); }));
app.get('/api/auth/me', requireAuth, route(async (req, res) => { const result = await pool.query('SELECT id,email,full_name,role FROM users WHERE id=$1', [req.user.id]); if (!result.rows[0]) return res.status(401).json({ error: 'Session is invalid.' }); res.json(result.rows[0]); }));
app.post('/api/auth/reset-request', route(async (req, res) => { const user = (await pool.query('SELECT id FROM users WHERE email=$1', [(req.body.email || '').toLowerCase()])).rows[0]; if (!user) return res.json({ ok: true }); const token = crypto.randomBytes(32).toString('hex'); await pool.query('INSERT INTO password_resets (token,user_id,expires_at) VALUES ($1,$2,$3)', [token, user.id, Date.now() + 1800000]); res.json({ ok: true, reset_token: token }); }));
app.post('/api/auth/reset', route(async (req, res) => { const reset = (await pool.query('SELECT * FROM password_resets WHERE token=$1 AND expires_at>$2', [req.body.resetToken, Date.now()])).rows[0]; if (!reset || !req.body.newPassword || req.body.newPassword.length < 6) return res.status(400).json({ error: 'This reset link is invalid or expired.' }); await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(req.body.newPassword, 12), reset.user_id]); await pool.query('DELETE FROM password_resets WHERE token=$1', [req.body.resetToken]); res.json({ ok: true }); }));

const googleState = new Map();
app.get('/api/auth/google', (req, res) => { const clientId = process.env.GOOGLE_CLIENT_ID; if (!clientId) return res.status(503).send('Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local.'); const state = crypto.randomBytes(24).toString('hex'); googleState.set(state, Date.now() + 600000); const params = new URLSearchParams({ client_id: clientId, redirect_uri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback', response_type: 'code', scope: 'openid email profile', access_type: 'online', state }); res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`); });
app.get('/api/auth/google/callback', route(async (req, res) => { const { code, state } = req.query; const expires = googleState.get(state); googleState.delete(state); if (!code || !expires || expires < Date.now()) return res.status(400).send('Google sign-in session expired. Please try again.'); const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback'; const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: 'authorization_code' }) }); const tokens = await tokenResponse.json(); if (!tokenResponse.ok) throw new Error(tokens.error_description || 'Google token exchange failed'); const profile = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } })).json(); if (!profile.email) throw new Error('Google did not provide an email address'); let user = (await pool.query('SELECT * FROM users WHERE google_id=$1 OR email=$2', [profile.sub, profile.email.toLowerCase()])).rows[0]; if (!user) { user = { id: id(), email: profile.email.toLowerCase(), password_hash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12), full_name: profile.name || profile.email.split('@')[0], role: 'user', created_date: now(), google_id: profile.sub }; await pool.query('INSERT INTO users (id,email,password_hash,full_name,role,created_date,google_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [user.id,user.email,user.password_hash,user.full_name,user.role,user.created_date,user.google_id]); } else if (!user.google_id) { await pool.query('UPDATE users SET google_id=$1 WHERE id=$2', [profile.sub, user.id]); } const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'; res.redirect(`${frontendUrl}/?access_token=${encodeURIComponent(signed(user).access_token)}`); }));

app.get('/api/entities/:entity', route(async (req, res) => { if (!entities.has(req.params.entity)) return res.status(404).json({ error: 'Unknown entity' }); let filter = {}; try { filter = JSON.parse(req.query.filter || '{}'); } catch { return res.status(400).json({ error: 'Invalid filter' }); } let output = await records(req.params.entity, filter, req.query.sort, req.query.limit); if (req.params.entity === 'TournamentPermission') { output = req.user ? output.filter((p) => p.user_id === req.user.id || (getTournament(p.tournament_id) && false)) : []; const all = await records('Tournament', {}, 'created_date', 10000); const owned = new Set(all.filter((t) => t.created_by_id === req.user?.id).map((t) => t.id)); if (req.user?.role === 'admin') output = await records(req.params.entity, filter, req.query.sort, req.query.limit); else output = output.concat((await records(req.params.entity, filter, req.query.sort, req.query.limit)).filter((p) => owned.has(p.tournament_id) && !output.some((x) => x.id === p.id))); } res.json(output); }));
app.get('/api/entities/:entity/:id', route(async (req, res) => { if (!entities.has(req.params.entity)) return res.status(404).json({ error: 'Unknown entity' }); const output = await getRecord(req.params.entity, req.params.id); output ? res.json(output) : res.status(404).json({ error: 'Record not found' }); }));
app.post('/api/entities/:entity', requireAuth, route(async (req, res) => { const entity = req.params.entity; if (!entities.has(entity)) return res.status(404).json({ error: 'Unknown entity' }); const record = { ...req.body }; if (entity === 'Tournament') record.created_by_id = req.user.id; else if (entity === 'TournamentPermission') { const tournament = await getTournament(record.tournament_id); if (!tournament) return res.status(404).json({ error: 'Tournament not found' }); if (record.user_id !== req.user.id && !(await hasRole(tournament, req.user, ['admin']))) return res.status(403).json({ error: 'Only the owner can add staff.' }); record.role = record.user_id === req.user.id ? 'follower' : record.role; record.tournament_owner_id = tournament.created_by_id; } else if (!(await canWrite(entity, record, record, req.user))) return res.status(403).json({ error: 'You do not have permission to modify this tournament.' }); const stamp = now(), recordId = id(); await pool.query('INSERT INTO records (entity,id,data,created_date,updated_date) VALUES ($1,$2,$3::jsonb,$4,$5)', [entity, recordId, JSON.stringify(record), stamp, stamp]); res.status(201).json({ id: recordId, ...record, created_date: stamp, updated_date: stamp }); }));
app.post('/api/entities/:entity/bulk', requireAuth, route(async (req, res) => { const entity = req.params.entity, items = req.body.items || []; if (!entities.has(entity) || !Array.isArray(items)) return res.status(400).json({ error: 'Invalid bulk request' }); if (entity === 'TournamentPermission' || (await Promise.all(items.map((item) => canWrite(entity, item, item, req.user)))).some((allowed) => !allowed)) return res.status(403).json({ error: 'You do not have permission to modify one or more records.' }); const stamp = now(); const client = await pool.connect(); try { await client.query('BEGIN'); const output = []; for (const data of items) { const recordId = id(); await client.query('INSERT INTO records (entity,id,data,created_date,updated_date) VALUES ($1,$2,$3::jsonb,$4,$5)', [entity, recordId, JSON.stringify(data), stamp, stamp]); output.push({ id: recordId, ...data, created_date: stamp, updated_date: stamp }); } await client.query('COMMIT'); res.status(201).json(output); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } }));
app.patch('/api/entities/:entity/:id', requireAuth, route(async (req, res) => { const entity = req.params.entity, old = await getRecord(entity, req.params.id); if (!old) return res.status(404).json({ error: 'Record not found' }); const claiming = entity === 'Tournament' && !old.created_by_id && req.body.created_by_id === req.user.id; if (entity === 'TournamentPermission') { const tournament = await getTournament(old.tournament_id); if (!(await hasRole(tournament, req.user, ['admin']))) return res.status(403).json({ error: 'Only the owner can change permissions.' }); } else if (!claiming && !(await canWrite(entity, old, req.body, req.user))) return res.status(403).json({ error: 'You do not have permission to modify this tournament.' }); const data = { ...old, ...req.body }; delete data.id; delete data.created_date; delete data.updated_date; const stamp = now(); await pool.query('UPDATE records SET data=$1::jsonb,updated_date=$2 WHERE entity=$3 AND id=$4', [JSON.stringify(data), stamp, entity, old.id]); res.json({ id: old.id, ...data, created_date: old.created_date, updated_date: stamp }); }));
app.delete('/api/entities/:entity/:id', requireAuth, route(async (req, res) => { const entity = req.params.entity, old = await getRecord(entity, req.params.id); if (!old) return res.status(404).end(); if (entity === 'TournamentPermission') { const tournament = await getTournament(old.tournament_id); if (old.user_id !== req.user.id && !(await hasRole(tournament, req.user, ['admin']))) return res.status(403).json({ error: 'Only the owner can revoke this membership.' }); } else if (!(await canWrite(entity, old, {}, req.user))) return res.status(403).json({ error: 'You do not have permission to modify this tournament.' }); await pool.query('DELETE FROM records WHERE entity=$1 AND id=$2', [entity, req.params.id]); res.status(204).end(); }));
app.delete('/api/entities/:entity', requireAuth, route(async (req, res) => { let filter = {}; try { filter = JSON.parse(req.query.filter || '{}'); } catch { return res.status(400).json({ error: 'Invalid filter' }); } const doomed = await records(req.params.entity, filter); if ((await Promise.all(doomed.map((record) => canWrite(req.params.entity, record, {}, req.user)))).some((allowed) => !allowed)) return res.status(403).json({ error: 'You do not have permission to delete one or more records.' }); await pool.query('DELETE FROM records WHERE id = ANY($1::text[])', [doomed.map((record) => record.id)]); res.json({ deleted: doomed.length }); }));
app.post('/api/functions/validateFixture', requireAuth, route(async (req, res) => { const { tournament_id, round, home_team_id, away_team_id, match_id } = req.body; if (!(await hasRole(await getTournament(tournament_id), req.user, ['fixtures', 'admin']))) return res.status(403).json({ error: 'You do not have permission to manage fixtures.' }); if (!tournament_id || !round || !home_team_id || !away_team_id) return res.status(400).json({ error: 'Missing required fields (tournament_id, round, home_team_id, away_team_id)' }); if (home_team_id === away_team_id) return res.status(400).json({ error: 'Home and away teams must be different' }); const conflict = (await records('Match', { tournament_id })).find((match) => match.round === Number(round) && match.id !== match_id && [match.home_team_id, match.away_team_id].some((team) => team === home_team_id || team === away_team_id)); if (conflict) return res.status(409).json({ error: 'A selected team already has a match in this round.' }); res.json({ valid: true }); }));

const upload = multer({ storage: multer.diskStorage({ destination: uploadsDir, filename: (_req, file, cb) => cb(null, `${id()}${path.extname(file.originalname)}`) }) });
app.post('/api/uploads', requireAuth, upload.single('file'), (req, res) => res.json({ file_url: `/uploads/${req.file.filename}` }));
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ error: 'Internal server error' }); });
if (!process.env.VERCEL) {
  const server = app.listen(Number(process.env.PORT || 3001), () => console.log(`Local API listening on http://localhost:${process.env.PORT || 3001}`));
  server.on('error', (error) => { if (error.code === 'EADDRINUSE') console.warn(`Local API is already running on port ${process.env.PORT || 3001}; using the existing instance.`); else throw error; });
}

export { app };
export default app;

