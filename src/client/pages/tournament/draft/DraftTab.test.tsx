// @vitest-environment jsdom

import type {
  DraftSeat,
  DraftState,
  PoolPickable,
  Tournament,
} from "@shared/entities";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { makeUser, renderApp, stubApi } from "../../../test-utils";

const me = makeUser({ id: 1 });
const rival = makeUser({ id: 2, discordUsername: "amyy", displayName: "Amy" });

const tournament: Tournament = {
  id: 7,
  name: "Challengers NA",
  vlrEventUrl: "https://www.vlr.gg/event/1/x",
  logoImageId: null,
  joiningOpen: false,
  discordChannelId: null,
  status: "drafting",
  stages: [
    {
      id: 3,
      tournamentId: 7,
      name: "Stage 1",
      position: 0,
      status: "drafting",
      pickSeconds: 90,
      matchCount: 24,
      poolSize: 8,
    },
  ],
  members: [],
  leaders: [],
  teamCount: 1,
  matchesPlayed: 0,
  matchesTotal: 24,
};

function pickable(
  id: number,
  handle: string,
  overrides: Partial<PoolPickable> = {},
): PoolPickable {
  return {
    id,
    kind: "player",
    handle,
    teamId: 1,
    isPlaceholder: false,
    vlrUrl: null,
    photoImageId: 1,
    topAgents: [],
    formRating: 1,
    formAcs: 200,
    formKd: 1,
    formRounds: 100,
    points: null,
    ownerUserId: null,
    ...overrides,
  };
}

const seat = (
  user: typeof me,
  seatNo: number,
  overrides: Partial<DraftSeat> = {},
): DraftSeat => ({
  seat: seatNo,
  user,
  color: seatNo === 0 ? "manager-blue" : "manager-rose",
  locked: false,
  rosterPickableIds: [],
  ...overrides,
});

function draftState(overrides: Partial<DraftState>): DraftState {
  return {
    stageId: 3,
    status: "drafting",
    phase: "draft",
    round: 0,
    turnNo: 0,
    pickSeconds: 90,
    seats: [seat(me, 0), seat(rival, 1)],
    pool: [pickable(11, "zekken"), pickable(12, "johnqt")],
    teams: [{ id: 1, name: "Sentinels", logoImageId: null }],
    currentSeat: 0,
    turnDeadline: "2026-01-01T00:01:00.000Z",
    serverNow: "2026-01-01T00:00:00.000Z",
    recentActions: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "EventSource",
    class {
      addEventListener() {}
      close() {}
    },
  );
});

function renderDraft(draft: DraftState, onAction: (body: unknown) => void) {
  stubApi({
    "GET /api/me": () => ({ status: 200, body: me }),
    "GET /api/tournaments/7": () => ({ status: 200, body: tournament }),
    "GET /api/stages/3/draft": () => ({ status: 200, body: draft }),
    "POST /api/stages/3/draft/actions": (body) => {
      onAction(body);
      return { status: 204 };
    },
  });
  renderApp("/tournaments/7/draft");
}

test("on my turn a selected pool row offers Pick", async () => {
  let sent: unknown;
  renderDraft(draftState({}), (body) => {
    sent = body;
  });

  await userEvent.click(await screen.findByRole("option", { name: "zekken" }));
  await userEvent.click(screen.getByRole("button", { name: "Pick" }));

  await waitFor(() => expect(sent).toEqual({ action: "pick", pickableId: 11 }));
});

test("rows stay read-only when it is someone else's turn", async () => {
  renderDraft(draftState({ currentSeat: 1 }), () => {});

  await userEvent.click(await screen.findByRole("option", { name: "zekken" }));

  expect(screen.queryByRole("button", { name: "Pick" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Lock" })).toBeNull();
});

test("a full roster can lock out of turn in the swap phase", async () => {
  let sent: unknown;
  const roster = [21, 22, 23, 24, 25, 26];
  renderDraft(
    draftState({
      phase: "swap",
      round: 6,
      currentSeat: 1,
      seats: [seat(me, 0, { rosterPickableIds: roster }), seat(rival, 1)],
      pool: roster.map((id) =>
        pickable(id, `p${id}`, {
          ownerUserId: me.id,
          kind: id === 26 ? "coach" : "player",
        }),
      ),
    }),
    (body) => {
      sent = body;
    },
  );

  await userEvent.click(await screen.findByRole("button", { name: "Lock" }));

  await waitFor(() => expect(sent).toEqual({ action: "lock" }));
});

test("the pool sorts by PTS once points exist, and the header flips it", async () => {
  renderDraft(
    draftState({
      pool: [
        pickable(11, "zekken", { points: 120 }),
        pickable(12, "johnqt", { points: -15 }),
        pickable(13, "Ethan", { points: 310 }),
      ],
    }),
    () => {},
  );
  const poolOrder = () =>
    screen
      .getAllByRole("option")
      .map((option) => option.getAttribute("aria-label"));

  await screen.findByRole("option", { name: "zekken" });
  expect(poolOrder()).toEqual(["Ethan", "zekken", "johnqt"]);
  expect(screen.getByText("−15")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /PTS/ }));
  expect(poolOrder()).toEqual(["johnqt", "zekken", "Ethan"]);
});
