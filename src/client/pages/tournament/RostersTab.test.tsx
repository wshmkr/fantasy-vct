// @vitest-environment jsdom

import type {
  ManagerStanding,
  StandingsPick,
  StandingsResponse,
} from "@shared/api";
import type { Tournament } from "@shared/entities";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { makeUser, renderApp, stubApi } from "../../test-utils";

const me = makeUser({ id: 1 });
const rival = makeUser({ id: 2, discordUsername: "amyy", displayName: "Amy" });

const stage = {
  tournamentId: 7,
  status: "complete" as const,
  pickSeconds: 90,
  matchCount: 24,
  poolSize: 8,
};
const tournament: Tournament = {
  id: 7,
  name: "Challengers NA",
  vlrEventUrl: "https://www.vlr.gg/event/1/x",
  logoImageId: null,
  joiningOpen: false,
  discordChannelId: null,
  status: "live",
  stages: [
    { ...stage, id: 3, name: "Stage 1", position: 0 },
    { ...stage, id: 4, name: "Playoffs", position: 1, status: "setup" },
  ],
  members: [
    { user: me, color: "manager-blue" },
    { user: rival, color: "manager-rose" },
  ],
  leaders: [],
  teamCount: 1,
  matchesPlayed: 0,
  matchesTotal: 24,
};

function pick(id: number, points: number | null): StandingsPick {
  return {
    pickable: {
      id,
      kind: id % 10 === 6 ? "coach" : "player",
      handle: `p${id}`,
      teamId: 1,
      isPlaceholder: false,
      vlrUrl: null,
      photoImageId: 1,
      topAgents: [],
      formRating: null,
      formAcs: null,
      formKd: null,
      formRounds: null,
    },
    teamLogoImageId: null,
    points,
  };
}

const rosterIds = (seat: number) =>
  [1, 2, 3, 4, 5, 6].map((n) => seat * 10 + n);

function standing(
  user: typeof me,
  color: ManagerStanding["color"],
  rank: number,
  stageRank: number,
  stagePoints: (id: number) => number | null,
): ManagerStanding {
  const picks = rosterIds(user.id).map((id) => pick(id, stagePoints(id)));
  const sum = picks.every(({ points }) => points === null)
    ? null
    : picks.reduce((total, { points }) => total + (points ?? 0), 0);
  return {
    user,
    color,
    rank,
    points: sum,
    locked: user.id === me.id,
    stages: [
      {
        stageId: 3,
        rank: stageRank,
        locked: user.id === me.id,
        points: sum,
        picks,
      },
      { stageId: 4, rank: stageRank, locked: false, points: null, picks: [] },
    ],
  };
}

function renderRosters(
  standings: StandingsResponse,
  shownTournament: Tournament = tournament,
) {
  const fetchMock = stubApi({
    "GET /api/me": () => ({ status: 200, body: me }),
    "GET /api/tournaments/7": () => ({ status: 200, body: shownTournament }),
    "GET /api/tournaments/7/standings": () => ({
      status: 200,
      body: standings,
    }),
    "GET /api/tournaments/7/teams": () => ({ status: 200, body: [] }),
  });
  renderApp("/tournaments/7/rosters");
  return fetchMock;
}

const cardOrder = () =>
  screen.getAllByRole("region").map((card) => card.getAttribute("aria-label"));

test("cards are ranked, Total shows stage subtotals and a stage shows each pick's points", async () => {
  renderRosters({
    managers: [
      standing(rival, "manager-rose", 1, 1, (id) => (id === 21 ? -12 : 100)),
      standing(me, "manager-blue", 2, 2, () => 50),
    ],
  });

  const totalRivalCard = await screen.findByRole("region", { name: "Amy" });
  expect(cardOrder()).toEqual(["Amy", "Stephen"]);
  expect(screen.getByRole("tab", { name: "Total" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(within(totalRivalCard).getByLabelText("Rank")).toHaveTextContent("1");
  expect(within(totalRivalCard).getAllByText("488")).toHaveLength(2);
  expect(within(totalRivalCard).getByLabelText("Playoffs")).toHaveTextContent(
    "–",
  );
  expect(within(totalRivalCard).queryByText("p21")).toBeNull();

  await userEvent.click(screen.getByRole("tab", { name: "Stage 1" }));
  const myCard = screen.getByRole("region", { name: "Stephen" });
  const rivalCard = screen.getByRole("region", { name: "Amy" });
  expect(within(myCard).getByText("300")).toBeInTheDocument();
  for (const id of rosterIds(me.id)) {
    expect(within(myCard).getByText(`p${id}`)).toBeInTheDocument();
  }
  expect(within(rivalCard).getByText("−12")).toBeInTheDocument();
  expect(within(myCard).getByRole("img", { name: "Locked" })).toBeTruthy();
  expect(within(rivalCard).queryByRole("img", { name: "Locked" })).toBeNull();
});

test("before any points the cards keep draft order and show dashes", async () => {
  renderRosters({
    managers: [
      standing(me, "manager-blue", 1, 1, () => null),
      standing(rival, "manager-rose", 2, 2, () => null),
    ],
  });

  const totalCard = await screen.findByRole("region", { name: "Stephen" });
  expect(cardOrder()).toEqual(["Stephen", "Amy"]);
  expect(within(totalCard).queryByLabelText("Rank")).toBeNull();

  await userEvent.click(screen.getByRole("tab", { name: "Stage 1" }));
  const stageCard = screen.getByRole("region", { name: "Stephen" });
  expect(within(stageCard).getAllByText("–")).toHaveLength(7);
});

test("during a draft, Rosters opens on that stage and refreshes on draft changes", async () => {
  const streams: { url: string; changed: () => void }[] = [];
  vi.stubGlobal(
    "EventSource",
    class {
      constructor(url: string) {
        streams.push({ url, changed: () => {} });
      }
      addEventListener(type: string, listener: () => void) {
        const stream = streams.at(-1);
        if (stream && type === "changed") stream.changed = listener;
      }
      close() {}
    },
  );
  const fetchMock = renderRosters(
    { managers: [standing(me, "manager-blue", 1, 1, () => null)] },
    {
      ...tournament,
      stages: tournament.stages.map((row) =>
        row.id === 4 ? { ...row, status: "drafting" } : row,
      ),
    },
  );
  await screen.findByRole("region", { name: "Stephen" });
  const standingsFetches = () =>
    fetchMock.mock.calls.filter(([path]) => String(path).endsWith("/standings"))
      .length;
  const before = standingsFetches();

  expect(screen.getByRole("tab", { name: "Playoffs" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(streams.map(({ url }) => url)).toEqual(["/api/stages/4/draft/stream"]);
  act(() => streams[0]?.changed());
  await waitFor(() => expect(standingsFetches()).toBe(before + 1));
});
