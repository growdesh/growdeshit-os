# GrowDeshIT OS

Digital Service Business Management System built for small agency teams (4–5 employees), featuring BDT (`৳`) financial operations, automatic payment schedule reminders, visual reports, activity audit logs, and a secure Model Context Protocol (MCP) server.

## Architecture

```text
/
├── client/src/              # React + Vite + Tailwind + PWA frontend
│   ├── components/          # Modular views (Overview, CRM, Projects, Finance, Reports, Activity Logs, Team & MCP, Notification Bell, Invoice, Auth)
│   ├── context/             # In-memory JWT AuthContext
│   ├── hooks/               # PWA install & online status hooks
│   ├── services/            # Typed REST API client
│   ├── types/               # Shared frontend TypeScript models
│   └── utils/               # BDT (৳) currency & date formatters
├── server/                  # Express + MySQL (MVC + Service Layer)
│   ├── config/db.ts         # MySQL2 connection pool + local preview fallback
│   ├── controllers/         # HTTP & Streamable HTTP MCP handlers
│   ├── database/schema.sql  # MySQL 8+ production schema (includes schedules, notifications, audit logs, mcp_tokens)
│   ├── middleware/          # JWT authentication & role-based guards
│   ├── routes/              # REST API + /api/mcp routes
│   ├── services/            # Core shared business logic (Web + MCP)
│   └── utils/               # Pure financial/ID/privacy logic & node:test unit tests
├── public/                  # PWA icons (SVG + 192px/512px/maskable/apple-touch PNGs)
├── server.ts                # Full-stack entrypoint (Vite middleware in dev, dist/ in prod)
└── .env.example             # Environment variable template
```

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and configure your values:
   ```bash
   cp .env.example .env
   ```
3. (Optional for local MySQL) Create a MySQL database and import the schema:
   ```bash
   mysql -u root -p your_database < server/database/schema.sql
   ```
   If `DB_HOST` is left blank, the server runs with a pre-seeded BDT preview store.
4. Start development server on port `3000`:
   ```bash
   npm run dev
   ```
5. On first run (when `ADMIN_PASSWORD` is unset), open `http://localhost:3000` to create your initial `superadmin` account.
6. Run unit tests:
   ```bash
   npm test
   ```

## Secure MCP Server Integration (`/api/mcp`)

GrowDeshIT OS exposes a Streamable HTTP MCP server at `POST /api/mcp` authenticated via personal MCP Bearer tokens (`gdit_mcp_...`).

1. Sign in to GrowDeshIT OS and open **Team & MCP**.
2. Generate a personal MCP access token (stored as a SHA-256 hash; the raw token is shown once).
3. Copy the generated JSON snippet into Claude Desktop, Cursor, or any Streamable HTTP MCP client:
   ```json
   {
     "mcpServers": {
       "growdeshit-os": {
         "url": "https://your-domain.com/api/mcp",
         "headers": {
           "Authorization": "Bearer <YOUR_PERSONAL_MCP_TOKEN>"
         }
       }
     }
   }
   ```
4. **Strict Customer Privacy & RBAC**:
   - Customer personal data (name, email, phone, company, CRM profile) is **never** exposed via any MCP tool. Projects and financial reports only reference anonymized codes (`CU-101`).
   - Role permissions (`superadmin` vs `employee`) are enforced identically across Web and MCP.
   - Every MCP tool call is logged to **Activity Logs** with `Source: MCP`.

## Deploying to Hostinger Business Web Hosting (Node.js + MySQL)

1. **Create MySQL Database in Hostinger hPanel**:
   - Open **Databases → Management**, create a MySQL database and user, and note `DB_HOST`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`.
   - Open **phpMyAdmin** for that database and import `server/database/schema.sql`.
2. **Build the Frontend Bundle**:
   ```bash
   npm install
   npm run build
   ```
   This outputs the production React SPA + PWA service worker into `/dist`.
3. **Configure Environment Variables in Hostinger Node.js App**:
   - `NODE_ENV=production`
   - `PORT=3000` (Hostinger automatically injects `process.env.PORT`; `server.ts` honors `process.env.PORT || 3000`)
   - `DB_HOST`, `DB_PORT=3306`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
   - `JWT_SECRET` (generate a strong 32+ character random string)
   - Optionally set `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PHONE`, `ADMIN_PASSWORD` or claim the first `superadmin` account via the browser setup screen.
4. **Start the Production Server**:
   - Set startup entry file to `server.ts` (or run `npx tsx server.ts` / `npm start` on Node 22+). Express automatically serves `/dist` and all `/api/*` endpoints from the same origin.
