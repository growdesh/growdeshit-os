# AGENTS.md — GrowDeshIT OS Engineering & Deployment Guidelines

## Deployment Rule

**Deployment Rule:** Whenever new changes are pushed or merged into the GitHub repository, the hosting environment must also be updated with the latest codebase. Ensure the deployment process keeps the GitHub repository and hosting server synchronized.

All future development must follow this deployment workflow so production hosting always reflects the latest repository state.

## Architecture & Operational Rules

- **Stack:** React (Vite) + Tailwind CSS + PWA frontend (`/client`) and Node.js + Express + MySQL (`mysql2/promise`) backend (`/server`), served from `/server.ts` on `process.env.PORT || 3000`.
- **Automatic First-Time Database Bootstrap:**
  - Database tables, versioned migrations (`schema_migrations`), and initial default data are executed automatically and idempotently on server startup and first API request via `server/database/bootstrap.ts` and `server/config/db.ts`.
  - Never require manual SQL imports or an interactive UI setup screen to initialize the database or Superadmin account.
  - Migrations and seeding must never duplicate records or overwrite existing user/business data.
- **Authentication & Credential Hygiene:**
  - Never store or configure admin account credentials in environment variables.
  - All user and Superadmin accounts are stored in the MySQL `users` table with bcrypt-hashed passwords.
  - Keep all SQL queries strictly parameterized (`?` placeholders) without enabling `multipleStatements`.
- **Verification Before Push/Deploy:**
  - Run `npm run lint`, `npm test`, and `npm run build` before pushing or merging changes to GitHub and syncing the hosting server.
