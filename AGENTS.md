# AGENTS.md

## Project Context

This is a **local full-stack tournament management application** that has been fully decoupled from Base44. It runs 100% locally with:
- **Frontend**: React + Vite
- **Backend**: Express.js server
- **Database**: SQLite (via better-sqlite3)
- **Authentication**: Local JWT-based auth with bcryptjs

Start with `README.md` for local setup, environment variables, and development workflow.

## Key Files

- `src/`: frontend application source (React components, pages, hooks)
- `src/api/localClient.js`: local API client that mimics Base44 SDK pattern but calls local Express server
- `server/index.js`: Express.js server with SQLite database and authentication
- `vite.config.js`: Vite config with proxy to local backend (port 3001)
- `.env.local`: local environment variables (JWT_SECRET, DATABASE_PATH, PORT)

## Working Notes

- Use `npm run dev` as the default local development command - it runs both the Express server and Vite frontend concurrently
- The Express server runs on port 3001 (configurable via PORT env var)
- The Vite frontend proxies `/api` and `/uploads` requests to the Express server
- SQLite database file is stored at `data/tournament.sqlite` (configurable via DATABASE_PATH)
- File uploads are stored locally in the `uploads/` directory
- Authentication uses JWT tokens stored in localStorage with key `tournament_local_token`
- The local client (`globalThis.__LOCAL_DB__`) provides the same interface as the Base44 SDK for compatibility
- Run the relevant checks from `package.json` (lint, typecheck) before finishing code changes
