import { env } from "../env.js";

const DISCORD_API_URL = "https://discord.com/api/v10";

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  url?: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
}

export interface DiscordMessage {
  content: string;
  embeds: DiscordEmbed[];
  allowed_mentions: { roles: string[] };
}

export function isDiscordBotConfigured(): boolean {
  return env.DISCORD_BOT_TOKEN !== undefined;
}

async function discordRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  if (!env.DISCORD_BOT_TOKEN) throw new Error("DISCORD_BOT_TOKEN isn't set");
  const response = await fetch(`${DISCORD_API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `Discord ${method} ${path}: ${response.status} ${await response.text()}`,
    );
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export const discord = {
  async guildIdOfChannel(channelId: string): Promise<string> {
    const channel = await discordRequest<{ guild_id?: string }>(
      "GET",
      `/channels/${channelId}`,
    );
    if (!channel.guild_id) throw new Error("That channel isn't in a server");
    return channel.guild_id;
  },
  async createRole(guildId: string, name: string): Promise<string> {
    const role = await discordRequest<{ id: string }>(
      "POST",
      `/guilds/${guildId}/roles`,
      { name, mentionable: true },
    );
    return role.id;
  },
  async addMemberRole(guildId: string, discordUserId: string, roleId: string) {
    await discordRequest<void>(
      "PUT",
      `/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
    );
  },
  async removeMemberRole(
    guildId: string,
    discordUserId: string,
    roleId: string,
  ) {
    await discordRequest<void>(
      "DELETE",
      `/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
    );
  },
  async postMessage(channelId: string, message: DiscordMessage) {
    await discordRequest<unknown>(
      "POST",
      `/channels/${channelId}/messages`,
      message,
    );
  },
};
