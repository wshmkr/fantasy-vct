import request from "supertest";
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
