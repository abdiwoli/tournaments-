# Local Tournament Manager

The app uses PostgreSQL for all persistent data. The React frontend is served by Vite and the Express API connects through `DATABASE_URL`.

## Setup

1. Install Node.js 22 LTS or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and set `DATABASE_URL`, `JWT_SECRET`, and optional Google OAuth values.
4. Run `npm run dev`.

The API runs at `http://localhost:3001` and Vite at `http://localhost:5173`. On startup, the PostgreSQL schema in `server/schema.sql` is applied automatically. The same `DATABASE_URL` environment variable works locally and on Vercel; add it in Vercel Project Settings → Environment Variables.

Email/password accounts, Google OAuth, local password reset links, tournament ownership, delegated permissions, and local uploads are supported.
