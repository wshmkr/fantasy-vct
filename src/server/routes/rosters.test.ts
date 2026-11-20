import { eq } from "drizzle-orm";
import type TestAgent from "supertest/lib/agent.js";
import { beforeAll, describe, expect, test, vi } from "vitest";
import type { TeamWithPickables } from "../../shared/entities.js";
import { db } from "../db/client.js";
import { pickables, stagePool, stages } from "../db/schema.js";
import { importAndWait, insertUser, loginAs } from "../test-utils.js";

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

async function fetchTeams(): Promise<TeamWithPickables[]> {
  return (await commissioner.get(`/api/tournaments/${tournamentId}/teams`))
    .body;
}

async function teamNamed(name: string): Promise<TeamWithPickables> {
  const team = (await fetchTeams()).find(
    (candidate) => candidate.name === name,
  );
  if (!team) throw new Error(`no team ${name}`);
  return team;
}

function setupStageIds(): number[] {
  return db
    .select({ id: stages.id })
    .from(stages)
    .where(eq(stages.tournamentId, tournamentId))
    .all()
    .map((stage) => stage.id);
}

function poolStageIdsOf(pickableId: number): number[] {
  return db
    .select({ stageId: stagePool.stageId })
    .from(stagePool)
    .where(eq(stagePool.pickableId, pickableId))
    .all()
    .map((row) => row.stageId);
}

function pickableByVlrId(vlrId: string) {
  const pickable = db
    .select()
    .from(pickables)
    .where(eq(pickables.vlrId, vlrId))
    .get();
  if (!pickable) throw new Error(`no pickable ${vlrId}`);
  return pickable;
}

beforeAll(async () => {
  commissioner = await loginAs(insertUser("commish", "commissioner").id);
  member = await loginAs(insertUser("member").id);
  const job = await importAndWait(commissioner, "/api/tournaments", {
    vlrEventUrl: "vlr.gg/event/3124/spike-series-2026-convergence-emea-dach/",
  });
  tournamentId = job.tournamentId;
});

describe("roster edits", () => {
  test("a pasted VLR player link adds that player to the team and its setup pools", async () => {
    const berg = await teamNamed("BERG");
    await commissioner
      .post(`/api/teams/${berg.id}/roster`)
      .send({ vlrPlayerUrl: "vlr.gg/player/99001/newguy", kind: "player" })
      .expect(204);

    const added = pickableByVlrId("99001");
    expect(added).toMatchObject({
      teamId: berg.id,
      kind: "player",
      vlrUrl: "https://www.vlr.gg/player/99001/newguy",
      onRoster: true,
      rosterSetManually: true,
    });
    expect(added.handle).not.toBe("");
    expect((await teamNamed("BERG")).pickables.map((p) => p.id)).toContain(
      added.id,
    );
    expect(poolStageIdsOf(added.id).toSorted()).toEqual(
      setupStageIds().toSorted(),
    );
  });

  test("adding a player who is on another team moves them", async () => {
    const berg = await teamNamed("BERG");
    const frg = await teamNamed("FRG");
    const mover = frg.pickables.find((p) => p.kind === "player");
    if (!mover?.vlrUrl) throw new Error("no FRG player");

    await commissioner
      .post(`/api/teams/${berg.id}/roster`)
      .send({ vlrPlayerUrl: mover.vlrUrl, kind: "player" })
      .expect(204);

    expect((await teamNamed("BERG")).pickables.map((p) => p.id)).toContain(
      mover.id,
    );
    expect((await teamNamed("FRG")).pickables.map((p) => p.id)).not.toContain(
      mover.id,
    );
  });

  test("removing takes the pickable off the team and out of setup pools", async () => {
    const berg = await teamNamed("BERG");
    const leaving = berg.pickables.find((p) => p.kind === "player");
    if (!leaving) throw new Error("no BERG player");

    await commissioner
      .delete(`/api/teams/${berg.id}/roster/${leaving.id}`)
      .expect(204);

    expect((await teamNamed("BERG")).pickables.map((p) => p.id)).not.toContain(
      leaving.id,
    );
    expect(poolStageIdsOf(leaving.id)).toEqual([]);
  });

  test("a new coach replaces the team's coach", async () => {
    const berg = await teamNamed("BERG");
    await commissioner
      .post(`/api/teams/${berg.id}/roster`)
      .send({ vlrPlayerUrl: "https://www.vlr.gg/player/99002", kind: "coach" })
      .expect(204);

    const coaches = (await teamNamed("BERG")).pickables.filter(
      (p) => p.kind === "coach",
    );
    expect(coaches.map((coach) => coach.id)).toEqual([
      pickableByVlrId("99002").id,
    ]);
  });

  test("re-importing keeps manual edits and drops players VLR no longer lists", async () => {
    const before = await teamNamed("BERG");
    const frg = await teamNamed("FRG");
    const removedId = frg.pickables[0]?.id;
    await commissioner
      .delete(`/api/teams/${frg.id}/roster/${removedId}`)
      .expect(204);
    const stale = db
      .insert(pickables)
      .values({
        kind: "player",
        handle: "Retired",
        vlrId: "99003",
        teamId: before.id,
        photoImageId: before.pickables[0]?.photoImageId ?? 1,
      })
      .returning()
      .get();

    await importAndWait(
      commissioner,
      `/api/tournaments/${tournamentId}/reimport`,
    );

    const after = await teamNamed("BERG");
    expect(after.pickables.map((p) => p.id).toSorted()).toEqual(
      before.pickables.map((p) => p.id).toSorted(),
    );
    expect(after.pickables.map((p) => p.id)).not.toContain(stale.id);
    expect(
      after.pickables.filter((p) => p.kind === "coach").map((p) => p.id),
    ).toEqual([pickableByVlrId("99002").id]);
    expect((await teamNamed("FRG")).pickables.map((p) => p.id)).not.toContain(
      removedId,
    );
  });

  test("only the commissioner edits rosters, and only with a VLR player link", async () => {
    const berg = await teamNamed("BERG");
    await member
      .post(`/api/teams/${berg.id}/roster`)
      .send({ vlrPlayerUrl: "vlr.gg/player/1/x", kind: "player" })
      .expect(403);
    await member.delete(`/api/teams/${berg.id}/roster/1`).expect(403);
    await commissioner
      .post(`/api/teams/${berg.id}/roster`)
      .send({ vlrPlayerUrl: "vlr.gg/team/1/x", kind: "player" })
      .expect(400);
  });

  test("pools of stages that have started stay as they were", async () => {
    const [stageId] = setupStageIds();
    if (stageId === undefined) throw new Error("no stage");
    db.update(stages)
      .set({ status: "drafting" })
      .where(eq(stages.id, stageId))
      .run();
    const berg = await teamNamed("BERG");
    const dropped = berg.pickables[0];
    if (!dropped) throw new Error("no BERG pickable");

    await commissioner
      .delete(`/api/teams/${berg.id}/roster/${dropped.id}`)
      .expect(204);

    expect(poolStageIdsOf(dropped.id)).toContain(stageId);
  });
});
