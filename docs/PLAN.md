# Fantasy VCT: Orchestrator Handoff

You are the **orchestrator** for this project. You plan the work, hand work packages to subagents, review and simplify what they return, and commit it. Keep going, package after package, until **Checkpoint 1** is finished or you hit one of the stop conditions in §2.4.

**Stop after Checkpoint 1.** The user will re-plan the rest with what was learned. Checkpoints 2 and 3 are included only as context for design decisions; don't start them.

This file is the source of truth. If a subagent's opinion conflicts with it, this file wins. If the user conflicts with it, the user wins: update this file and keep going.

---

## 1. What we're building

A private fantasy league web app for one **commissioner** and about 7 friends. It replaces a Google Sheet they used for VCT Challengers NA 2024 Split 1.

1. The commissioner decides who can log in by adding friends' **Discord usernames**.
2. The commissioner adds a **tournament** by pasting a VLR.gg event link. Its teams, players (with VLR photos, top 3 agents and recent form stats), coaches and **stages** are imported automatically. The full match schedule (including upcoming matches) comes in too. Tournaments appear as cards on the home page; usually one is running at a time, but they can overlap.
3. Each stage has its own **live snake draft**. Every manager drafts **5 players and 1 coach**, then keeps swapping 1-for-1 until they **lock** their roster.
4. Later (checkpoints 2 and 3): the app scrapes match stats, scores every rostered player and coach, shows standings and posts recaps to Discord.

Keep it **as simple as possible**. There are about 8 users, so build nothing for scale, multi-tenancy, i18n, analytics or mobile. Do build things so they don't lose data and don't show wrong numbers.

### 1.1 Game rules (settled with the user; don't re-ask)

| Rule | Value |
|---|---|
| Access | Only Discord users the commissioner has added can log in. The commissioner is set by env (§4.3). |
| Tournaments | Only the commissioner adds tournaments. Every allowed user can see every tournament. |
| Joining | Users **join** a tournament themselves (picking their color as they join), up to 8. Only joined users are managers. Joining stays open until the commissioner **closes** it; starting a stage's draft closes it automatically, which locks in exactly who's playing. The commissioner can remove a manager or reopen joining. Anything odder gets fixed in the database (§2.0). |
| Stages | **Created automatically from the stages listed on the VLR event page.** Each stage has its own draft (a redraft between stages). Tournament total = sum of stage totals. |
| Roster | **5 players + 1 coach.** **No roles**: many pros play several roles now, so the app never tracks or enforces them. |
| Coaches | Each team's head coach is in the draft pool. If VLR lists no coach for a team, create a placeholder named "`<Team name>` Coach" (capital C, for example "Sentinels Coach"). Coaches earn points from how their team performs; that formula is decided in checkpoint 2. |
| Ownership | A player or coach can be on at most one roster per stage. No limit on picks from the same team. |
| Draft phase | Live snake draft. Order randomized per stage. **6 rounds**: each manager picks 5 players and 1 coach, with the coach in any round. Running out the clock **autopicks a random legal choice**. |
| Swap phase | After round 6 the snake keeps going. On your turn you either **swap** one of your rostered picks for an available one of the same kind (player for player, coach for coach), or **lock**. A swap ends your turn, and the released pick goes straight back into the pool. Locked managers are skipped. Running out the clock in this phase **locks your roster**. The draft ends when every manager has locked. |
| Manager color | Each manager picks one of 16 preset colors per tournament. It can't repeat within a tournament. |
| Scale | Up to **8 managers** per tournament and up to **16 teams** (about 96 pickables). Every screen must fit that comfortably on a desktop screen. |
| Progress | A tournament's progress is matches played ÷ total matches, from the VLR schedule (upcoming matches included). |
| Look | Orange-branded, dark, glass panes, desktop only, minimal text, dense but not cramped (§5). |

**Scoring** (checkpoint 2). Player points come from per-map stats summed over a series. The scoring config is stored as JSON per tournament.

| Stat | Points |
|---|---|
| Kill | +5 |
| Death | −5 |
| Assist | +2 |
| First kill | +5 |
| First death | −5 |
| 3K round | +5 |
| 4K round | +5 |
| Ace (5K round) | +25 (not also counted as a multi-kill) |
| Clutch won (1v1 to 1v5) | +10 |
| Sweep (2-0 in a Bo3, 3-0 in a Bo5) | +15 to every player on the winning team, once per series |
| Coach | From team results. Formula to be decided at re-planning. |

### 1.1a Settled with the user (don't propose these again)

- **No deployment in Checkpoint 1.** Everything runs locally. Deployment is decided at re-planning.
- **The swap phase is uncapped.** There's no limit on swap rounds or swaps per manager, and the group agrees not to swap endlessly. It ends when everyone has locked, either themselves or by timeout. Swap turns use the same `pick_seconds` timer.
- **VLR stays the data source** under the §2.5 etiquette (minimal, cached requests). Don't suggest other sources.
- **The user creates the Discord app** later. Until then, use the dev login (§4.3); don't ask for credentials during Checkpoint 1.
- **No backups for now.**

### 1.2 Open questions (use these defaults, and flag them in the checkpoint report)

- **Locking out of turn:** allowed. A manager with a full roster can lock at any time during the swap phase, not only on their turn.
- **Re-drafting a released pick:** allowed. A pick released in a swap is a normal available pick, even for the manager who released it.
- **Form window:** form stats and top 3 agents come from each player's VLR page over the **last 90 days**. If the page doesn't offer 90 days, use the closest window it has.
- **Stats data source:** VLR stays the source. It's the only free source with multi-kills and per-player clutches, but its terms of service forbid bots and systematic scraping, so keep requests minimal and cached (§2.5). Liquipedia's LPDB API is a possible later source for schedules and rosters (its rows carry VLR ids). Keep all VLR parsing behind `src/server/vlr/` so a source can be swapped later.
- **Daily standings post** (checkpoint 3): 00:00 America/Los_Angeles. **Standings tiebreak** (checkpoint 2): best single pick, then alphabetical.

---

## 2. How to work

### 2.0 Keep it simple (applies to every package and every review)

There will be **fewer than 10 users, all friends**. Problems get solved by talking, or by the commissioner fixing data directly. Build the main path well and stop there.

- **Enforce only the rules that protect the game:**
  - turn order
  - one owner per pickable (a unique constraint)
  - roster composition (5 + 1)
  - joined managers only

  Everything else can be loose.
- **Don't build:**
  - race handling beyond SQLite transactions and unique constraints
  - retries
  - rate limiting
  - input-size limits
  - defenses against malicious users beyond the login allowlist
  - clock-skew handling
  - recovery from a server restart mid-draft (the commissioner presses pause, then resume)
  - error-code catalogs
  - admin screens for rare fixes
- **Social rules beat code.** For example, nothing stops endless swapping; the group just agrees not to.
- **Overrides:** the commissioner can edit any row directly with **Drizzle Studio** (`npm run db:studio`). If something is rare and fixable there, don't build UI or code paths for it.
- **Code review:** with `/code-review`, fix only real bugs on paths that will actually happen. Dismiss findings about unlikely edge cases, and don't add defensive code for them.
- **Tests** cover the main rules, not every permutation.

### 2.1 User rules (mandatory)

- **Never work on `main`.** Develop each work package in a **git worktree** on its own branch, then merge it into `main` locally.
- Name branches `<type>/<summary>`, for example `feat/live-draft` or `fix/snake-order`.
- **No GitHub repo.** Never create one, add a remote or push.
- Prefer self-documenting names over comments. Comments explain *why* (hidden constraints, invariants), never *what*.
- End commit messages with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

### 2.2 Loop for each work package

**Subagents:** spawn every implementation subagent with the Agent tool using **`model: "opus"` and `effort: "medium"`** (Opus 5.5, medium effort). One package per subagent. Run packages in parallel only when §6 marks them parallel-safe.

1. **Prepare.** Create the package's worktree and branch, for example `git worktree add .claude/worktrees/<pkg> -b feat/<summary> main`.
2. **Brief** the subagent with:
   - the package section from §6, copied in full
   - the relevant parts of §3 to §5
   - the worktree path
   - the acceptance checks

   Also tell it what's already built and which files to read first, and that it must commit nothing. The orchestrator commits.
3. **Review the subagent's work.** Do every step yourself, from inside the package worktree (`EnterWorktree` or `cd`):
   1. Read the full diff. Reject it, and send it back to the same subagent with `SendMessage`, if it has any of these:
      - scope creep
      - dead code
      - *what* comments
      - `any`
      - types duplicated outside `src/shared`
      - UI that ignores §5, **especially any extra text**
   2. Run **`/code-review medium`** (the `code-review` skill, args `medium`) on the worktree's diff. Fix confirmed findings that are real bugs on realistic paths. Dismiss unlikely edge cases (§2.0).
   3. Run `npm run lint && npm run typecheck && npm test`.
   4. Run the app and exercise the package's acceptance checks for real: hit the API, open the page, do the flow. Use a browser tool if one is available; otherwise use `curl` plus component tests. For UI packages, take a screenshot and compare it against `docs/design-system/README.md`.
4. **Simplify.** Run **`/simplify`** (the `simplify` skill) in the worktree to apply reuse, simplification and efficiency fixes. Then re-run lint, typecheck, tests and the acceptance checks.
5. **Commit and merge.**
   1. Commit on the package branch.
   2. Merge into `main` locally (fast-forward or merge commit).
   3. Delete the branch and remove the worktree.
   4. Update §8 in this file with the commit hash, and commit that too.

If a package fails review twice, take it back: narrow its scope, or do it yourself.

### 2.3 Checkpoint gate

At the end of Checkpoint 1:
1. Run the full demo script end to end.
2. Report to the user:
   - what works
   - how to run it
   - the defaults you used from §1.2
   - anything blocked
   - screenshots of the tournaments page, the draft room and the rosters
3. End the report with **"Notes for re-planning"**:
   - what was harder or easier than expected
   - what VLR's pages actually look like, as far as checkpoint 2 depends on them
   - shortcuts later work should know about
   - suggested changes to Checkpoints 2 and 3
4. **Stop.** Don't start Checkpoint 2.

### 2.4 Stop and ask the user

- **Never** create a GitHub repo, add a git remote or push.
- **Ask before** deploying, creating a Discord application or webhook, or anything else that leaves this machine. Fetching VLR pages and images under §2.5 is fine.
- **Don't ask for Discord secrets in Checkpoint 1** (§1.1a). Build the OAuth code env-gated and test it with mocked Discord responses.
- **Ask** when a game rule is ambiguous and not covered by §1.
- Build and demo everything with the dev login (§4.3).

### 2.5 VLR.gg etiquette

- One request at a time, at least 3 seconds apart. That includes images.
- Generic User-Agent (`fantasy-vct-bot/0.1`). Don't put personal info in it.
- Cache raw HTML and downloaded images in the DB, and re-parse from the cache. Never hotlink VLR images from the browser.
- Tests and development read **saved fixtures**. Never hit live VLR in a test.
- Don't trust remembered HTML structure or URLs. Fetch a real page once, save it as a fixture, and write selectors against that.

---

## 3. Stack and repo

### 3.1 Base: primordium template

Base the project on <https://github.com/wshmkr/primordium>, the user's own template:
- Express 5 API with zod-validated env
- React 19 + MUI 9 + React Router 7 + TanStack Query
- `src/shared` for the API contract and entities
- Vite + tsc build
- Vitest + supertest + RTL + MSW for tests
- Biome for lint and format
- simple-git-hooks
- Dockerfile

Read its `CLAUDE.md` and `AGENTS.md` and follow their conventions.

**Setup (package 1.0).** `/home/sxc/workspace/fantasy-valorant` isn't a git repo yet; it holds only `docs/`.
1. Clone the template to a temporary location.
2. Copy its files into this directory without its `.git`, keeping `docs/`.
3. In `package.json`, set `name: "fantasy-vct"` and `productName: "Fantasy VCT"`.
4. Run `git init` and `npm install`.
5. Make the initial commit on `main`: "chore: scaffold from primordium". This is the only commit made directly on `main`.

Don't run `.github/bootstrap.sh` (it needs a GitHub remote). The template's `.github/` workflows can stay.

### 3.2 Additions

| Need | Choice |
|---|---|
| Database | SQLite through `better-sqlite3` + `drizzle-orm` (+ `drizzle-kit` for migrations). File at `DATABASE_PATH`, default `./data/app.db`. |
| Discord OAuth | [`arctic`](https://arcticjs.dev) (small OAuth 2.0 client: builds the authorize URL, `state`, code exchange). No auth framework; see §4.3 for why. |
| Sessions | Signed, httpOnly, `SameSite=Lax` cookie holding the user id (HMAC with `SESSION_SECRET`, 30-day expiry). On every request, check the user still has access. No sessions table. |
| Migrations | `drizzle-kit generate` produces SQL migration files under `src/server/db/migrations/`; the server applies pending ones on boot with Drizzle's `migrate()`. Never use `drizzle-kit push`, and never edit a migration that's already merged; add a new one. Commit everything drizzle-kit writes: the `.sql` files and `meta/` (journal and snapshots). |
| Validation | `zod` schemas in `src/shared` for every request body, used by both the server and the client. |
| Icons | [Lucide](https://lucide.dev) via `lucide-react`, and nothing else. |
| Admin overrides | **Drizzle Studio** (`npm run db:studio`, which runs `drizzle-kit studio`): the commissioner edits any row directly. |
| Live draft | Server-Sent Events. Actions are POSTs. |
| HTML parsing | `cheerio` |
| Images | Downloaded once into an `images` table and served from `/api/images/:id` with long cache headers. |
| Scheduling (checkpoint 3) | `node-cron`, in-process |

### 3.3 Layout (target)

```
src/shared/
  entities.ts          User, Tournament, Stage, Team, Pickable, RosterEntry, DraftState, MANAGER_COLORS…
  api.ts               API_ROUTES + request/response types
  snake.ts             seatForTurn(turnNo, seatCount)
src/server/
  db/                  schema.ts, client.ts, migrations/, seed-dev.ts
  auth/                discord.ts, dev-login.ts, session.ts, access.ts
  vlr/                 fetch.ts (throttle + cache), event.ts, matches.ts, team.ts, player.ts, images.ts
  vlr/__fixtures__/    saved VLR HTML
  draft/               service.ts (actions, turn advance, timer, undo), sse.ts
  routes/              members.ts, tournaments.ts, stages.ts, teams.ts, draft.ts, images.ts
src/client/
  theme.ts             MUI theme from docs/design-system/tokens.json
  layout/              AppShell (two background glows + site logo + content column)
  components/          SiteLogo, Pane, LiquidLens, SegmentedControl, StatusBadge, TournamentCard, PlayerPhoto, PlayerChip, AgentIcons, ManagerAvatar, ColorPicker, TeamLogo, StatChip
  glass/               displacement-map.ts (squircle bezel, Snell refraction, quadrant mirror), lens-filter.tsx (SVG filter defs)
  pages/               Tournaments, Tournament (Rosters, Draft, Teams, Settings), Members, Login
```

### 3.4 Environment

Extend `src/server/env.ts`:
- `DATABASE_PATH`
- `SESSION_SECRET`
- `BASE_URL`
- `COMMISSIONER_DISCORD_USERNAME` (required unless `DEV_LOGIN`)
- `DISCORD_CLIENT_ID` (optional)
- `DISCORD_CLIENT_SECRET` (optional)
- `DEV_LOGIN` (boolean, default false; refused when `NODE_ENV=production`)

---

## 4. Domain design

### 4.1 Data model

Write this in Drizzle, using these names.

```
users              id, role: commissioner | member, discord_username (unique, lowercase),
                   discord_id (unique, nullable until first login), display_name (nullable), avatar_url (nullable),
                   added_at, first_login_at (nullable)
tournaments        id, name, vlr_event_url, vlr_event_id, logo_image_id → images (nullable),
                   joining_open (bool, default true), scoring_json, webhook_url (nullable), created_at
tournament_members tournament_id, user_id, color (one of the 16 manager color keys), joined_at   -- the joined managers (≤ 8)
                   PK(tournament_id, user_id), unique(tournament_id, color)
teams              id, vlr_id (unique), name, logo_image_id → images (nullable)
pickables          id, kind: player | coach, vlr_id (unique, nullable for placeholder coaches),
                   handle, team_id → teams, is_placeholder (bool), vlr_url (nullable for placeholders),
                   photo_image_id → images (never null: VLR's default picture when they have none),
                   top_agents_json ([{ name, imageId }] in usage order, at most 3; [] for coaches),
                   form_rating, form_acs, form_kd, form_rounds (all nullable), form_fetched_at (nullable)
tournament_teams   tournament_id, team_id                                  (PK both)
stages             id, tournament_id, name, position,
                   vlr_stage_keys_json (VLR stage keys this stage covers; [] if manual), source: vlr | manual,
                   status: setup | drafting | paused | complete,
                   pick_seconds (default 90), current_turn_no, turn_deadline (nullable ISO), created_at
stage_managers     stage_id, user_id, seat, locked_at (nullable)            PK(stage_id, user_id), unique(stage_id, seat)
stage_pool         stage_id, pickable_id, removed (bool)
roster_entries     stage_id, user_id, pickable_id                          unique(stage_id, pickable_id)
draft_actions      id (autoincrement), stage_id, user_id, action: pick | swap | lock,
                   pickable_in_id (nullable), pickable_out_id (nullable), auto (bool),
                   turn_no_before, created_at
images             id, source_url (unique), content_type, bytes (blob), fetched_at
raw_pages          url (PK), fetched_at, html
matches            id, tournament_id, vlr_id (unique), stage_key, team1_id (nullable while TBD), team2_id (nullable),
                   best_of, scheduled_at (nullable), status: upcoming | live | completed, score1, score2
                   -- checkpoint 2 adds: scrape_status, scrape_error, scraped_at, recap_posted_at
-- checkpoint 2 (sketch)
player_map_stats   match_id, map_no, pickable_id, team_id, agent, k, d, a, fk, fd, mk3, mk4, aces, clutches,
                   source: scraped | manual
```

Rules:
- **`roster_entries` is the current state; `draft_actions` is the history.** `unique(stage_id, pickable_id)` is the real guard against double ownership.
- **Composition is enforced in the action transaction:** at most 5 `player` and 1 `coach` per manager per stage.
- **Manager colors:** 16 keys matching the design tokens (`manager-red`, `manager-red-deep`, …, listed once in `src/shared`). A user picks a free color when joining and can change it later.
- **Joining is enforced in a transaction:** `joining_open` must be true, fewer than 8 joined, and the color is free (`unique(tournament_id, color)`). Starting any stage's draft sets `joining_open = false`.
- **Tournament status is derived, not stored:**
  - Drafting if any stage is drafting or paused
  - Ended when every match is completed (or VLR marks the event completed)
  - Live if any match has started
  - Upcoming otherwise
- **Progress** = completed matches ÷ all matches in the tournament (per stage on the Settings tab).
- **Points** (checkpoint 2) are always computed on read.

### 4.2 Draft engine

**Turn order.** It's a snake over N seats. Turn numbers start at 0 and keep counting past round 6 into the swap phase.
```ts
round = Math.floor(turnNo / N)
seat  = round % 2 === 0 ? turnNo % N : N - 1 - (turnNo % N)
phase = round < 6 ? 'draft' : 'swap'
```
- **Advancing the turn** means incrementing `current_turn_no` until it lands on an unlocked manager's seat (only swap-phase seats can be locked).
- When every manager is locked, set status to `complete`, clear the deadline and stop.
- Each turn sets `turn_deadline = now + pick_seconds`.

**Actions.** `POST /api/stages/:id/draft/actions`, each in **one SQLite transaction**:

| Action | Body | Allowed when | Effect |
|---|---|---|---|
| `pick` | `{ pickableId }` | Draft phase, your turn, pickable in the pool and unowned, your composition has room for its kind | Add the roster entry, log it, advance the turn |
| `swap` | `{ pickableOutId, pickableInId }` | Swap phase, your turn, you own `out`, `in` is available, same kind | Replace the entry, log it, advance the turn |
| `lock` | `{}` | Swap phase, your roster is full (5 + 1), you're not locked. Allowed out of turn (§1.2). | Set `locked_at`, log it. If it was your turn, advance the turn. If everyone is now locked, set `complete`. |

- The commissioner may add `onBehalfOf: userId` to any action.
- **Rejections** return 400 with a short message of 3 words or fewer ("Not your turn"), which the client shows as-is. No error-code catalog.

**Timer.** There's a server `setTimeout` per stage in `drafting`. When it fires:
- **in the draft phase**, it picks a **uniformly random legal pickable** for the manager on the clock: any available pickable whose kind still has room in their roster. Inject the RNG so tests can seed it.
- **in the swap phase**, it **locks** that manager.
- either way, the action is logged with `auto = true`.

Timers aren't rebuilt after a server restart. If one happens mid-draft, the commissioner presses pause, then resume.

**SSE.** `GET /api/stages/:id/draft/stream` sends only `event: changed`. The client refetches the draft state; there's no client-side merging. Send a heartbeat comment every 25s.

**Draft state** (`GET /api/stages/:id/draft`):
- status, phase and round
- seats, with user, avatar, color and `locked`
- each manager's roster
- the pool, with owner flags, photos, team logos and form stats
- the current seat, the deadline, and the server's current time
- the last 10 actions

**Commissioner controls:**
- randomize seats (`setup` only)
- start (only once joining is closed, or it closes it; needs at least 2 joined managers)
- pause / resume (pause clears the deadline; resume sets a fresh one)
- **undo**: pops the last `draft_actions` row, reverses its effect (removes the pick, reverses the swap, or unlocks), restores `current_turn_no = turn_no_before`, sets a fresh deadline, and moves `complete` back to `drafting` if needed
- act on behalf of a manager

### 4.3 Access and auth

**Who can log in.** Only users the commissioner has added.
- **The commissioner** is the Discord user named by `COMMISSIONER_DISCORD_USERNAME`. On boot, upsert that user with `role = commissioner`.
- **Adding a friend:** on the **Members** page (`/members`, reached by typing the URL; nothing links to it), the commissioner types the friend's **Discord username** (the unique `@handle`, not the display name) and adds them. This creates a `users` row with `role = member` and `discord_id = null`. The friend appears as a dimmed placeholder avatar until they first log in.
- **Removing a member** blocks their login on their next request. Their roster data stays.

**Why no auth framework.** Better Auth, Auth.js and similar bring their own user, session and account tables, plus flows built for sign-up, email and many providers. This app has one provider, a hard allowlist, a username-binding rule and a dev login. Those are easier to write directly than to bend a framework around. `arctic` handles the only fiddly part (the OAuth exchange), and the rest is about 100 lines.

**Discord OAuth** (authorization code flow, `identify` scope, via `arctic`):
1. `GET /api/auth/discord` redirects to Discord. A `state` param in a short-lived cookie prevents CSRF.
2. `/api/auth/discord/callback` gets the Discord user's `id`, `username`, `global_name` and `avatar`, then:
   - finds the user by `discord_id`, or
   - finds them by `discord_username` (case-insensitive) where `discord_id` is still null, and binds the id. This is the first login.
3. It refreshes `display_name` and `avatar_url` and sets the session cookie.
4. If neither match finds a user, it redirects to the login page with a "No access" state: a lock icon and those two words.

**Dev login** (`DEV_LOGIN=true`, never in production):
- `npm run seed:dev` creates a commissioner and 7 members (8 managers, the maximum).
- `POST /api/auth/dev { userId }` logs in as one of them.
- The login page then shows their avatars to click instead of the Discord button.
- All Checkpoint 1 development and demos use this.

**Other routes:** `GET /api/me`, and `/logout` (a page that logs you out; no UI links to it).

**Authorization:**
- Every allowed user sees every tournament (so they can join). Only joined managers act in its drafts.
- Only the commissioner reaches Members, the tournament **Settings** tab and every admin route.

### 4.4 VLR import

Pasting an event link runs the whole import, with a progress indicator. There's no manual setup in the normal flow.

1. **Event.** Fetch the event page, plus its matches page if the stage list lives there. Parse:
   - the event id and name, its **logo** and whether it's completed
   - the participating teams (VLR id, name, logo)
   - **the stages**, in VLR's order: name, VLR key (whatever id or slug VLR filters stages by) and, where the matches already show them, each stage's teams. Find exactly where these live from the saved fixture; don't guess the markup.
2. **Matches.** From the event's matches page, parse **every match, including upcoming ones**: VLR id, stage key, both teams (or TBD), best-of, scheduled time, status and score. Store them in `matches`.
3. **Teams.** For each team, fetch its team page and parse:
   - the **current active players** (VLR id, handle, VLR page URL)
   - the **head coach** (VLR id, handle, VLR page URL) from the staff list

   Exclude every other staff role and inactive players. If there's no head coach, create one placeholder coach: `handle = "<Team name> Coach"`, `is_placeholder = true`, no VLR link, and VLR's default picture.
4. **Player pages.** Fetch every player's and real coach's VLR page once. With 16 teams that's up to about 96 pages, roughly 5 minutes at the §2.5 pace; show progress. Parse:
   - **the photo.** If they have none, VLR shows its **default player picture**. Use that picture; it's a real image, not a missing one. Download the default once and share it between everyone without a photo.
   - **the top 3 agents** from the agents table over the §1.2 window, in usage order: agent name and icon URL
   - **form stats** from the same table: rating, ACS and K/D, weighted by rounds played (use the page's overall row if it has one), plus total rounds

   Coaches get a photo only. A player with no rows in the window keeps null stats (sorting last) and has no agents.
5. **Images.** Download every event logo, team logo, photo, the default picture and each agent icon **once** into `images`, deduplicated by source URL.
6. **Save.**
   - Upsert `teams` and `pickables`, and link them in `tournament_teams`.
   - Create one `stages` row per VLR stage: `source = vlr`, `vlr_stage_keys_json = [key]`, `position` in VLR's order, status `setup`.
   - If VLR shows no stage list, create a single stage named after the event.
7. **Seed each stage's pool** with the players and coaches of the teams known to play in that stage. A stage whose teams aren't decided yet (TBD) gets every tournament team.
8. **Seed `stage_managers`** from the joined managers when a stage's draft starts. Starting closes joining.

**Re-import** (an icon button in Settings):
- Adds new VLR stages, refreshes the match schedule and results, and refreshes teams, rosters, coaches, photos, agents and form stats.
- Adds newly known teams' pickables to stages still in `setup`.
- **Never** changes a stage whose draft has started.

**Commissioner adjustments** (Settings, only while a stage is in `setup`):
- rename a stage
- delete a stage
- remove or restore a pickable in the pool
- remove a joined manager, or open/close joining (only before any draft has started)

**Anything else** (merging stages, fixing a team, player or coach, odd data) is done in Drizzle Studio (`npm run db:studio`). There's no edit UI for it.

---

## 5. Design system and UI

Read `docs/design-system/README.md` (rules) and `docs/design-system/tokens.json` (values) before any UI work. The browsable version is <https://claude.ai/artifact/4uaHpE7ztZsxatJDbeG9zy>; it's private, so build from the `docs/` copy.

### 5.1 Look (inspired by a modern creator dashboard)

- **Background:** near-black `bg` with **two faint radial glows**: warm `bg-glow-tl` from the top-left and orange `bg-glow-br` from the bottom-right, both fixed to the viewport. Nothing else decorates the page.
- **Liquid-glass panes:**
  - translucent `pane` fill with a backdrop blur
  - a 1px **gradient rim light**, bright at the top-left and fading to transparent at the bottom-right
  - a 1px top highlight, a soft shadow and rounded corners
  - a faint grain overlay on every pane
  - data-heavy surfaces (the draft pool, Members) use the denser `pane-dense`

  Build it once in `<Pane>`; the README has the exact recipe.
- **Liquid lenses (the signature detail):** small selection indicators use real refraction: an SVG displacement map with a squircle bezel, a specular rim and a faint color fringe, sliding on a spring. They're used on:
  - the selected tab and stage pill
  - the players/coaches toggle
  - the on-the-clock badge

  Lenses only work in Chromium, so feature-detect them and fall back to a plain pill with the same rim and spring.
- **Strong orange theming:** `accent` orange on primary buttons (dark `on-accent` text, never white), Live and Drafting badges, progress bars, the focus ring and the on-the-clock glow. Everything else is neutral.
- **Fonts:** Geist for text, and Geist Mono for numbers (tabular).
- **Icons:** [Lucide](https://lucide.dev) (`lucide-react`) only, at its default 2px stroke. Lucide has no brand logos, so the Discord login button uses Lucide's `log-in` icon.
- **Manager colors:** 16 muted tones, shown only as an avatar ring plus a thin rim and faint tint on that manager's cells and cards.
- **Dense, but not cramped.** Prioritize information density: on a desktop screen, these should each fit in about one screen:
  - the 8-manager draft board plus the pool
  - all 16 teams
  - all 8 roster cards

  Use more columns rather than bigger cards. Then spend the leftover room on breathing space:
  - Panes have 16px padding.
  - Grid gaps are 16–18px.
  - List rows are 40–42px tall.
  - Body text is 14px.

  The mockups show the intended balance.
- **Layout is top-aligned.** Pages start at the top and flow down. Never vertically center page content (only dialogs are centered).

### 5.2 Minimal text (strict)

- **Don't add prose or text that a visual can carry.** Use photos, logos, avatars, manager colors, icons and numbers instead.
- **Never add:**
  - instructional sentences
  - helper paragraphs
  - descriptions under headings
  - empty-state sentences (show the empty shape instead)
  - confirmation essays
- **Icon buttons** get a tooltip and an `aria-label`, with no visible label.
- **Lucide icons used:**

  | Meaning | Lucide icon |
  |---|---|
  | tournaments | `trophy` |
  | members | `users` |
  | add | `plus` |
  | lock | `lock` |
  | swap | `arrow-left-right` |
  | coach | `graduation-cap`, in a small badge right after the name |
  | player | `user` |
  | teams | `shield` |
  | draft tab | `layout-grid` |
| join | `user-plus` |
| close or open joining | `lock` / `lock-open` |
  | settings tab | `settings-2` |
  | matches | `calendar` |
  | pick timer | `timer` |
  | pause | `pause` |
  | undo | `undo-2` |
  | shuffle seats | `shuffle` |
  | act as manager | `user-check` |
  | re-import | `refresh-cw` |
  | rename | `pencil` |
  | delete | `trash-2` |
  | VLR link | `external-link` |
  | search | `search` |
  | timed out | `clock` |
  | commissioner | `crown` |
  | done | `check` |
  | close | `x` |
- **Visible text is limited to:**
  - names
  - numbers
  - column headers and badges in the `label` style
  - page titles
  - one-word primary actions where an icon alone is unclear ("Pick", "Swap", "Lock", "Start", "Add")
- **Errors** are ≤3 words plus a visual cue (shake, `loss` rim). For example: "Not your turn", "Already taken", "Coach slot full".
- **Teams** show as logo + name. **No team tags anywhere.**
- **Placeholder coaches** read "Sentinels Coach", with a capital C.

### 5.3 App shell and pages

There is **no sidebar and no top bar**. The app has two places: **Home** (browse tournaments) and the **Tournament page** with tabs. Every page has just the **site logo** at its top-left, linking home. There are no user settings. The commissioner reaches **Members** (`/members`) by typing the URL; nothing links to it. Logging out is `/logout`, also by URL.

```
  ◆ Fantasy VCT                                           ← logo only, links home
  Tournaments                                              [+ New tournament]
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │  [logo]  │ │  [logo]  │ │  [logo]  │ │          │  ← one grid, 4 per row,
  │     Live │ │ Drafting │ │    Ended │ │          │    live/drafting first,
  │ Name     │ │ Name     │ │ Name     │ │          │    no Active/Ended sections
  │ [Stage 1][Playoffs]                              │
  │ ⛨16  ◉◉◉◉◉ 5/8  📅0/26                           │  ← teams, managers joined/8, matches
  │ ▬▬▬▬▬▭▭▭▭                                        │  ← matches played ÷ total
  │ [ Join ]                                         │  ← only while joining is open
  └──────────┘ └──────────┘ └──────────┘
```

- **Home:**
  - a `display` title, plus **New tournament** (commissioner only), which opens a dialog with one URL field
  - one grid of TournamentCards, sorted live/drafting first and then by date
  - each card shows:
    - a header image: the event logo on a blurred backdrop
    - a status badge
    - the name and stage chips
    - stat chips: team count, the joined managers' avatar stack with `joined/8`, matches played/total
    - a progress bar of matches played ÷ total
    - a **Join** button (accent, `user-plus`) while joining is open and you haven't joined; joining also has you pick your color
- **Tournament page:**
  - **Header:** event logo, name, status badge, a **matches pill** (calendar icon, `18/32`, mini bar) and the manager avatar stack. Clicking your own avatar opens the ColorPicker.
  - **Tabs:** **Rosters**, **Draft**, **Teams**, plus **Settings** for the commissioner.
- **Members** (commissioner):
  - one **Add** field for a Discord username
  - dense rows: avatar (dimmed until first login), display name, `@username`, and a remove icon
- **Teams tab:**
  - a search field (player or team) and the team count
  - a **4-column grid** that fits 16 teams in 4 rows
  - each team card has its logo and name, then a **2-column × 3-row grid**: the 5 player chips plus the coach chip
  - no agents here; agents appear only in the draft pool
- **Settings tab:**
  - the managers who have joined (up to 8 avatars), a remove action on each, and a **joining open/closed** toggle (`lock-open` / `lock`)
  - the pick timer and re-import
  - stages, each showing its match count and pool size, with rename and delete
  - a pool editor: compact chips grouped by team in a 4-column grid, click to remove or restore

### 5.4 How players are shown

- **PlayerPhoto:**
  - the VLR photo, or VLR's default picture, in a circle
  - the **team logo always overlaid at the bottom-right** on a small dark disc
  - sizes: 26px in draft-board cells, 28px in the pool, 30px on Teams and Rosters
- **PlayerChip:**
  - PlayerPhoto plus the handle (`body-strong`, 13–14px)
  - links to the player's **VLR page** in a new tab; in the draft pool the link is an `external-link` icon shown on row hover
- **Top 3 agents:** shown only in the draft pool, as tiny agent icons with the agent name as the tooltip.
- **Coach chip:** PlayerPhoto, the handle, and **right after the handle** (not pushed to the far edge) a small badge holding the Lucide `graduation-cap` icon. A placeholder shows VLR's default picture with the team logo, reads "Sentinels Coach", and has no link.
- **Form stats** (pool only): `RTG`, `ACS` and `K/D` in mono, right-aligned.

### 5.5 Draft room (the Draft tab)

```
┌ [Stage 1][Playoffs]       (◉ glow) 0:42   ●●○○○○ ⇄        [Lock] │ ⏸ ↶ 👤✓ ┐ ← on-the-clock bar
├──────────────── board (≈58%) ───────────────────┬────── pool (≈42%) ────────┤
│       1        2        3        4       5    📋 │ [🔍 search     /] [👤|📋] │
│ (J) [◐Less ] [◐Ethan] [◐trent] [     ] [    ] [ ]│ [S][G][N][1]… 16 toggles  │
│ (A) [◐leaf ] [◐kiNgg] [◐Mazin] [     ] [    ] [ ]│ PLAYER        RTG  ACS K/D│
│ (W) [◐Asuna] [◐mada ] [◐jawge] [     ] [    ] [ ]│ (◐)valyn ▪▪▪ 1.21  228 1.31│
│ (S)◉[◐zekke] [◐johnq] [▒next▒] [     ] [    ] [ ]│      [Pick]               │
│ (Ja)…  one row per manager, in seat order (≤ 8)  │ … ~11 rows, 42px each     │
├──────────────────────────────────────────────────┴───────────────────────────┤
│ (K)● mitch  (Jo)● nitr0  (T)● supamen ⏱  …               ← recent actions    │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **On-the-clock bar:**
  - a stage switcher (lens pill)
  - the current manager's avatar with `shadow-glow`, and a countdown computed against server time
  - phase dots: 6 rounds, then ⇄ for the swap phase
  - **Lock** (accent button) in the swap phase, once your roster is full
  - the commissioner's icon controls at the right end: pause/resume, undo, act-as (avatar menu); shuffle and **Start** before the draft begins
- **Board** (about 58% width):
  - **one row per manager**, in seat order, so 8 managers fit
  - each row: the avatar with its color ring, **5 player cells**, then the **coach cell** after a small gap; column headers are `1`–`5` and the coach icon
  - a cell is 40px tall: a 26px PlayerPhoto plus the handle, tinted and rimmed in the manager's color
  - empty cells are `line` outlines; the next cell for the manager on the clock gets `accent-soft` and the glow
  - the on-the-clock row is tinted and its avatar glows
  - a swap flips the cell in place
  - a locked row dims and gets a small lock badge on the avatar
- **Pool** (about 42% width, `pane-dense`), available pickables only (taken ones are hidden):
  - **Search** by handle or team; `/` focuses it.
  - **Kind toggle:** players or coaches (lens pill).
  - **Team filter:** one row of 16 compact team-logo toggles. Several can be selected, and none selected means all teams.
  - **Sort:** click a column header (`PLAYER` A–Z, `RTG`, `ACS`, `K/D`). The default is RTG, descending; nulls sort last.
  - **Rows** are 42px: PlayerPhoto, handle, 3 agent icons, a VLR link on hover, then the stats in mono.
  - Keyboard: ↑/↓ moves through rows, and Enter acts on the selected one.
- **Acting on your turn:**
  - **Draft phase:** select a row, then press **Pick** (inline in that row).
  - **Swap phase:**
    1. Click one of your cells. It gets an accent outline, and the pool switches to that kind.
    2. Select a row and press **Swap**.

    Or press **Lock** at any time.
  - When it isn't your turn, there are no action buttons and the rows are read-only.
- **Recent actions strip:** avatar plus a Lucide icon (a dot for a pick, `arrow-left-right`, `lock`, plus `clock` for timeouts) plus the handle. No sentences.

### 5.6 Rosters tab

- Stage chips to switch stages.
- A **4 × 2 grid** of manager cards, so 8 fit on one screen. Each card has:
  - the manager's tint
  - an avatar header with a lock icon once locked
  - a **2-column × 3-row grid** of the 5 player chips and the coach chip (same compact chip as Teams)
- Space reserved for points in checkpoint 2.

### 5.7 Implementation

- Generate `src/client/theme.ts` from the tokens, using the README's "In the app (MUI)" mapping.
- Expose every token as a CSS custom property on `:root`, through `CssBaseline` global styles.
- Build the shared components in §3.3 once and reuse them. Don't restyle panes ad hoc.
- Respect `prefers-reduced-motion`.
- **Mockups:** `docs/mockups/*.dc.html` (also browsable at <https://claude.ai/artifact/N6dULcNbss7tDJ1K9KiEWq>, private) show every Checkpoint 1 screen with sample data. They're the visual target; open the source for exact sizes and spacing. Where they and this plan disagree, this plan wins.

---

## 6. Checkpoints and work packages

Packages run in order unless marked **‖ parallel-safe**. Each one goes through the full §2.2 loop: review, `/code-review medium`, checks, `/simplify`, then merge.

### Checkpoint 1: Members, tournaments, teams and the draft

**Goal:**
- The commissioner controls who can log in and adds tournaments from VLR links.
- Tournaments show as cards.
- Teams show with photos.
- Managers pick colors, run a full live draft including the swap phase, and see the locked rosters.

**Demo script (checkpoint gate):**
1. `npm run seed:dev`, then start with `DEV_LOGIN=true`. Log in as the commissioner.
2. **Members:** add a Discord username, see the dimmed placeholder avatar, then remove it.
3. **New tournament:** paste a real VLR event URL with at least two stages. A card appears on Tournaments with the event logo, status badge and a matches-played progress bar (0/N, counting upcoming matches).
4. **Teams:** all teams (up to 16) on one screen: team logos, and player photos with team-logo overlays (VLR's default picture where there's no photo) and working VLR links, 2 columns of 3 per team. Coaches have their badge right after the name. Search filters by player or team. At least one "`<Team>` Coach" placeholder, if the event has a coachless team; otherwise prove it with fixture tests. The stages appear automatically, in VLR's order.
5. **Join:** each of the 7 dev members joins from the home card and picks a color (a taken color can't be picked; a 9th join is refused). The commissioner joins too, then closes joining in Settings. Remove a couple of pickables from stage 1's pool, shuffle the seats and start.
6. **Draft phase** with 8 managers (2–3 browser sessions plus `curl` for the rest), 48 picks. The whole board and pool fit on one desktop screen:
   - the pool is searched, filtered by team, toggled to coaches and sorted by RTG and by name
   - at least one random autopick on timeout
   - one pick on behalf of a manager
   - one undo
   - rejected picks for wrong turn, already taken, and a second coach
7. **Swap phase:**
   - one swap
   - one rejected swap of the wrong kind
   - one lock on turn, one lock out of turn, one lock by timeout
   - check that locked managers are skipped, and that a released pick can be drafted by someone else
   - the stage turns `complete` when the last manager locks
8. **Rosters:** each manager's 5 + 1 roster for stage 1, in their color. Stage 2 has its own empty draft and pool.
9. **Log in as a member:** they see every tournament with Join where it's open, have no Settings tab, and get 403 at `/members`.

**Packages**

**1.0 Scaffold.** Do §3.1 and add the deps from §3.2.

*Accept:*
- `npm run dev` serves the template.
- The initial commit is on `main`.

**1.1 Database, shared entities and theme.** Covers:
- the Drizzle schema for the Checkpoint 1 tables in §4.1
- a migration runner on server start, a `db` client, and the `db:studio` script
- entities, `MANAGER_COLORS` and the API contract skeleton in `src/shared`
- `snake.ts` with unit tests: N = 1 to 8, the round boundaries, and the draft-to-swap phase boundary
- `theme.ts` and the token CSS variables from the design system
- `<Pane>`, with its gradient rim, top highlight and grain overlay, plus the two-glow background

*Accept:*
- A fresh DB migrates.
- The snake tests pass.
- The template page renders with the new theme.

**1.2 Access, auth and app shell** ‖ parallel-safe with 1.3. Covers §4.3:
- session, access check, dev login, `seed:dev`
- Discord OAuth (written but env-gated) with username binding
- `requireUser` / `requireCommissioner`
- members API

*Client:*
- **AppShell:** two background glows, the site logo (links home), a top-aligned content column. No sidebar, no top bar, no links to Members.
- **Login:** a Discord button, or dev avatars; the "No access" state
- the **Members** page

*Accept:*
- Dev login works.
- OAuth username binding and the rejection path are tested with mocked Discord responses.
- A removed member's next request returns 401.
- The commissioner-only routes return 403 for members.

**1.3 VLR import** ‖ parallel-safe with 1.2. Covers §4.4 steps 1 to 5:
- `vlr/fetch.ts`: throttle, User-Agent, cache
- `images.ts`: download and store images
- parsers for the event (logo, completed flag, teams, stages), the match schedule (all matches including upcoming, with stage, teams or TBD, best-of, time, status, score), the team (active players, head coach, VLR URLs) and the player page (photo or default picture, top 3 agents, form stats), all written against **saved fixtures**. Commit these under `__fixtures__/`:
  - a multi-stage event page (plus its matches page if needed)
  - 2 team pages
  - 2 player pages: one with a photo, one showing VLR's default picture
  - 1 coach page
- parser tests against the fixtures

*Accept:*
- The parsers extract every field above from the fixtures. Staff and inactive players are excluded.
- Upcoming and TBD matches are included in the schedule.
- The default picture is stored once and shared.
- Top agents come out in usage order.
- Form stats are weighted by rounds played.
- A team without a head coach gets one "`<Team>` Coach" placeholder (a unit test on parsed data is enough).
- Re-importing is idempotent.

**1.4 Tournaments, teams and settings.**

*API:*
- create a tournament (commissioner only; runs the import and reports progress)
- list tournaments and get one, with derived status, matches progress and joined managers
- join (with a color; refused if the color is taken, the tournament is full or joining is closed), change my color; commissioner: remove a manager, open/close joining
- re-import
- list teams with their pickables
- `/api/images/:id`

*Client:*
- the **Tournaments** page and TournamentCard
- the **Join** button and color pick on cards
- the New tournament dialog
- the tournament header and tabs
- the **Teams** tab
- the **Settings** tab, minus stages: members, re-import and timer
- **ColorPicker**, opened from your own avatar in the tournament header

*Accept:* demo steps 3 to 5 (up to the color picks), with screenshots compared against the design README.

**1.5 Stage admin and pools.** Stages already exist from the import.

*API:*
- update a stage (name, pick_seconds)
- delete a stage (`setup` only)
- list the pool
- remove or restore a pickable

*Client:* the stages section of Settings, with a pool editor of PlayerChips grouped by team logo and a remove/restore toggle on each.

*Accept:*
- Removed pickables don't appear in the draft.
- Delete is refused after the draft starts.

**1.6 Draft engine, server.** Covers all of §4.2:
- actions with every validation
- turn advance with locked seats skipped
- the timer: random autopick in the draft phase, auto-lock in the swap phase
- SSE
- the draft-state endpoint
- commissioner controls, including undo of the last action

*Tests:*
- each rejection rule (wrong turn, taken, roster full for that kind, wrong phase)
- seeded random autopick only ever picks legal choices
- coach and player limits
- swap kind rules
- out-of-turn lock
- skipping locked seats
- `complete` once everyone is locked
- undo of a pick and of a swap

*Accept:*
- All tests pass.
- A scripted 8-manager draft goes through both phases to `complete` over HTTP.

**1.7 Draft room, client.** Covers all of §5.5: the on-the-clock bar, board, pool (search, kind toggle, team filter, sortable columns, keyboard), the pick, swap and lock flows, the recent-actions strip and the commissioner controls. On SSE `changed`, refetch.

*Accept:*
- demo steps 6 and 7 across multiple browser sessions
- no visible sentence anywhere in the room
- screenshots compared against the design README

**1.8 Rosters and polish.** Covers §5.6, plus:
- **`<LiquidLens>` and `<SegmentedControl>`** (see "Liquid lenses" in the design README):
  - a displacement-map generator, the SVG filter and spring motion
  - a Chromium check, with the plain fallback pill everywhere else
  - wired into the tournament tabs, stage chips, the players/coaches toggle and the on-the-clock badge
  - **Timebox it.** If the refraction fights you, ship the fallback pill and note it in the report.
- a final sweep for leftover explanatory text, inconsistent panes and off-theme colors

*Accept also:*
- In Chrome, the lens visibly bends what's behind it, and slides on a spring between items.
- Elsewhere, the fallback pill looks clean.

*Accept:* demo steps 8 and 9, then the full demo script.

### Checkpoint 2: Stats, scoring and standings (tentative; re-planned after Checkpoint 1, don't start)

This is here only so Checkpoint 1's schema doesn't block it.
- A match parser (overview and performance tabs) built on saved fixtures.
- Scoring in `src/shared/scoring.ts`.
  - Acceptance: re-score VCT Challengers NA 2024 Split 1 and match the spreadsheet (**mada = 755**, **Reduxx = 601**).
  - The spreadsheet is at `/mnt/c/Users/sxc/Downloads/VCT Challengers NA 2024 Split 1 Fantasy.xlsx`. It's a downloaded file: copy it to a scratch directory and read it with `python -I` and openpyxl.
- **Coach scoring** from team results: the formula needs deciding with the user.
- Sanity checks on scraped stats, with manual stat entry as the fallback when a scrape fails.
- Standings on tournament cards and pages, plus players and matches views, kept visual and minimal-text.

### Checkpoint 3: Running over time (tentative; re-planned after Checkpoint 1, don't start)

- A scheduler: event sync, scraping completed matches, a nightly refetch and a standings snapshot.
- Discord webhooks: match recaps, daily standings and scrape-failure alerts. Ask the user for the webhook URL.
- Deploy to Fly.io with a volume and nightly backups. **Ask before deploying.**

### Out of scope

- mobile layouts
- light mode
- player roles
- team tags
- trades between managers
- Discord draft pings and bot commands
- live in-match scoring
- public leagues
- multiple commissioners

---

## 7. Definition of done (this handoff)

- The Checkpoint 1 demo script passes end to end.
- Every package in §8 went through the full §2.2 loop and is merged into `main`.
- The user has the checkpoint report, including screenshots and its "Notes for re-planning".

---

## 8. Progress log

Update this as packages land, in the form `- [x] 1.0 Scaffold (commit abc123)`.

- [x] 1.0 Scaffold (commit 83748bf)
- [x] 1.1 Database, shared entities and theme (commit e4f04a2)
- [x] 1.2 Access, auth and app shell (commit 777f8f0)
- [x] 1.3 VLR import (commit bad2d5f)
- [x] 1.4 Tournaments, teams and settings (commit 0f416f6)
- [x] 1.5 Stage admin and pools (commit e552215)
- [x] 1.6 Draft engine, server (commit aeb69fc)
- [ ] 1.7 Draft room, client
- [ ] 1.8 Rosters and polish
- [ ] Checkpoint 1 gate, report and re-planning notes → **stop here**
