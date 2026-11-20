import { and, eq, inArray, ne } from "drizzle-orm";
import type { PickableKind } from "../shared/entities.js";
import { db as appDb, type Db } from "./db/client.js";
import { pickables, tournamentTeams } from "./db/schema.js";
import { HttpError } from "./error-handler.js";
import { type Downloader, vlrDownloader } from "./vlr/fetch.js";
import {
  reseedSetupPools,
  savePerson,
  scrapePerson,
  type Transaction,
} from "./vlr/import.js";

interface RosterOptions {
  db?: Db;
  download?: Downloader;
}

// Rosters are shared by every tournament a team plays in, so all of their setup pools follow.
function reseedPoolsOfTeams(tx: Transaction, teamIds: number[]) {
  const tournamentRows = tx
    .selectDistinct({ tournamentId: tournamentTeams.tournamentId })
    .from(tournamentTeams)
    .where(inArray(tournamentTeams.teamId, teamIds))
    .all();
  for (const { tournamentId } of tournamentRows) {
    reseedSetupPools(tx, tournamentId);
  }
}

export async function addToRoster(
  teamId: number,
  person: { vlrId: string; vlrUrl: string },
  kind: PickableKind,
  { db = appDb, download = vlrDownloader }: RosterOptions = {},
): Promise<void> {
  const scraped = await scrapePerson(
    { db, download, refresh: true },
    person,
    kind,
  ).catch((error: unknown) => {
    console.error(error);
    throw new HttpError(502, "Couldn't read that VLR page");
  });
  db.transaction((tx) => {
    const previousTeamId = tx
      .select({ teamId: pickables.teamId })
      .from(pickables)
      .where(eq(pickables.vlrId, person.vlrId))
      .get()?.teamId;
    const pickableId = savePerson(tx, teamId, kind, scraped, {
      setManually: true,
    });
    if (kind === "coach") {
      tx.update(pickables)
        .set({ onRoster: false, rosterSetManually: true })
        .where(
          and(
            eq(pickables.teamId, teamId),
            eq(pickables.kind, "coach"),
            ne(pickables.id, pickableId),
          ),
        )
        .run();
    }
    reseedPoolsOfTeams(
      tx,
      previousTeamId === undefined ? [teamId] : [teamId, previousTeamId],
    );
  });
}

export function removeFromRoster(
  teamId: number,
  pickableId: number,
  { db = appDb }: RosterOptions = {},
): void {
  db.transaction((tx) => {
    const removed = tx
      .update(pickables)
      .set({ onRoster: false, rosterSetManually: true })
      .where(and(eq(pickables.id, pickableId), eq(pickables.teamId, teamId)))
      .returning({ id: pickables.id })
      .get();
    if (!removed) throw new HttpError(404, "Not on this team");
    reseedPoolsOfTeams(tx, [teamId]);
  });
}
