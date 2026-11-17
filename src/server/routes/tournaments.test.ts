import { eq } from "drizzle-orm";
import type TestAgent from "supertest/lib/agent.js";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { MANAGER_COLORS, type Tournament } from "../../shared/entities.js";
import { db } from "../db/client.js";
import { images, matches, stages } from "../db/schema.js";
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

beforeAll(async () => {
  commissioner = await loginAs(insertUser("commish", "commissioner").id);
  member = await loginAs(insertUser("member").id);
  const job = await importAndWait(commissioner, "/api/tournaments", {
    vlrEventUrl: "vlr.gg/event/3124/spike-series-2026-convergence-emea-dach/",
  });
  tournamentId = job.tournamentId;
  expect(job.progress.players).toMatchObject({ done: 11, total: 11 });
});

describe("tournaments API", () => {
  test("lists the imported tournament with status and match progress", async () => {
    const { body } = await member.get("/api/tournaments").expect(200);
    expect(body).toEqual([
      expect.objectContaining({
        id: tournamentId,
        vlrEventUrl: FIXTURE_EVENT_URL,
        joiningOpen: true,
        teamCount: 16,
        matchesTotal: 70,
        members: [],
      }),
    ]);
    const [tournament] = body as Tournament[];
    expect(tournament?.stages.map((stage) => stage.name)).toEqual([
      "Group Stage",
      "Playoffs",
    ]);
    expect(tournament?.matchesPlayed).toBeGreaterThan(0);
    expect(tournament?.status).toBe("live");
  });

  test("status is derived from stages and matches", async () => {
    const path = `/api/tournaments/${tournamentId}`;
    const [firstStage] = db.select().from(stages).all();
    if (!firstStage) throw new Error("no stages");

    db.update(stages)
      .set({ status: "paused" })
      .where(eq(stages.id, firstStage.id))
      .run();
    expect((await member.get(path)).body.status).toBe("drafting");
    db.update(stages)
      .set({ status: "setup" })
      .where(eq(stages.id, firstStage.id))
      .run();

    const savedStatuses = db
      .select({ id: matches.id, status: matches.status })
      .from(matches)
      .all();
    db.update(matches).set({ status: "upcoming" }).run();
    expect((await member.get(path)).body).toMatchObject({
      status: "upcoming",
      matchesPlayed: 0,
    });
    db.update(matches).set({ status: "completed" }).run();
    expect((await member.get(path)).body.status).toBe("ended");
    for (const { id, status } of savedStatuses) {
      db.update(matches).set({ status }).where(eq(matches.id, id)).run();
    }
  });

  test("rejects links that aren't VLR events", async () => {
    const { body } = await commissioner
      .post("/api/tournaments")
      .send({ vlrEventUrl: "https://www.vlr.gg/team/2/sentinels" })
      .expect(400);
    expect(body.error).toBe("Invalid VLR link");
  });

  test("re-import reports the same tournament", async () => {
    const job = await importAndWait(
      commissioner,
      `/api/tournaments/${tournamentId}/reimport`,
    );
    expect(job.tournamentId).toBe(tournamentId);
  });

  test("lists teams with their players and coach", async () => {
    const { body } = await member
      .get(`/api/tournaments/${tournamentId}/teams`)
      .expect(200);
    expect(body).toHaveLength(16);
    const coachless = body.find(
      (team: { name: string }) => team.name === "Backed by Nobody",
    );
    expect(coachless.pickables.map((p: { kind: string }) => p.kind)).toEqual([
      "player",
      "player",
      "player",
      "player",
      "player",
      "coach",
    ]);
    expect(coachless.pickables.at(-1)).toMatchObject({
      handle: "Backed by Nobody Coach",
      isPlaceholder: true,
      vlrUrl: null,
    });
  });

  test("members get 403 on commissioner routes", async () => {
    const base = `/api/tournaments/${tournamentId}`;
    await member
      .post("/api/tournaments")
      .send({ vlrEventUrl: FIXTURE_EVENT_URL })
      .expect(403);
    await member.patch(base).send({ joiningOpen: false }).expect(403);
    await member.post(`${base}/reimport`).expect(403);
    await member.delete(`${base}/members/1`).expect(403);
  });

  test("serves stored images with long cache headers", async () => {
    const image = db.select().from(images).get();
    if (!image) throw new Error("no images");
    const res = await member.get(`/api/images/${image.id}`).expect(200);
    expect(res.headers["content-type"]).toContain(image.contentType);
    expect(res.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  test("pick timer applies to stages still in setup", async () => {
    await commissioner
      .patch(`/api/tournaments/${tournamentId}`)
      .send({ pickSeconds: 60 })
      .expect(204);
    const { body } = await member.get(`/api/tournaments/${tournamentId}`);
    expect(
      body.stages.map((stage: { pickSeconds: number }) => stage.pickSeconds),
    ).toEqual([60, 60]);
  });
});

describe("joining", () => {
  test("enforces free colors, 8 managers and open joining", async () => {
    const base = `/api/tournaments/${tournamentId}`;
    const joiners = await Promise.all(
      Array.from({ length: 9 }, (_, index) =>
        loginAs(insertUser(`joiner${index}`).id),
      ),
    );
    const [first, second] = joiners;
    if (!first || !second) throw new Error("no joiners");

    await first
      .post(`${base}/members`)
      .send({ color: "manager-red" })
      .expect(204);
    const taken = await second
      .post(`${base}/members`)
      .send({ color: "manager-red" })
      .expect(400);
    expect(taken.body.error).toBe("Color taken");

    for (const [index, joiner] of joiners.slice(1, 8).entries()) {
      await joiner
        .post(`${base}/members`)
        .send({ color: MANAGER_COLORS[index + 1] })
        .expect(204);
    }
    const full = await joiners[8]
      ?.post(`${base}/members`)
      .send({ color: "manager-rose-deep" })
      .expect(400);
    expect(full?.body.error).toBe("Tournament full");

    const me = (await first.get("/api/me")).body;
    await first
      .patch(`${base}/members/me`)
      .send({ color: "manager-amber" })
      .expect(400);
    await first
      .patch(`${base}/members/me`)
      .send({ color: "manager-blue-deep" })
      .expect(204);
    const recolored = await first.get(base);
    expect(
      recolored.body.members.find(
        (m: { user: { id: number } }) => m.user.id === me.id,
      ).color,
    ).toBe("manager-blue-deep");

    await commissioner.delete(`${base}/members/${me.id}`).expect(204);
    await commissioner.patch(base).send({ joiningOpen: false }).expect(204);
    const closed = await first
      .post(`${base}/members`)
      .send({ color: "manager-red" })
      .expect(400);
    expect(closed.body.error).toBe("Joining closed");

    const [firstStage] = db.select().from(stages).all();
    db.update(stages)
      .set({ status: "drafting" })
      .where(eq(stages.id, firstStage?.id ?? 0))
      .run();
    const started = await commissioner
      .patch(base)
      .send({ joiningOpen: true })
      .expect(400);
    expect(started.body.error).toBe("Draft started");
  });
});
