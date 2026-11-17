import { describe, expect, test } from "vitest";
import type { User } from "../../shared/entities.js";
import { insertUser, loginAs } from "../test-utils.js";

async function loginAsNew(
  discordUsername: string,
  role: "commissioner" | "member",
) {
  const user = insertUser(discordUsername, role);
  return { agent: await loginAs(user.id), user };
}

describe("members API", () => {
  test("members get 403 on every members route", async () => {
    const { agent } = await loginAsNew("plainmember", "member");
    await agent.get("/api/members").expect(403);
    await agent.post("/api/members").send({ discordUsername: "x" }).expect(403);
    await agent.delete("/api/members/1").expect(403);
  });

  test("the commissioner adds, removes and restores a member", async () => {
    const { agent, user: commissioner } = await loginAsNew(
      "commish",
      "commissioner",
    );

    const added = await agent
      .post("/api/members")
      .send({ discordUsername: " @NewFriend " })
      .expect(201);
    expect(added.body).toMatchObject({
      discordUsername: "newfriend",
      role: "member",
      firstLoginAt: null,
    });

    const duplicate = await agent
      .post("/api/members")
      .send({ discordUsername: "newfriend" })
      .expect(409);
    expect(duplicate.body.error).toBe("Already added");

    await agent.delete(`/api/members/${added.body.id}`).expect(204);
    const listed = await agent.get("/api/members").expect(200);
    expect(listed.body.map((u: User) => u.discordUsername)).not.toContain(
      "newfriend",
    );

    const restored = await agent
      .post("/api/members")
      .send({ discordUsername: "newfriend" })
      .expect(201);
    expect(restored.body.id).toBe(added.body.id);

    await agent.delete(`/api/members/${commissioner.id}`).expect(404);
  });
});
