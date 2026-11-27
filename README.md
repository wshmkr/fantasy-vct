A starting point for full-stack web apps. Express + React + MUI with shared TypeScript types.

After creating a repo from this template:

1. Edit `name` and `productName` in `package.json`
2. `npm install` (regenerates the lock file)
3. `sh .github/bootstrap.sh` (applies branch protection and merge settings via `gh`)

## What's included

- **Server**: Express 5, zod-validated env, JSON error middleware, graceful SIGTERM shutdown
- **Client**: React 19, MUI 9, React Router 7, TanStack Query, `apiClient` wrapper
- **Shared**: API contract + entities + app branding derived from `package.json`
- **Build**: Vite (client) + tsc (server), both output to `dist/`
- **Test**: Vitest + supertest + React Testing Library + MSW, v8 coverage
- **Lint**: Biome (format + lint in one tool)
- **CI**: GitHub Actions with PR coverage diff
- **Hooks**: simple-git-hooks (biome + typecheck on pre-push)
- **Deploy**: Multi-stage `Dockerfile` (tsc + vite build, used by container platforms)

## Structure

```
src/
  server/   Express API
  client/   React + Vite + MUI (layout/ + pages/)
  shared/   API contract + entities + branding
```

## Dev

```
npm install
npm run dev
```

- Client on http://localhost:5173 (Vite; proxies `/api` to server)
- Server on http://localhost:3001

## Build & start (prod)

```
npm run build
npm start
```

## Test

```
npm test              # single run
npm run test:watch    # watch mode
npm run test:coverage # text + HTML report
```

## Env

Copy `.env.example` to `.env`. Vars are validated on boot in `src/server/env.ts`.

## Deploy (Fly.io)

One always-on machine with the SQLite file on a volume (`fly.toml`). First time:

```
fly auth login
fly apps create fantasy-vct
fly volumes create data --size 1 --region ewr --yes
fly secrets set SESSION_SECRET=$(openssl rand -hex 32) \
  COMMISSIONER_DISCORD_USERNAME=<discord username> \
  DISCORD_CLIENT_ID=<id> DISCORD_CLIENT_SECRET=<secret>
fly deploy --ha=false
```

The Discord application's OAuth2 redirect must be `https://fantasy-vct.fly.dev/api/auth/discord/callback`. After that, `fly deploy` ships a new version.

- **Admin fixes:** `fly ssh console -C "sqlite3 /data/app.db"`
- **Fill in R, ACS, KAST and ADR** for matches scraped before those columns existed (reads saved pages only): `fly ssh console -C "node dist/server/vlr/backfill-map-averages-cli.js"`
- **Backups:** Fly snapshots the volume daily and keeps 30 days (`fly volumes snapshots list <volume id>`). To restore, create a volume from a snapshot (`fly volumes create data --snapshot-id <id> --region ewr`), destroy the machine and the old volume, then `fly deploy --ha=false`.
- **Local copy:** `fly ssh console -C "sqlite3 /data/app.db '.backup /data/copy.db'"`, then `fly ssh sftp get /data/copy.db`
