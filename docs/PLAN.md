# Fantasy VCT: Orchestrator Handoff

You are the **orchestrator** for this project. You plan the work, hand work packages to subagents, review and simplify what they return, and commit it. Keep going, package after package, until **Checkpoint 2** is finished or you hit one of the stop conditions in §2.4.

**Checkpoint 1 is done** (§8). The user keeps polishing it on `main` while you work, so branch every package from the latest `main`, and merge `main` into your branch before reviewing.

**Stop after Checkpoint 2.** Checkpoint 3 is included only as context for design decisions; don't start it.

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
| Coaches | Each team's head coach is in the draft pool. If VLR lists no coach for a team, create a placeholder named "`<Team name>` Coach" (capital C, for example "Sentinels Coach"). Coaches score from their team's results (scoring table below). |
| Subs | Subs aren't in the pool. When a sub plays a map in place of one of the team's pool players, the sub's stats for that map count for the player they replaced (§4.5). The app pairs them when it's unambiguous; otherwise the commissioner assigns the sub on the match. |
| Swiss stages | A team that qualifies early plays fewer series (a 3-0 team plays 3; a 3-2 team plays 5). **Phantom series** even this out: once a team qualifies, each series it didn't need to play counts, for each of its picks (coach included), as that pick's own average series points in the stage. Eliminated teams get nothing for series they didn't play. Brackets and other formats are plain sums. |
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
| Coach | **+2 per round** their team wins in the series, plus **+30 per map left unplayed** when their team wins the series. The loser gets no unplayed-map points. Examples: a Bo3 2-0 win scoring 13-8 and 13-9 earns 52 + 30 = 82; a Bo5 3-1 win earns +30 for the unplayed map. |

A pickable's stage points are its points in every match of that stage, regardless of when the draft finished, plus any Swiss phantom series. A finished map counts as soon as it's scraped, even while the series is still live; the sweep bonus and coach points wait for the series to end. A manager's stage total is the sum of their 6 picks. The tournament total is the sum of the stage totals.

### 1.1a Settled with the user (don't propose these again)

- **No deployment in Checkpoint 1.** Everything runs locally. Deployment is decided at re-planning.
- **The swap phase is uncapped.** There's no limit on swap rounds or swaps per manager, and the group agrees not to swap endlessly. It ends when everyone has locked, either themselves or by timeout. Swap turns use the same `pick_seconds` timer.
- **VLR stays the data source** under the §2.5 etiquette (minimal, cached requests). Don't suggest other sources.
- **The user creates the Discord app** later. Until then, use the dev login (§4.3); don't ask for credentials during Checkpoint 1.
- **No backups for now.**
- **Stats fixes are DB edits.** A failed or wrong scrape is fixed in Drizzle Studio, or by asking Claude Code to fill it in from VLR. There's no stats-edit UI.
- **Scraping is automatic from Checkpoint 2:** every 15 minutes from a match's scheduled time until its stats are in. A live series' finished maps count; a map in progress never does. The commissioner's Sync button runs the same job immediately.

### 1.2 Open questions (use these defaults, and flag them in the checkpoint report)

- **Locking out of turn:** allowed. A manager with a full roster can lock at any time during the swap phase, not only on their turn.
- **Re-drafting a released pick:** allowed. A pick released in a swap is a normal available pick, even for the manager who released it.
- **Form window:** form stats and top 3 agents come from each player's VLR page over the **last 90 days**. If the page doesn't offer 90 days, use the closest window it has.
- **Stats data source:** VLR stays the source. It's the only free source with multi-kills and per-player clutches, but its terms of service forbid bots and systematic scraping, so keep requests minimal and cached (§2.5). Liquipedia's LPDB API is a possible later source for schedules and rosters (its rows carry VLR ids). Keep all VLR parsing behind `src/server/vlr/` so a source can be swapped later.
- **Daily standings post** (checkpoint 3): 00:00 America/Los_Angeles. **Standings tiebreak** (checkpoint 2): best single pick, then alphabetical.
- **Multi-kills** (checkpoint 2): only 3K and 4K rounds score; 2K rounds score nothing, and an ace counts only as an ace. Overtime rounds count like any other round. If the Split 1 re-score (package 2.2) doesn't match the spreadsheet, find the reading that reproduces it and report it; don't change the rules silently.
- **Sweep bonus and subs** (checkpoint 2): the +15 goes to each pool player on the winning team who played at least one map of the series, either themselves or through a sub assigned to them.
- **Past events** (checkpoint 2): players come from the event page's registered rosters, with the team page as a fallback. Head coaches come from the team's *current* page, so an old event can show today's coach. That's fine; the app is for live events. Stats are keyed by VLR player id, so scoring old matches still works.
- **Swiss phantom average** (checkpoint 2): a pick's average is its points ÷ the series its team has played in the stage, where a series the pick sat out counts as 0 and only `ok` matches count (a live or unfinished scrape doesn't). The phantom series start counting as soon as the team reaches the wins it needs to advance.

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

At the end of each checkpoint:
1. Run the full demo script end to end.
2. Report to the user:
   - what works
   - how to run it
   - the defaults you used from §1.2
   - anything blocked
   - screenshots of every screen the checkpoint added or changed
3. End the report with **"Notes for re-planning"**:
   - what was harder or easier than expected
   - what VLR's pages actually look like, as far as the next checkpoint depends on them
   - shortcuts later work should know about
   - suggested changes to Checkpoints 2 and 3
4. **Stop.** Don't start the next checkpoint.

### 2.4 Stop and ask the user

- **Never** create a GitHub repo, add a git remote or push.
- **Ask before** deploying, creating a Discord application or webhook, or anything else that leaves this machine. Fetching VLR pages and images under §2.5 is fine.
- **Don't ask for Discord secrets in Checkpoints 1 or 2** (§1.1a). Build the OAuth code env-gated and test it with mocked Discord responses.
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
| Scheduling (checkpoint 2) | An in-process `setInterval` ticker, once a minute. No cron library. |

### 3.3 Layout (target)

```
src/shared/
  entities.ts          User, Tournament, Stage, Team, Pickable, RosterEntry, DraftState, MANAGER_COLORS…
  api.ts               API_ROUTES + request/response types
  snake.ts             seatForTurn(turnNo, seatCount)
  scoring.ts           (cp2) points, coach points, sub pairing, Swiss phantom series: pure functions
src/server/
  db/                  schema.ts, client.ts, migrations/, seed-dev.ts
  auth/                discord.ts, dev-login.ts, session.ts, access.ts
  vlr/                 fetch.ts (throttle + cache), event.ts, matches.ts, team.ts, player.ts, images.ts
  vlr/__fixtures__/    saved VLR HTML
  vlr/match.ts         (cp2) match page parser
  sync.ts              (cp2) sync job + 1-minute ticker: schedule refresh, scrape started matches
  draft/               service.ts (actions, turn advance, timer, undo), sse.ts
  routes/              members.ts, tournaments.ts, stages.ts, teams.ts, draft.ts, images.ts, (cp2) matches.ts, standings.ts
src/client/
  theme.ts             MUI theme from docs/design-system/tokens.json
  layout/              AppShell (two background glows + site logo + content column)
  components/          SiteLogo, Pane, LiquidLens, SegmentedControl, StatusBadge, TournamentCard, PlayerPhoto, PlayerChip, AgentIcons, ManagerAvatar, ColorPicker, TeamLogo, StatChip
  glass/               displacement-map.ts (squircle bezel, Snell refraction, quadrant mirror), lens-filter.tsx (SVG filter defs)
  pages/               Tournaments, Tournament (Rosters, Matches (cp2), Draft, Teams, Settings), Members, Login
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
                   -- checkpoint 2 adds: format: standard | swiss (default standard), swiss_wins (nullable: wins to advance)
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
                   -- checkpoint 2 adds: scrape_status: pending | ok | failed (default pending),
                   --   scrape_error (nullable), scraped_at (nullable, last successful save),
                   --   checked_at (nullable, last attempt)
                   -- checkpoint 3 adds: recap_posted_at
-- checkpoint 2
match_maps         match_id, map_no, map_name, team1_rounds, team2_rounds              PK(match_id, map_no)
player_map_stats   match_id, map_no, vlr_player_id, handle, team_id → teams,
                   k, d, a, fk, fd, mk3, mk4, aces, clutches                           PK(match_id, map_no, vlr_player_id)
sub_assignments    match_id, map_no, sub_vlr_player_id,
                   replaces_pickable_id → pickables (nullable: replaced nobody)   -- only the commissioner's choices
                                                                                       PK(match_id, map_no, sub_vlr_player_id)
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
- **Points** (checkpoint 2) are always computed on read. Nothing stores a point total.
- **Stats are keyed by VLR player id**, not pickable id, because subs aren't pickables. Join to `pickables.vlr_id` when scoring.

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

### 4.5 Match stats and scoring (checkpoint 2)

**Sync job** (`src/server/sync.ts`). One job, run three ways: by the ticker, by the hourly schedule refresh, and by the commissioner's Sync button. Only one run at a time; a run requested while one is going is dropped.

**When it runs:**
- **Ticker:** once a minute, the server checks for **due** matches: `scheduled_at` has passed (or VLR already shows the match live or completed), `scrape_status` isn't `ok`, and `checked_at` is empty or at least 15 minutes old. So a match at 18:00 is checked at about 18:00, 18:15, 18:30… until it's `ok`. `isDue(match, now)` is a pure function with tests.
- **Schedule refresh:** each tournament that hasn't ended refetches its event matches page hourly, and also at the start of any run that has a due match in it. This keeps times, statuses, scores and TBD teams current, so a postponed match simply becomes due later.
- **Sync button** (`POST /api/tournaments/:id/sync`, commissioner only): refresh the schedule, then treat every started, not-`ok` match as due now. It returns `202` immediately and the job runs in the background; `GET /api/tournaments/:id/matches` carries `syncRunning` so the button can spin.
- The ticker starts with the server, never in tests. `SCHEDULER=off` disables it.

**Scraping one match:**
1. Fetch its match page(s) **fresh**, bypassing the cache (store the result in `raw_pages` anyway). Use the saved fixtures to find which tabs hold the per-map scoreboard, the multi-kills and the clutches; don't guess. Parse:
   - the real best-of and both teams' VLR ids. The match list has neither (§8 notes), so correct `best_of`, `team1_id` and `team2_id` here.
   - each map's name and both teams' rounds
   - each player's per-map K, D, A, FK, FD, 3K, 4K, 5K (aces) and clutches won (1v1 to 1v5 summed), with their VLR id, handle and team
2. **Keep only finished maps.** A map is finished when the winner has at least 13 rounds and leads by at least 2 (13-11 and 14-12 are finished; 12-12 and 13-12 are not). A map in progress is dropped entirely, even if VLR shows partial stats for it. Never use VLR's "all maps" totals, which include the live map.
3. **Sanity check**, and nothing more:
   - every finished map has 5 players per team
   - no negative numbers
   - once the match is completed: the maps won equal the series score
4. **Save in one transaction:** replace the match's `match_maps` and `player_map_stats` rows with the finished maps, set `scraped_at`, and set `scrape_status = ok` only if the match is completed and passed every check. Otherwise it stays `pending` and gets checked again in 15 minutes.
5. **On a fetch, parse or check error:** keep the rows already saved, set `scrape_status = failed` and `scrape_error`. A failed match stays due, so it retries every 15 minutes and clears itself if VLR fixes the page.
6. Always set `checked_at`.

More rules:
- The job **never touches a match that's `ok`**. To re-scrape one, set it back to `pending` in Drizzle Studio. To fix one by hand, write its rows in Drizzle Studio and set it to `ok`.
- The job's fetcher is a parameter, so tests and the demo can feed it fixtures.
- Expected load: one matches page per tournament per hour, plus about 2 pages per started match every 15 minutes until it's done. All of it goes through the §2.5 throttle.
- A match's saved finished maps count toward points whatever its status. Unscraped maps score 0. The Matches tab flags `failed` matches for the commissioner.

**Sub pairing** is computed on read, together with points. Only the commissioner's choices are stored.
- Work per map and per team:
  - **missing:** that team's player pickables that are **rostered in the match's stage** (by any manager) and have no stats row on that map. Event-registered players nobody rostered don't count, so a registered sub sitting on the bench never causes ambiguity.
  - **subs:** the players in that team's map rows who aren't among that team's player pickables in the stage's pool. An unrostered pool player who plays scores for nobody and is never a sub, so a partly rostered team still auto-pairs its one real sub.
- Pair them like this:
  - **0 missing:** the subs replace nobody.
  - **missing but no subs:** the missing players score 0 for that map.
  - **exactly 1 missing and 1 sub:** the sub is credited to the missing player automatically.
  - **anything else:** use the stored `sub_assignments` rows. The match needs attention (`triangle-alert`, commissioner only) until every sub on that map has a row. For each sub, the commissioner picks one of that map's missing players, or nobody (`PUT /api/matches/:id/subs`).
- Pairing happens on read, so it follows the rosters. Drafting after a match was scraped still pairs correctly.

**Scoring** (`src/shared/scoring.ts`, pure functions). The config is the defaults from §1.1 with `tournaments.scoring_json` merged over them.
- **Player points for one map row:**
  ```
  5k − 5d + 2a + 5fk − 5fd + 5·mk3 + 5·mk4 + 25·aces + 10·clutches
  ```
- **A player pickable's points in a match:**
  - its own map rows, plus the rows of every sub assigned to it
  - plus **+15** if its team swept (2-0 in a Bo3, 3-0 in a Bo5) and it played at least one map, either itself or through an assigned sub. Only once the match is `completed`.
- **A coach's points in a match:**
  ```
  2 × (rounds their team won, across every map) + 30 × (best_of − maps played), the second part only if their team won the series
  ```
  Only once the match is `completed`; before that the coach has 0 for it. It reads the coach's team from `pickables.team_id`.
- A **stage** includes the matches whose `stage_key` is in that stage's `vlr_stage_keys_json`.
- **Swiss phantom series:**
  - **Detecting Swiss:** import and sync set `format = swiss` on stages whose VLR name contains "Swiss" (case-insensitive). They also set `swiss_wins = log2(distinct teams in the stage's matches) − 1`, so 16 teams need 3 wins and 8 teams need 2. Both can be corrected in Drizzle Studio.
  - **The count:** once a team has `swiss_wins` wins in the stage, it gets `2 × swiss_wins − 1 − series played` phantom series. A 3-0 team gets 2, a 3-1 team gets 1, and a 3-2 team gets 0. Eliminated teams get none.
  - **The value:** each phantom series is worth the pick's own average series points in that stage (§1.2), for players and coaches alike.
  - **On screen:** phantom points are included in pick and manager totals in standings, Teams and the pool. They don't appear in the Matches tab, which only shows real matches. There's no separate UI.
- **Standings:** a manager's points in a stage are the sum of their `roster_entries` picks' points over that stage's matches. The total is the sum over stages. Rank by points, then by best single pick in that scope, then by display name.

**API:**
- `GET /api/tournaments/:id/standings`: per manager, the total, the per-stage totals, and per stage each roster entry with its points (sub credit and phantom series included)
- `GET /api/tournaments/:id/matches`: the schedule with scores, `scrape_status` and a `needsAttention` flag (failed or unassigned subs), plus which managers have picks in each match
- `GET /api/matches/:id`: the maps, and per team its players and coach with series stat totals, points, owner (in that match's stage), and subs with their assignment
- the teams and draft-pool payloads gain each pickable's tournament points

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
  | matches, matches tab | `calendar` |
  | sync results | `cloud-download` |
  | needs attention (failed scrape, unassigned sub) | `triangle-alert` |
  | sub standing in | `corner-down-right` |
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
    - once any points exist, a **top-3 block**: rank, avatar, name and total (mono) for the three leading managers. The managers stat chip then becomes a `users` icon with `joined/8` instead of the 8-avatar stack, which also fixes the card wrapping at 8 managers.
    - a **Join** button (accent, `user-plus`) while joining is open and you haven't joined; joining also has you pick your color
- **Tournament page:**
  - **Header:** event logo, name, status badge, a **matches pill** (calendar icon, `18/32`, mini bar) and the manager avatar stack, **ordered by rank** once points exist. Clicking your own avatar opens the ColorPicker.
  - **Tabs:** **Rosters**, **Matches**, **Draft**, **Teams**, plus **Settings** for the commissioner.
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
- **Points** (checkpoint 2): PlayerChips on Teams and Rosters show points right-aligned in mono (tournament points on Teams, the selected scope's points on Rosters). A pick whose team hasn't played yet shows `–`.

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
  - **Sort:** click a column header (`PLAYER` A–Z, `PTS`, `RTG`, `ACS`, `K/D`). `PTS` is tournament points so far (checkpoint 2), so later stages' redrafts can use it. The default is PTS descending once any points exist, otherwise RTG descending; nulls sort last.
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

### 5.6 Rosters tab (standings)

The Rosters tab doubles as the standings.

```
  [Total][Stage 1][Playoffs]
  ┌ 1 (Ja) James  🔒 2,213 ┐┌ 2 (W) Will  🔒 2,154 ┐ …          ← rank, avatar, name, lock, total (mono, large)
  │ ◐ aspas            523 ││ ◐ mada           755 │
  │ ◐ OXY              397 ││ ◐ Asuna          377 │              ← one column: 5 players + coach,
  │ ◐ Derrek           211 ││ …                    │                34px rows, points right-aligned
  │ ◐ khalil           156 ││                      │
  │ ◐ Verno            650 ││                      │
  │ ◐ mCe 🎓           276 ││                      │
  └────────────────────────┘└──────────────────────┘
  (4 more cards in a second row)
```

- **Scope chips:** **Total**, then one per stage. The default is Total.
- A **4 × 2 grid** of manager cards, **in rank order** (left to right, then the next row), so 8 fit on one screen.
- **Every card has:**
  - the manager's tint
  - a header with the rank number (mono), the avatar, a lock icon once locked, and the scope's total (mono, large, right-aligned)
  - **in a stage scope:** **one column of 6 rows** (34px each): the 5 players, then the coach, each a PlayerPhoto (26px), the handle and its stage points in mono, right-aligned. Negative points use `loss` with a real minus sign. One column instead of Rosters' 2 × 3 grid keeps long handles from truncating once points share the row.
  - **in Total:** one compact row per stage: the stage name, a thin bar in the manager's color (that subtotal ÷ the largest stage subtotal), and the subtotal (mono). No chips.
- The rank number is mono and muted; #1's is `accent-text`.
- Before any points exist, the cards keep their draft order and show `–` for totals.

### 5.7 Matches tab (checkpoint 2)

```
  [Stage 1][Playoffs]                                                         [⇩]   ← sync (commissioner)
  ┌ Schedule (≤420px) ──────────────┐  ┌ Match detail ─────────────────────────────────────────┐
  │ Mar 19  2 matches               │  │ [8] M80  2 : 1  Oxygen [O]          Mar 19 · 18:00 · BO3 │
  │ 18:00 [8] M80        (J)(W)  2  │  │ [Ascent 13–8] [Lotus 10–13] [Sunset 14–12]            │
  │ BO3   [O] Oxygen  (K)(J)(S)  1 ⚠│  │ M80          K  D  A  FK FD 3K 4K ACE CL  PTS         │
  │ 21:00 [T] TSM           (A)  0  │  │ koalanoob (J) 52 41 9 …                       …         │
  │ BO3   [M] Moist x S… (T)(W)  2  │  │ …                                                     │
  │ Mar 21  2 matches               │  │ Oxygen       K  D  A …                                 │
  │ Live  [T] Thinking Men  (J)  1  │  │ dapr (S) …   ↳ Jonaaa6 …                               │
  └─────────────────────────────────┘  └───────────────────────────────────────────────────────┘
```

- **Stage chips**, and the commissioner's **Sync** icon button (`cloud-download`) at the right. Scraping is automatic (§4.5); Sync just runs it now. The button spins while `syncRunning` is true.
- **Auto-refresh:** while the tournament has a live or due match, the Matches, standings and tournament queries refetch every 60 seconds.
- **List + detail.** A narrow schedule panel (max 420px) on the left and the selected match's detail filling the rest. Below ~960px they stack, detail under the list. The most recent completed match is selected by default.
- **Schedule:** grouped under date headers (`Mar 19` plus a muted match count). Times are in the viewer's local timezone. **Each row** (about 64px):
  - left: the start time, or a **Live** accent badge, with `BO3`/`BO5` under it
  - **the two teams stacked**, one line each: logo, name, then small avatars of the managers who own a pick on *that team*, then the score in mono at the right edge. The winner's name and score are bright; the loser's are dim. Upcoming scores show `–`.
  - **for the commissioner only:** `triangle-alert` at the far right when the match needs attention. The tooltip says "Scrape failed" or "Assign subs".
  - the selected row gets a lifted background and a 2px accent edge on the left. Upcoming rows aren't selectable. A live row is, once it has a finished map: the detail shows the maps so far, and the in-progress map isn't listed.
- **Detail panel** for the selected completed match:
  - a header: both logos and names with the series score between them, and the date, time and format at the right
  - one chip per map: the map name and its score
  - **two team tables, stacked.** Each has its 5 players and coach as rows. Each row shows:
    - the PlayerPhoto and handle
    - the owner's avatar ring, if the pick is owned in this stage
    - the series totals in mono: `K D A FK FD 3K 4K ACE CL`
    - `PTS` in bold mono

    The coach row shows only `PTS`.
  - **subs** show under the player they replaced, with `corner-down-right` and the sub's handle and stats. For the commissioner, an unassigned sub has a compact select listing that map's missing players plus "None".
- Nothing else: no recap text, no per-map stat breakdown.

### 5.8 Implementation

- Generate `src/client/theme.ts` from the tokens, using the README's "In the app (MUI)" mapping.
- Expose every token as a CSS custom property on `:root`, through `CssBaseline` global styles.
- Build the shared components in §3.3 once and reuse them. Don't restyle panes ad hoc.
- Respect `prefers-reduced-motion`.
- **Mockups:** `docs/mockups/*.dc.html` (also browsable at <https://claude.ai/artifact/N6dULcNbss7tDJ1K9KiEWq>, private) show every Checkpoint 1 screen with sample data. Checkpoint 2 has its own row on the canvas: `Standings.dc.html` (click Total / Stage 1), `Matches.dc.html` (tweaks: commissioner, sub assigned) and `CardTop3.dc.html`; `TournamentHeader.dc.html` gains the Matches tab. Points on Teams chips and the pool's `PTS` column have no mockup: follow §5.4 and §5.5. They're the visual target; open the source for exact sizes and spacing. Where they and this plan disagree, this plan wins.

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

### Checkpoint 2: Stats, scoring and standings

**Goal:**
- Matches fill in with per-map stats from VLR automatically: every 15 minutes from their scheduled time, map by map as each one finishes, until the series is done.
- Every rostered player and coach scores by §1.1, including subs standing in.
- The standings show on the Rosters tab, the home card and the header.
- A Matches tab shows the schedule, results and each match's points.

**Demo script (checkpoint gate):**
1. **Re-score check:** the package 2.2 acceptance passes. Split 1 player totals match the spreadsheet, and any differences are reported.
2. Import a current or recent VLR event that already has completed matches in its first stage. The 8 dev managers join and draft stage 1. A short pick timer with autopicks is fine.
3. **Matches tab:** the schedule is grouped by date. Press **Sync** as the commissioner (it spins, then stops), and the completed matches get scores. Then set one `ok` match back to `pending` with `checked_at` cleared in Drizzle Studio: within a minute the ticker scrapes it again without anyone pressing Sync.
4. **Force a failure:** from a scratchpad script, run the job for one `pending` match against the dev DB with a fetcher that returns a corrupted fixture. It shows `triangle-alert` with "Scrape failed". Press Sync (real fetcher) and the alert clears.
5. **Live series:** from a scratchpad script, run the job for one match with a fetcher returning the live fixture (§2.1). Only its finished maps appear in the detail and in points; the coach and sweep bonus are 0; the match stays `pending`.
6. **Match detail:** select a completed match. It shows map scores, both teams' rows with owner rings, stat totals and points. Check one player's and one coach's points by hand against §1.1.
7. **Subs:** find a match where a sub played; if there isn't one, set one up in the DB from a fixture. An auto pairing credits the replaced player. Then create an ambiguous case (2 missing, 1 sub). The alert shows "Assign subs"; assign the sub, and that player's and manager's points change.
8. **Rosters:** cards are ranked, and the Total and stage scopes agree with the match detail sums. The home card shows the top 3, and the header stack is in rank order.
9. **Teams** chips show points. In stage 2's draft pool, the `PTS` column sorts.
10. **Log in as a member:** there's no Sync button, no alerts and no sub selects.

**Packages**

**2.1 Match scrape and sync.** Covers the §4.1 checkpoint 2 tables and stage columns (with a migration), Swiss detection on import and sync (§4.5), the §4.5 match parser, the finished-map rule, the sanity checks, sub pairing, the sync job, the ticker and the endpoint. Commit these fixtures under `__fixtures__/`:
- a Bo3 2-0 match
- a Bo3 2-1 match with an overtime map
- a match where a sub played
- a **live** match with at least one finished map and one in progress. If no match is live while you work, make it by editing the 2-1 fixture so its last map reads, say, 9-7 with partial stats, and say so in the report.
- the tabs those need for multi-kills and clutches

*Accept:*
- The parser extracts every §4.5 field from the fixtures, including the real best-of and team ids.
- A corrupted fixture fails the sanity check and saves only `failed` plus the error.
- Sync is idempotent and never touches `ok` matches.
- The live fixture saves only its finished maps and stays `pending`. Finished-map rule tests: 13-11 and 14-12 count; 12-12 and 13-12 don't.
- `isDue` tests: not before `scheduled_at`; due at it; not again within 15 minutes of `checked_at`; `failed` stays due; `ok` never is.
- Two overlapping runs don't both scrape.
- Sub pairing unit tests (pure, in `src/shared`), using rostered picks only:
  - 1 missing and 1 sub: auto-paired
  - 0 missing: the sub replaces nobody
  - 2 missing and 1 sub: needs attention until it's assigned
  - a registered, unrostered bench player isn't counted as missing

**2.2 Scoring and standings API.** Covers `scoring.ts` and the §4.5 API, including `PUT /api/matches/:id/subs`.

*Tests:*
- the player formula
- an ace isn't also counted as a multi-kill
- the sweep bonus: once per series, only for those who played (or whose sub did), and not while the match is live
- a live match: its finished maps score; the coach gets 0 until it's completed
- sub credit
- coach points for a 2-0, a 2-1, a Bo5 3-0 and 3-1, and a loss (no unplayed-map points)
- a stage only counts its own matches
- Swiss phantom series: a 3-0 team gets 2 at the pick's average, a 3-1 team gets 1, a 3-2 team and eliminated teams get 0, coaches use their own average, and a sat-out series counts as 0 in the average
- the tiebreak

*Accept, the Split 1 re-score:*
1. Import <https://www.vlr.gg/event/1971/challengers-league-2024-north-america-stage-1/regular-season> (the spreadsheet's event) and sync every completed regular-season match. That's about 40 match pages under §2.5, so a few minutes.
2. Using a one-off script in the scratchpad (not committed), compute each player's **raw** total by VLR id: their own map rows plus the sweep bonus, with no sub credit and no phantom series (the Split 1 regular season wasn't Swiss). Compare it against the spreadsheet's Stats sheet, column `Points`.
   - The spreadsheet is at `/mnt/c/Users/sxc/Downloads/VCT Challengers NA 2024 Split 1 Fantasy.xlsx`. It's a downloaded file: copy it to the scratchpad and read it with `python -I` and openpyxl, from a venv.
3. **mada = 755 and Reduxx = 601 must match exactly.** Report every other mismatch with its likely cause: a spreadsheet typo, or a different reading of a rule (§1.2). Don't tune the rules to hide a mismatch.

**2.3 Standings UI** ‖ parallel-safe with 2.4. Covers:
- §5.6
- the home card's top-3 row
- the header stack in rank order
- points on the Teams chips
- the pool's `PTS` column and default sort

*Accept:* demo steps 8 and 9, with screenshots compared against the design README.

**2.4 Matches tab** ‖ parallel-safe with 2.3. Covers §5.7: the schedule list, per-team pick avatars, the match detail panel (including live matches' finished maps), the commissioner's Sync button with its `syncRunning` spinner, the 60-second auto-refresh, the alerts and sub selects.

*Accept:* demo steps 3 to 7 and 10, with screenshots.

### Checkpoint 3: Running over time (tentative; re-planned after Checkpoint 2, don't start)

- More scheduled jobs on the Checkpoint 2 ticker: a nightly refetch and a standings snapshot.
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

- The Checkpoint 2 demo script passes end to end.
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
- [x] 1.7 Draft room, client (commit 7abe906)
- [x] 1.8 Rosters and polish (commit bb28d5e)
- [x] Checkpoint 1 gate, report and re-planning notes (demo steps 1–9 passed 2026-11-17)
- [x] 2.1 Match scrape and sync (commit b05f5f2)
- [x] 2.2 Scoring and standings API (commit f887544)
- [ ] 2.3 Standings UI
- [ ] 2.4 Matches tab
- [ ] Checkpoint 2 gate, report and re-planning notes → **stop here**
