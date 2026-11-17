import { eq } from "drizzle-orm";
import type TestAgent from "supertest/lib/agent.js";
import { beforeAll, describe, expect, test, vi } from "vitest";
import type { Stage, StagePoolTeam } from "../../shared/entities.js";
import { db } from "../db/client.js";
import { stagePool, stages } from "../db/schema.js";
import { draftablePickableIds } from "../draft/pool.js";
import { importAndWait, insertUser, loginAs } from "../test-utils.js";
import { FIXTURE_EVENT_URL } from "../vlr/fake-vlr.js";

vi.mock("../vlr/fetch.js", async (importOriginal) => {
  const { createFakeVlr } = await import("../vlr/fake-vlr.js");
  return {
    ...(await importOriginal<typeof import("../vlr/fetch.js")>()),
    vlrDownloader: createFakeVlr().download,
  };
});

let commissioner: TestAgent;
let member: TestAgent;
let tournamentId: number;

async function fetchStages(): Promise<Stage[]> {
  return (await commissioner.get(`/api/tournaments/${tournamentId}`)).body
    .stages;
}

async function firstStage(): Promise<Stage> {
  const [stage] = await fetchStages();
  if (!stage) throw new Error("no stages");
  return stage;
}

function setStatus(stageId: number, status: Stage["status"]) {
  db.update(stages).set({ status }).where(eq(stages.id, stageId)).run();
}

beforeAll(async () => {
  commissioner = await loginAs(insertUser("commish", "commissioner").id);
  member = await loginAs(insertUser("member").id);
  const job = await importAndWait(commissioner, "/api/tournaments", {
    vlrEventUrl: FIXTURE_EVENT_URL,
  });
  tournamentId = job.tournamentId;
});

describe("stages API", () => {
  test("stages report match count and pool size", async () => {
    const stage = await firstStage();
    expect(stage.matchCount).toBeGreaterThan(0);
    expect(stage.poolSize).toBeGreaterThan(0);
  });

  test("updates name and pick seconds while in setup", async () => {
    const stage = await firstStage();
    await commissioner
      .patch(`/api/stages/${stage.id}`)
      .send({ name: "Groups", pickSeconds: 45 })
      .expect(204);
    expect(await firstStage()).toMatchObject({
      name: "Groups",
      pickSeconds: 45,
    });
    await commissioner
      .patch(`/api/stages/${stage.id}`)
      .send({ pickSeconds: 5 })
      .expect(400);
  });

  test("removes and restores pool entries; removed ones aren't draftable", async () => {
    const stage = await firstStage();
    const poolPath = `/api/stages/${stage.id}/pool`;
    const pool: StagePoolTeam[] = (await commissioner.get(poolPath).expect(200))
      .body;
    const pickableId = pool[0]?.pool[0]?.id;
    if (!pickableId) throw new Error("empty pool");

    await commissioner
      .patch(`${poolPath}/${pickableId}`)
      .send({ removed: true })
      .expect(204);
    const afterRemove: StagePoolTeam[] = (await commissioner.get(poolPath))
      .body;
    expect(afterRemove[0]?.pool[0]).toMatchObject({
      id: pickableId,
      removed: true,
    });
    expect(draftablePickableIds(stage.id)).not.toContain(pickableId);
    expect((await firstStage()).poolSize).toBe(stage.poolSize - 1);

    await commissioner
      .patch(`${poolPath}/${pickableId}`)
      .send({ removed: false })
      .expect(204);
    expect(draftablePickableIds(stage.id)).toContain(pickableId);
  });

  test("members get 403", async () => {
    const stage = await firstStage();
    await member
      .patch(`/api/stages/${stage.id}`)
      .send({ name: "x" })
      .expect(403);
    await member.delete(`/api/stages/${stage.id}`).expect(403);
    await member.get(`/api/stages/${stage.id}/pool`).expect(403);
  });

  test("edits are refused once the draft starts", async () => {
    const stage = await firstStage();
    setStatus(stage.id, "drafting");
    const deleted = await commissioner
      .delete(`/api/stages/${stage.id}`)
      .expect(400);
    expect(deleted.body.error).toBe("Draft started");
    await commissioner
      .patch(`/api/stages/${stage.id}`)
      .send({ name: "Late" })
      .expect(400);
    setStatus(stage.id, "setup");
  });

  test("deletes a setup stage with its pool", async () => {
    const [, lastStage] = await fetchStages();
    if (!lastStage) throw new Error("no second stage");
    await commissioner.delete(`/api/stages/${lastStage.id}`).expect(204);
    expect((await fetchStages()).map((stage) => stage.id)).not.toContain(
      lastStage.id,
    );
    expect(
      db
        .select()
        .from(stagePool)
        .where(eq(stagePool.stageId, lastStage.id))
        .all(),
    ).toEqual([]);
  });
});
