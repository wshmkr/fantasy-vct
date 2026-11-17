// @vitest-environment jsdom

import { ThemeProvider } from "@mui/material/styles";
import { APP_PRODUCT_NAME } from "@shared/branding";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test } from "vitest";
import App from "./App";
import theme from "./theme";

describe("App", () => {
  test("renders the app title with the theme", () => {
    render(
      <ThemeProvider theme={theme}>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </ThemeProvider>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: APP_PRODUCT_NAME }),
    ).toBeInTheDocument();
  });
});
