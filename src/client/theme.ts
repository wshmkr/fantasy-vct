import { type CSSObject, createTheme } from "@mui/material/styles";
import type { CSSProperties } from "react";
import tokens from "../../docs/design-system/tokens.json";

type TextVariant =
  | "display"
  | "heading"
  | "body"
  | "bodyStrong"
  | "label"
  | "score"
  | "stat";
type TextVariantStyles = Record<TextVariant, CSSProperties>;

declare module "@mui/material/styles" {
  interface TypographyVariants extends TextVariantStyles {}
  interface TypographyVariantsOptions extends Partial<TextVariantStyles> {}
}

declare module "@mui/material/Typography" {
  interface TypographyPropsVariantOverrides extends Record<TextVariant, true> {}
}

function lookup<T>(values: Map<string, T>, name: string): T {
  const value = values.get(name);
  if (value === undefined) throw new Error(`Unknown design token: ${name}`);
  return value;
}

const tokenValues = new Map(
  [
    tokens.color,
    tokens.spacing,
    tokens.radius,
    tokens.shadow,
    tokens.blur,
    tokens.glass,
  ].flatMap((group) => group.tokens.map(({ name, value }) => [name, value])),
);
const token = (name: string) => lookup(tokenValues, name);

// @fontsource-variable registers the self-hosted fonts under these names.
const fontFamilies = {
  sans: `"Geist Variable", ${tokens.type.families.sans}`,
  mono: `"Geist Mono Variable", ${tokens.type.families.mono}`,
};

const textStyles = new Map(
  tokens.type.groups.flatMap((group) =>
    group.styles.map((style): [string, CSSProperties] => [
      style.name,
      {
        fontFamily:
          group.family === "mono" ? fontFamilies.mono : fontFamilies.sans,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
        ...(group.family === "mono" && { fontVariantNumeric: "tabular-nums" }),
      },
    ]),
  ),
);
const textStyle = (name: string) => lookup(textStyles, name);

// PLAN §5.1 sets body text to 14px, denser than the token's 15px.
const denseBody = { fontSize: "14px", lineHeight: "20px" };
const bodyStyle = { ...textStyle("body"), ...denseBody };

const grainImage = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

export const grainLayer: CSSObject = {
  content: '""',
  position: "absolute",
  inset: 0,
  backgroundImage: grainImage,
  opacity: "var(--grain-opacity)",
  pointerEvents: "none",
};

const glassBackdrop = (blurToken: string) =>
  `blur(var(--${blurToken})) saturate(140%)`;

const paneRecipe: CSSObject = {
  position: "relative",
  isolation: "isolate",
  backgroundColor: "var(--pane)",
  backgroundImage: "none",
  backdropFilter: glassBackdrop("blur-md"),
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-pane)",
  // A translucent fill can't use the padding-box/border-box trick, so the gradient rim is a masked 1px ring.
  "&::before": {
    content: '""',
    position: "absolute",
    inset: 0,
    borderRadius: "inherit",
    padding: "1px",
    background:
      "linear-gradient(135deg, var(--pane-highlight), var(--pane-edge) 40%, transparent 75%)",
    WebkitMask:
      "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
    WebkitMaskComposite: "xor",
    mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
    maskComposite: "exclude",
    pointerEvents: "none",
  },
  // z-index -1 inside the isolated pane keeps the grain above the fill but under the content.
  "&::after": { ...grainLayer, zIndex: -1, borderRadius: "inherit" },
};

const floatingPaneRecipe: CSSObject = {
  backdropFilter: glassBackdrop("blur-lg"),
  borderRadius: "var(--radius-xl)",
};

const tokenCssVariables = {
  ...Object.fromEntries(
    [...tokenValues].map(([name, value]) => [`--${name}`, value]),
  ),
  "--font-sans": fontFamilies.sans,
  "--font-mono": fontFamilies.mono,
};

const textVariants: TextVariantStyles = {
  display: textStyle("display"),
  heading: textStyle("heading"),
  body: bodyStyle,
  bodyStrong: { ...textStyle("body-strong"), ...denseBody },
  label: textStyle("label"),
  score: textStyle("score"),
  stat: textStyle("stat"),
};

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: token("accent"), contrastText: token("on-accent") },
    error: { main: token("loss") },
    background: { default: token("bg"), paper: token("pane") },
    text: { primary: token("ink"), secondary: token("ink-muted") },
    divider: token("pane-edge"),
  },
  shape: { borderRadius: Number.parseInt(token("radius-md"), 10) },
  typography: {
    fontFamily: fontFamilies.sans,
    fontSize: 14,
    body1: bodyStyle,
    ...textVariants,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ":root": { ...tokenCssVariables, colorScheme: "dark" },
        ":focus-visible": {
          outline: "2px solid var(--accent)",
          outlineOffset: "2px",
        },
        "@media (prefers-reduced-motion: reduce)": {
          "*, *::before, *::after": {
            animationDuration: "0.01ms !important",
            animationIterationCount: "1 !important",
            transitionDuration: "0.01ms !important",
            scrollBehavior: "auto !important",
          },
        },
      },
    },
    MuiTypography: {
      defaultProps: {
        variantMapping: {
          display: "h1",
          heading: "h2",
          body: "p",
          bodyStrong: "span",
          label: "span",
          score: "span",
          stat: "span",
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: paneRecipe },
    },
    MuiDialog: { styleOverrides: { paper: floatingPaneRecipe } },
    MuiPopover: { styleOverrides: { paper: floatingPaneRecipe } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: "var(--radius-md)",
          fontWeight: 600,
          textTransform: "none",
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          height: 44,
          padding: "0 12px",
          fontSize: 15,
          borderRadius: "var(--radius-md)",
          backgroundColor: "#0f0f12",
          boxShadow: "inset 0 0 0 1px var(--line)",
          "&.Mui-focused": { boxShadow: "inset 0 0 0 1px var(--accent)" },
          "&.Mui-error": { boxShadow: "inset 0 0 0 1px var(--loss)" },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { ...textStyle("label"), borderRadius: "var(--radius-full)" },
      },
    },
  },
});

export default theme;
