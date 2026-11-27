# Leaderboard: implementation plan

A new **Leaderboard** tab that ranks every pickable in a scope by points, with the match stats behind those points. Terms follow `CONTEXT.md`. Work follows `docs/PLAN.md` §2 (worktree per package, review loop, keep it simple).

## 1. Decisions (settled with the user)

**Place and scope**
- A new tab, **Leaderboard**, between Rosters and Matches, Lucide `list-ordered`. Every logged-in user sees it.
- It ranks **pickables**. Standings (managers) stay on Rosters.
- Scope chips: **Total**, then one per stage. Default Total.
- Rows: **every pickable in the scope's pool**, drafted or not. In Total, every pickable in any stage's pool.
- A **players / coaches** toggle, like the draft pool.

**Columns** (totals only: no per-map columns, no heatmap)

| Kind | Columns, in order |
|---|---|
| Players | OWNERS · MAPS · PRO · PTS · R · ACS · K/D · ADR · KPR · FK:FD · KAST · K · D · A · FK · FD · 3K · 4K · ACE · CL · BONUS |
| Coaches | OWNERS · MAPS · COACH · PTS · ROUNDS WON · UNPLAYED BONUS · BONUS |

- No rank column; the default sort shows the order.
- Count cells show counts, with their points value in the tooltip.
- **BONUS** is the sweep and forfeit points, so every row's stat points plus BONUS equal PTS. For coaches, 2 × ROUNDS WON + UNPLAYED BONUS + BONUS = PTS.
- **Sub stats** count in the replaced pickable's row, marked with `corner-down-right` and the sub's handle in the tooltip.
- **R, ACS, ADR and KAST** are averaged over rounds played, weighted by each map's rounds. They're never summed.
- **K/D** = K ÷ D, **KPR** = K ÷ rounds played, **FK:FD** = FK ÷ FD, all from the scope's totals. A zero denominator counts as 1 (3 FK, 0 FD → 3.00).
- Format: R, K/D, KPR and FK:FD always show 2 decimals; ACS and ADR are whole numbers; KAST is a whole percent.
- A pickable whose team has no result in the scope shows `–` in every cell and sorts last.
- No dimming of eliminated pickables. MAPS explains low totals.

**Ownership**
- OWNERS shows the owner's avatar with its color ring. Rows aren't tinted.
- In Total, it shows a stack of every manager who owned the pickable in any stage.

**Sort and filters**
- Click a header to sort. Default: PTS, highest first, ties by best single match, then name. Nulls last in every column.
- **Manager toggles:** one avatar per manager plus an **Undrafted** toggle. Several can be picked; none picked means everyone. Rows that don't match are hidden. In Total, a row matches any of its owners.
- The draft pool's **search** (`/` focuses it) and **team-logo toggles**.
- Sort and filters live in component state and reset on leaving the tab.
- The page scrolls with the header row pinned. No pages. Names link to VLR, as everywhere else.
- It refreshes with the other tournament queries while a match is live (`useLivePolling`).

### Smaller details

- **UNPLAYED BONUS shows points** (30 per unplayed map), like BONUS, since both are named as bonuses. The alternative is the number of unplayed maps, with the points in the tooltip.
- The **Undrafted** toggle uses Lucide `circle-dashed`.
- "Name" in the tiebreak is the pickable's handle.
- A pickable with only forfeits shows PTS and BONUS, MAPS 0, and `–` for the ratios and averages.
- Coach MAPS, ROUNDS WON and UNPLAYED BONUS count only completed series, the same rule as coach points, so a live series never shows maps that aren't in PTS yet.
- One API response carries every scope, so switching scope chips doesn't wait on the network.
- Tooltip points use the tournament's own scoring config, not the defaults.

## 2. What exists today

- `scoreTournament` (`src/server/points.ts`) scores every match on read: per-pickable match points, the sub pairings, and stage points. `standingsOf` and the match routes build on it.
- `player_map_stats` stores only the 9 scoring counts. VLR's overview tables also carry `rating2`, `acs`, `kast` and `adr` per map (`data-col` cells, `.side.mod-both`). `src/server/vlr/match.ts` reads the same rows today and ignores those columns.
- `fetchPage` saves every page it fetches in `raw_pages`, so the overview and performance pages of every scraped match are already on disk.
- `DraftPool.tsx` has `TeamToggles`, `SortHeader` and the search box with `/`.
- `useLivePolling` invalidates everything under `tournamentQueryKey(tournamentId)`.

## 3. Work packages

Run 3.1 first. 3.2 and 3.3 are parallel-safe after it. 3.4 needs 3.3's types.

### 3.1 Save R, ACS, KAST and ADR per map

- **Migration** `0008`: add nullable `rating` (real), `acs` (integer), `kast` (integer, percent) and `adr` (integer) to `player_map_stats`. Nullable because rows written by hand in Drizzle Studio may lack them.
- **Parser** (`vlr/match.ts`): read `rating2`, `acs`, `kast` (strip `%`) and `adr` from the same overview row. Keep them out of `MapStatLine`; it's the scoring line and drives `addStatLines`. A blank or `-` value parses to null rather than failing the scrape.
- **Sync** writes the four columns with the rest of the row.
- *Tests:* the Bo3 2-0 overview fixture gives the known values for one player (for example KAST 79, ADR 176); the sub and overtime fixtures still parse.

*Accept:* lint, typecheck and tests pass; a fresh sync of a fixture match stores the four values.

### 3.2 Fill in the new columns for matches already scraped

- A one-off CLI, `src/server/vlr/backfill-map-stats.ts`, plus an npm script. For each match with stat rows, read its overview and performance pages from `raw_pages` (never from VLR) and run `parseMatchPages`. Update only the four new columns of rows matched on `(match_id, map_no, vlr_player_id)`. Never insert, delete or change other columns, and never change `scrape_status`.
- Skip a match whose pages aren't saved. Print how many rows were filled and which matches were skipped.
- Safe to run twice.
- *Tests:* a seeded DB with one saved fixture match fills its rows; a match with no saved pages is skipped and untouched.

*Accept:* run it on the dev DB, then **ask the user before running it on Fly** (`fly ssh console -C "…"`).

### 3.3 Leaderboard API

- **Shared types** in `src/shared/api.ts`: `LeaderboardResponse` with one entry per scope (`total` and each `stageId`). Each holds rows of: the pickable and its team logo, `ownerUserIds`, `maps`, `rounds`, the 9 counts, `bonus`, `points`, `bestMatchPoints`, the four averages (null without data), the subs credited (handles), and for coaches `roundsWon` and `unplayedBonus`. The response also carries the tournament's merged `ScoringConfig`, so the tooltips' points match a tournament that overrides the defaults; the client doesn't receive it today.
- **Shared pure functions** in `src/shared/scoring.ts`: `ratio(numerator, denominator)` with the zero-as-1 rule, and a rounds-weighted average. Unit tests for both.
- **Server** `src/server/leaderboard.ts`, built from one `scoreTournament` call:
  - Per stage, per pool pickable: its own rows plus credited sub rows from each match's pairings (reuse the same logic as `scoredRowsOf` in `points.ts`; export it rather than copying it).
  - Player MAPS = rows counted; rounds = the summed rounds of those maps from `match_maps`.
  - Coach MAPS = maps their team played in completed series.
  - `bonus` = match points − the rows' stat points (players), or − the coach formula's parts (coaches). Working it out by subtraction guarantees the columns add up to PTS.
  - Coaches: ROUNDS WON and UNPLAYED BONUS count only completed series, the same as coach points.
  - Owners from the stage's `rosterEntries`. Total adds the stage rows and joins the owners across stages.
- **Route** `GET /api/tournaments/:id/leaderboard`, `requireUser`, returning every scope at once so switching chips is instant.
- *Tests:* a player's stat points + BONUS = PTS, including a sweep; a sub-credited map lands in the replaced pickable's row; ACS is weighted by rounds; Total owners include managers from two stages; an undrafted pickable has no owners; a forfeit gives PTS and BONUS with zero maps; a coach in a live series shows 0 MAPS for it; the response's config reflects a tournament's `scoring_json` override.

*Accept:* `curl` on the dev DB returns all scopes, and one player's and one coach's PTS match the Rosters tab.

### 3.4 Leaderboard tab

- Move `TeamToggles` and `SortHeader` from `DraftPool.tsx` to `src/client/components/`, unchanged, and use them in both places.
- New `ManagerToggles`: the manager avatars plus the Undrafted toggle, styled like `TeamToggles`.
- `src/client/pages/tournament/leaderboard/LeaderboardTab.tsx`: scope chips, kind toggle, search, team toggles, manager toggles, then the table in a `pane-dense` pane.
- Table: pinned header, 40–42px rows, numbers in Geist Mono right-aligned, `PlayerChip` for the name, `ManagerStack` for owners, the sub icon and tooltip, and count tooltips with points. No visible text beyond names, numbers and column headers (PLAN §5.2).
- The query key sits under `tournamentQueryKey(tournamentId)` so live polling refreshes it.
- Add the tab to `MEMBER_TABS` in `Tournament.tsx`.
- *Tests:* default order is PTS descending with nulls last; clicking a header re-sorts; manager, Undrafted, team and search filters combine; the coach toggle swaps columns; ratio and percent formatting; a tooltip uses a non-default kill value from the config.

*Accept:* screenshots of Total and one stage, players and coaches, compared against `docs/design-system/README.md`. 96 rows scroll with the header pinned. All 21 player columns fit without sideways scrolling in a 1440px-wide window; if they don't, stop and tell the user before trimming anything.

### 3.5 Docs

- `docs/PLAN.md`: a §5 section for the Leaderboard tab, the `list-ordered` and `circle-dashed` icons in the §5.2 table, the four new `player_map_stats` columns in §4.1, and the §8 log entries.

## 4. Out of scope

- Per-map columns, a heatmap, and a Total / per-map switch
- Saving filters in the page link
- A per-pickable breakdown panel (the Matches tab already has per-match detail)
- HS% and other VLR columns not listed above
- Discord posts for the leaderboard
