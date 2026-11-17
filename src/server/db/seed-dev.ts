import { db } from "./client.js";
import { users } from "./schema.js";

const DEV_USERS = [
  { discordUsername: "stephen", displayName: "Stephen", role: "commissioner" },
  { discordUsername: "jackey", displayName: "Jackey", role: "member" },
  { discordUsername: "amyy", displayName: "Amy", role: "member" },
  { discordUsername: "will.gg", displayName: "Will", role: "member" },
  { discordUsername: "jamesk", displayName: "James", role: "member" },
  { discordUsername: "terrance_", displayName: "Terrance", role: "member" },
  { discordUsername: "priya", displayName: "Priya", role: "member" },
  { discordUsername: "marco", displayName: "Marco", role: "member" },
] as const;

for (const user of DEV_USERS) {
  db.insert(users)
    .values(user)
    .onConflictDoUpdate({
      target: users.discordUsername,
      set: { displayName: user.displayName, role: user.role, removedAt: null },
    })
    .run();
}

console.log(`Seeded ${DEV_USERS.length} dev users`);
db.$client.close();
