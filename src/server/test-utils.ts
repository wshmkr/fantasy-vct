import request from "supertest";
import type TestAgent from "supertest/lib/agent.js";
import { expect, vi } from "vitest";
import { MANAGER_COLORS, type UserRole } from "../shared/entities.js";
import { createApp } from "./app.js";
import { db } from "./db/client.js";
import {
  images,
  pickables,
  stagePool,
  stages,
  teams,
  tournamentMembers,
  tournaments,
  users,
} from "./db/schema.js";

export const testApp = createApp();

export function insertUser(discordUsername: string, role: UserRole = "member") {
  return db.insert(users).values({ discordUsername, role }).returning().get();
}

export async function loginAs(userId: number) {
  const agent = request.agent(testApp);
  await agent.post("/api/auth/dev").send({ userId }).expect(200);
  return agent;
}

export async function importAndWait(
  agent: TestAgent,
  startPath: string,
  body = {},
) {
  const started = await agent.post(startPath).send(body).expect(202);
  await vi.waitFor(async () => {
    const job = await agent.get(`/api/imports/${started.body.importId}`);
    expect(job.body.error).toBeNull();
    expect(job.body.tournamentId).not.toBeNull();
  });
  return (await agent.get(`/api/imports/${started.body.importId}`)).body;
}

let draftFixtureCount = 0;

export function insertDraftStage({
  managerIds,
  players,
  coaches,
  teamCount = 4,
}: {
  managerIds: number[];
  players: number;
  coaches: number;
  teamCount?: number;
}) {
  const fixtureNo = ++draftFixtureCount;
  const image = db
    .insert(images)
    .values({
      sourceUrl: `fixture-${fixtureNo}`,
      contentType: "image/png",
      bytes: Buffer.from(""),
    })
    .returning()
    .get();
  const tournament = db
    .insert(tournaments)
    .values({
      name: `Draft ${fixtureNo}`,
      vlrEventUrl: `fixture-${fixtureNo}`,
      vlrEventId: `fixture-${fixtureNo}`,
    })
    .returning()
    .get();
  const teamIds = Array.from(
    { length: teamCount },
    (_, teamNo) =>
      db
        .insert(teams)
        .values({
          vlrId: `fixture-${fixtureNo}-${teamNo}`,
          name: `Team ${fixtureNo}-${teamNo}`,
        })
        .returning()
        .get().id,
  );
  const insertPickables = (kind: "player" | "coach", total: number) =>
    Array.from(
      { length: total },
      (_, n) =>
        db
          .insert(pickables)
          .values({
            kind,
            handle: `${kind}-${fixtureNo}-${n}`,
            teamId: teamIds[n % teamCount] as number,
            photoImageId: image.id,
          })
          .returning()
          .get().id,
    );
  const playerIds = insertPickables("player", players);
  const coachIds = insertPickables("coach", coaches);
  const stage = db
    .insert(stages)
    .values({
      tournamentId: tournament.id,
      name: "Stage",
      position: 0,
      source: "manual",
    })
    .returning()
    .get();
  db.insert(stagePool)
    .values(
      [...playerIds, ...coachIds].map((pickableId) => ({
        stageId: stage.id,
        pickableId,
      })),
    )
    .run();
  managerIds.forEach((userId, n) => {
    db.insert(tournamentMembers)
      .values({
        tournamentId: tournament.id,
        userId,
        color: MANAGER_COLORS[n] ?? "manager-red",
      })
      .run();
  });
  return {
    stageId: stage.id,
    tournamentId: tournament.id,
    playerIds,
    coachIds,
  };
}
