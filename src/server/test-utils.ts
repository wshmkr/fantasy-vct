import request from "supertest";
import type TestAgent from "supertest/lib/agent.js";
import { expect, vi } from "vitest";
import type { UserRole } from "../shared/entities.js";
import { createApp } from "./app.js";
import { db } from "./db/client.js";
import { users } from "./db/schema.js";

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
