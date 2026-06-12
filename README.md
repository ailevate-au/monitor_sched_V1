# SiteWize

Construction project control for Australian Tier 1–2 builders — scheduling, resources, finance, progress claims, and reference data in one workspace.

## Run locally

**Prerequisites:** Node.js 18+

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env` from `.env.example` (SQLite DB is created automatically):
   ```bash
   cp .env.example .env
   ```
3. Push schema and seed demo data (optional — also runs on first `npm run dev`):
   ```bash
   npm run db:push
   npm run db:seed
   ```
4. Start the app:
   ```bash
   npm run dev
   ```

   Default URL: **http://localhost:3001**

## Production build

```bash
npm run build
npm start
```

Set `PORT` in `.env` if you need a port other than 3001.

## Deploy with Docker + Traefik

Based on Traefik patterns used in other projects in this machine, this repo now includes:

- `Dockerfile`
- `docker-compose.yml` (Traefik labels + external `traefik_network`)
- `env/sitewize.traefik.env.example`

Setup:

```bash
mkdir -p env
cp env/sitewize.traefik.env.example env/sitewize.traefik.env
docker compose up -d --build
```

Notes:

- Compose uses external network `traefik_network` (must already exist on the host).
- `DATABASE_URL=file:./dev.db` is resolved next to `prisma/schema.prisma` → `prisma/dev.db`.
- Live URL: **https://sitewize.ailevate.com.au**

## Database (Prisma + SQLite)

- Schema: [`prisma/schema.prisma`](prisma/schema.prisma)
- Seed data: [`src/server/seedData.ts`](src/server/seedData.ts)
- DB file: `prisma/dev.db` (gitignored; path is relative to `schema.prisma`, so use `DATABASE_URL=file:./dev.db`)
- Reset and reseed: `npm run db:reset`
