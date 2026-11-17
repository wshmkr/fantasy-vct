import { ThemeProvider } from "@mui/material/styles";
import type { User } from "@shared/entities";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, vi } from "vitest";
import App from "./App";
import theme from "./theme";

// Vitest runs without globals, so RTL can't register its own cleanup.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type ApiHandler = (body: unknown) => { status: number; body?: unknown };

type MethodAndPath = `${string} /${string}`;

export function stubApi(handlers: Record<MethodAndPath, ApiHandler>) {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const handler =
      handlers[`${init?.method ?? "GET"} ${path}` as MethodAndPath];
    const requestBody = init?.body ? JSON.parse(String(init.body)) : undefined;
    const { status, body } = handler?.(requestBody) ?? { status: 404 };
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function renderApp(route: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <MemoryRouter initialEntries={[route]}>
          <App />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    role: "member",
    discordUsername: "stephen",
    displayName: "Stephen",
    avatarUrl: null,
    firstLoginAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
