import { sql } from "drizzle-orm";
import {
  blob,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";
import {
  DRAFT_ACTION_KINDS,
  MANAGER_COLORS,
  MATCH_STATUSES,
  PICKABLE_KINDS,
  SCRAPE_STATUSES,
  STAGE_SOURCES,
  STAGE_STATUSES,
  type TeamSide,
  type TopAgent,
  USER_ROLES,
} from "../../shared/entities.js";
import type { ScoringConfig } from "../../shared/scoring.js";

// Matches Date.prototype.toISOString(), so rows written by SQL defaults or Drizzle Studio sort and parse like app-written ones.
const isoNow = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

const createdAt = (name: string) => text(name).notNull().default(isoNow);

export const images = sqliteTable("images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceUrl: text("source_url").notNull().unique(),
  contentType: text("content_type").notNull(),
  bytes: blob("bytes", { mode: "buffer" }).notNull(),
  fetchedAt: createdAt("fetched_at"),
});

export const rawPages = sqliteTable("raw_pages", {
  url: text("url").primaryKey(),
  fetchedAt: createdAt("fetched_at"),
  html: text("html").notNull(),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role", { enum: USER_ROLES }).notNull().default("member"),
  discordUsername: text("discord_username").notNull().unique(),
  discordId: text("discord_id").unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  addedAt: createdAt("added_at"),
  firstLoginAt: text("first_login_at"),
  // Soft delete: removed members keep their roster history but can no longer log in.
  removedAt: text("removed_at"),
});

export const tournaments = sqliteTable("tournaments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  vlrEventUrl: text("vlr_event_url").notNull(),
  vlrEventId: text("vlr_event_id").notNull().unique(),
  vlrEndsOn: text("vlr_ends_on"),
  logoImageId: integer("logo_image_id").references(() => images.id),
  joiningOpen: integer("joining_open", { mode: "boolean" })
    .notNull()
    .default(true),
  scoringJson: text("scoring_json", { mode: "json" })
    .$type<Partial<ScoringConfig>>()
    .notNull()
    .default({}),
  webhookUrl: text("webhook_url"),
  discordChannelId: text("discord_channel_id"),
  discordGuildId: text("discord_guild_id"),
  discordRoleId: text("discord_role_id"),
  // The America/Los_Angeles date (YYYY-MM-DD) of the last daily schedule post.
  discordSchedulePostedOn: text("discord_schedule_posted_on"),
  createdAt: createdAt("created_at"),
});

export const tournamentMembers = sqliteTable(
  "tournament_members",
  {
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    color: text("color", { enum: MANAGER_COLORS }).notNull(),
    joinedAt: createdAt("joined_at"),
  },
  (table) => [
    primaryKey({ columns: [table.tournamentId, table.userId] }),
    unique().on(table.tournamentId, table.color),
  ],
);

export const teams = sqliteTable("teams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vlrId: text("vlr_id").notNull().unique(),
  name: text("name").notNull(),
  // VLR's short tag (C9, SRB); null when VLR has none.
  tag: text("tag"),
  // The bot's application emoji for the logo, as message markup (<:name:id>).
  discordEmoji: text("discord_emoji"),
  logoImageId: integer("logo_image_id").references(() => images.id),
});

export const pickables = sqliteTable("pickables", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: PICKABLE_KINDS }).notNull(),
  vlrId: text("vlr_id").unique(),
  handle: text("handle").notNull(),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id),
  isPlaceholder: integer("is_placeholder", { mode: "boolean" })
    .notNull()
    .default(false),
  // Off-roster pickables keep their team so past points still credit it.
  onRoster: integer("on_roster", { mode: "boolean" }).notNull().default(true),
  // Set by the commissioner's roster edits; imports then leave team and onRoster alone.
  rosterSetManually: integer("roster_set_manually", { mode: "boolean" })
    .notNull()
    .default(false),
  vlrUrl: text("vlr_url"),
  photoImageId: integer("photo_image_id")
    .notNull()
    .references(() => images.id),
  topAgentsJson: text("top_agents_json", { mode: "json" })
    .$type<TopAgent[]>()
    .notNull()
    .default([]),
  formRating: real("form_rating"),
  formAcs: real("form_acs"),
  formKd: real("form_kd"),
  formRounds: integer("form_rounds"),
  formFetchedAt: text("form_fetched_at"),
});

export const tournamentTeams = sqliteTable(
  "tournament_teams",
  {
    tournamentId: integer("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id),
  },
  (table) => [primaryKey({ columns: [table.tournamentId, table.teamId] })],
);

export const stages = sqliteTable("stages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tournamentId: integer("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  vlrStageKeysJson: text("vlr_stage_keys_json", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  source: text("source", { enum: STAGE_SOURCES }).notNull(),
  status: text("status", { enum: STAGE_STATUSES }).notNull().default("setup"),
  pickSeconds: integer("pick_seconds").notNull().default(90),
  currentTurnNo: integer("current_turn_no").notNull().default(0),
  turnDeadline: text("turn_deadline"),
  createdAt: createdAt("created_at"),
  discordPostedAt: text("discord_posted_at"),
  discordResultsPostedAt: text("discord_results_posted_at"),
});

export const stageManagers = sqliteTable(
  "stage_managers",
  {
    stageId: integer("stage_id")
      .notNull()
      .references(() => stages.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    seat: integer("seat").notNull(),
    lockedAt: text("locked_at"),
  },
  (table) => [
    primaryKey({ columns: [table.stageId, table.userId] }),
    unique().on(table.stageId, table.seat),
  ],
);

export const stagePool = sqliteTable(
  "stage_pool",
  {
    stageId: integer("stage_id")
      .notNull()
      .references(() => stages.id, { onDelete: "cascade" }),
    pickableId: integer("pickable_id")
      .notNull()
      .references(() => pickables.id),
    removed: integer("removed", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [primaryKey({ columns: [table.stageId, table.pickableId] })],
);

export const rosterEntries = sqliteTable(
  "roster_entries",
  {
    stageId: integer("stage_id")
      .notNull()
      .references(() => stages.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    pickableId: integer("pickable_id")
      .notNull()
      .references(() => pickables.id),
  },
  (table) => [primaryKey({ columns: [table.stageId, table.pickableId] })],
);

export const draftActions = sqliteTable("draft_actions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  stageId: integer("stage_id")
    .notNull()
    .references(() => stages.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  action: text("action", { enum: DRAFT_ACTION_KINDS }).notNull(),
  pickableInId: integer("pickable_in_id").references(() => pickables.id),
  pickableOutId: integer("pickable_out_id").references(() => pickables.id),
  auto: integer("auto", { mode: "boolean" }).notNull().default(false),
  turnNoBefore: integer("turn_no_before").notNull(),
  createdAt: createdAt("created_at"),
});

export const matches = sqliteTable("matches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tournamentId: integer("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  vlrId: text("vlr_id").notNull().unique(),
  stageKey: text("stage_key").notNull(),
  team1Id: integer("team1_id").references(() => teams.id),
  team2Id: integer("team2_id").references(() => teams.id),
  bestOf: integer("best_of").notNull(),
  scheduledAt: text("scheduled_at"),
  status: text("status", { enum: MATCH_STATUSES }).notNull(),
  score1: integer("score1"),
  score2: integer("score2"),
  scrapeStatus: text("scrape_status", { enum: SCRAPE_STATUSES })
    .notNull()
    .default("pending"),
  scrapeError: text("scrape_error"),
  forfeitWinner: integer("forfeit_winner").$type<TeamSide>(),
  scrapedAt: text("scraped_at"),
  checkedAt: text("checked_at"),
  discordPostedAt: text("discord_posted_at"),
  discordStartPostedAt: text("discord_start_posted_at"),
  // Set once a finished match has been checked for problems, alert or not.
  discordAlertCheckedAt: text("discord_alert_checked_at"),
});

export const matchMaps = sqliteTable(
  "match_maps",
  {
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    mapNo: integer("map_no").notNull(),
    mapName: text("map_name").notNull(),
    team1Rounds: integer("team1_rounds").notNull(),
    team2Rounds: integer("team2_rounds").notNull(),
  },
  (table) => [primaryKey({ columns: [table.matchId, table.mapNo] })],
);

export const playerMapStats = sqliteTable(
  "player_map_stats",
  {
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    mapNo: integer("map_no").notNull(),
    vlrPlayerId: text("vlr_player_id").notNull(),
    handle: text("handle").notNull(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id),
    k: integer("k").notNull(),
    d: integer("d").notNull(),
    a: integer("a").notNull(),
    fk: integer("fk").notNull(),
    fd: integer("fd").notNull(),
    mk3: integer("mk3").notNull(),
    mk4: integer("mk4").notNull(),
    aces: integer("aces").notNull(),
    clutches: integer("clutches").notNull(),
    // Not scored; nullable because hand-written rows may lack them.
    rating: real("rating"),
    acs: integer("acs"),
    kast: integer("kast"),
    adr: integer("adr"),
  },
  (table) => [
    primaryKey({
      columns: [table.matchId, table.mapNo, table.vlrPlayerId],
    }),
  ],
);

export const subAssignments = sqliteTable(
  "sub_assignments",
  {
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    mapNo: integer("map_no").notNull(),
    subVlrPlayerId: text("sub_vlr_player_id").notNull(),
    replacesPickableId: integer("replaces_pickable_id").references(
      () => pickables.id,
    ),
  },
  (table) => [
    primaryKey({
      columns: [table.matchId, table.mapNo, table.subVlrPlayerId],
    }),
  ],
);
