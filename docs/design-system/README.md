Fantasy VCT is a private fantasy league for a group of friends who follow pro Valorant. It looks like a modern creator dashboard:
- near-black, with two faint glows (warm top-left, orange bottom-right)
- liquid-glass panes
- **orange as the one strong brand color**, used with conviction on buttons, badges, progress bars and whoever is on the clock

It's dark only and desktop only.

## Show, don't tell

- **Use as little text as possible.** Faces, logos, color, icons and numbers carry the meaning.
- **Never write** instructional sentences, helper paragraphs, descriptions under headings or empty-state sentences. An empty state is the empty shape: outlined cells, a dimmed card.
- **Icon buttons** get a tooltip and an `aria-label`, not a visible label.
- **Errors** are at most three words ("Not your turn", "Already taken"), with a shake and a `loss` outline.
- **Teams** are logo plus name. There are no team tags.
- **Coaches** carry a small badge right after their name (never pushed to the far edge), holding the Lucide `graduation-cap` icon. Placeholder coaches are named "`<Team>` Coach", for example "Sentinels Coach".
- **Icons:** [Lucide](https://lucide.dev) only (`lucide-react`), at the default 2px stroke. Lucide has no brand logos, so the Discord login button uses `log-in`.
- **Points** are signed: `+15`, `−5`. No emoji.

## Layout

- **There's no sidebar and no top bar.** Every page has only the site logo (an orange rounded-square mark plus "Fantasy VCT" in `heading`) at its top-left, linking home.
- **Two places:**
  - **Home:** a `display` title, the primary action (an `accent` button) on the same row, and one grid of tournament cards, 4 per row. There are no Active/Ended sections; live and drafting tournaments sort first.
  - **Tournament page:** a header (event logo, name, status badge, a matches pill, the manager avatar stack) and tabs (Rosters, Draft, Teams, Settings).
- **Content is top-aligned** in a centered column of about 1320px max. Never vertically center page content; only dialogs are centered.
- **Dense, but not cramped.** Fit a lot on screen (8 managers, 16 teams) by using more columns, not by shrinking spacing. Use:
  - 16px pane padding
  - 16–18px grid gaps
  - 40–42px list rows
  - 14px body text
- **Tournament card:**
  - **Header image:** the event logo centered on a blurred, darkened enlargement of itself.
  - **Status badge** top-right, a `radius-full` pill in `label`:
    - Drafting and Live: `accent` fill with `on-accent` text
    - Upcoming and Ended: `neutral-badge` fill with `ink` text
  - **Below the image:**
    - the name in `heading` and the stage chips
    - stat chips: teams, the joined managers' avatar stack with `joined/8`, matches played/total
    - a thin `accent` progress bar of matches played ÷ total
    - a full-width **Join** button (`accent`, `user-plus` icon) while joining is open

## Glass

- **The background** is `bg` with exactly two faint glows, both fixed to the viewport so panes scrolling over them pick up color:
  - `bg-glow-tl`: a very large, soft radial from the top-left
  - `bg-glow-br`: a very large, soft radial from the bottom-right

  Nothing else decorates the page.
- **A pane** (the liquid-glass recipe):
  - **Fill:** `pane`, with `backdrop-filter: blur(var(--blur-md)) saturate(140%)`.
  - **Rim light:** a 1px **gradient border** from `pane-highlight` at the top-left, through `pane-edge`, to transparent at the bottom-right. Draw it with a `::before` pseudo-element: `padding: 1px`, a `linear-gradient(135deg, …)` background, and `mask-composite: exclude`. A translucent fill can't use the padding-box/border-box background trick.
  - **Top highlight:** a 1px inset line of `pane-highlight` along the top edge (part of `shadow-pane`).
  - **Depth:** `shadow-pane`, with corners at `radius-lg`.
- **Dialogs and menus** use the same recipe with `blur-lg` and `radius-xl`.
- **Grain:** every pane, and the background, carries a tiled SVG fractal-noise overlay at `grain-opacity`. It removes gradient banding and makes the glass feel frosted rather than flat.
- **Glass where it reads, density where it's read:**
  - navigation chrome, cards, dialogs and the on-the-clock bar use `pane`
  - dense data (the draft pool table, stat tables, the Members list) uses `pane-dense`, so small text stays crisp over the glows
- **Give the glass something to show.** The glows sit behind the content column, and tournament card headers use the event logo enlarged and blurred. Glass over flat black just looks gray.

### Liquid lenses (the signature detail)

Real refraction, used sparingly and only on small, moving selection indicators. Never on panes full of text.

- **Where:**
  - the selected pill in every segmented control: the tournament tabs, the stage chips, and the players/coaches toggle
  - the on-the-clock badge in the draft room
- **How:**
  - **Refraction:** an SVG filter applied as `backdrop-filter: url(#lens) blur(2px) saturate(160%)`. Its `feDisplacementMap` reads a displacement map generated in JS for the lens's size. The map comes from a convex-squircle bezel `lens-bezel` wide (Snell's law, n = 1.5), and it only needs one quadrant computed and mirrored.
  - **Strength:** the filter's `scale` is `lens-scale`.
  - **Color fringe:** a faint chromatic fringe at `lens-chroma`.
  - **Rim light:** a specular rim from `lens-specular-angle` at `lens-specular-opacity`, blended over the result with `feBlend`.
- **Motion:**
  - when the selection changes, the lens slides to the new item on a spring (stiffness ~400, damping ~30) and squishes slightly along its direction of travel
  - the displacement map is rebuilt only when the lens's size changes, never while it moves
- **Fallback:** SVG filters inside `backdrop-filter` only work in Chromium. Feature-detect for them. Everywhere else, and under `prefers-reduced-transparency`, the lens is a plain `pane-hover` pill with the same rim light and the same spring.
- **Nesting:** panes can sit on panes once, at most. A draft cell inside a panel is fine; a chip inside that cell isn't a pane.

## Color

- **`accent` (orange)** is the brand: primary buttons (`on-accent` text, never white), the active nav icon, Live and Drafting badges, progress bars, the focus ring, and the on-the-clock state (`accent-soft` fill plus `shadow-glow`).
- **Orange text** uses `accent-text`.
- **Everything else** is `ink`, `ink-muted`, `line` and panes.
- **`loss`** is for negative numbers and errors only. Positive numbers stay `ink`.
- **Manager colors** (`manager-*`, 16 muted tones in one family) identify people.
  - Where they show: the avatar ring, plus a 1px rim and a faint tint (about 16%) on that manager's draft cells and roster card.
  - Never a solid fill behind text, and never on UI chrome, where they would compete with the orange.
- **The color picker** is a 4×4 grid of swatch circles. Taken colors are dimmed and disabled, and there are no labels.

## People and teams

- **Player photo:**
  - a circle with the **team logo always overlaid at its bottom-right**: a badge about 40% of the photo's size, on a small `bg` disc with a `pane-edge` ring so it reads on any photo
  - without a photo of their own, use **VLR's default player picture**, never initials or a team logo
  - sizes: 26px in draft cells, 28px in the draft pool, 30px on Teams and Rosters
- **Player chip:**
  - the photo and the handle in `body-strong`
  - the **top 3 agents** (small agent icons in usage order) appear only in the draft pool
  - the chip links to the player's **VLR page**, opening in a new tab. Where clicking the chip already does something (the draft pool), show a small external-link icon on hover instead.
- **Coach chip:**
  - the same photo treatment, with the `graduation-cap` badge right after the handle, and no agents
  - placeholder coaches ("Sentinels Coach") use VLR's default picture with the team logo overlaid, and have no link
- **Manager:** the avatar (Discord picture) with a 2px ring in their manager color. Their name appears only where a face alone is ambiguous.
- **Stats** are in `stat` (mono), right-aligned in tables, with sortable column headers in `label`.

## Type

- **Fonts:** Geist for everything, and Geist Mono for numbers. Load `Geist:wght@400;500;600` and `Geist+Mono:wght@500;600` from Google Fonts.
- **Text styles:**
  - `display` for the page title
  - `heading` for card titles
  - `body-strong` for handles and nav
  - `body` for team names
  - `label` for badges, chips and headers
- **Number styles:** `score` and `stat` for numbers, always tabular.

## Shape and space

- **Radius:**
  - `radius-sm` for chips, inputs and draft cells
  - `radius-md` for buttons and nav items
  - `radius-lg` for cards and panels
  - `radius-xl` for dialogs
  - `radius-full` for badges, avatars and swatches
- **Spacing:** card padding `space-4`, grid gaps `space-3`, sections `space-5`.

## Motion

- 150–200ms ease-out on hover and press. Hovering a card lifts it 2px and brightens it to `pane-hover`.
- A new draft pick fades and rises into its cell.
- The on-the-clock glow breathes slowly, and pulses during the last 10 seconds.
- Respect `prefers-reduced-motion`.

## In the app (MUI)

- **Palette:**

  | MUI | Token |
  |---|---|
  | `mode` | `dark` |
  | `primary.main` | `accent` |
  | `primary.contrastText` | `on-accent` |
  | `error` | `loss` |
  | `background.default` | `bg` |
  | `background.paper` | `pane` |
  | `text.primary` | `ink` |
  | `text.secondary` | `ink-muted` |
  | `divider` | `pane-edge` |

- **Shape:** `shape.borderRadius` = `radius-md`.
- **Component overrides:**
  - `MuiPaper` and `MuiCard` use the pane recipe.
  - `MuiButton` uses `radius-md`, weight 600, and no uppercase.
  - `MuiChip` is a `radius-full` badge.
- **Typography:** set `fontFamily` to the sans family, and use `fontVariantNumeric: 'tabular-nums'` on numeric styles.

## Logo

There's no logo yet. Set "Fantasy VCT" in `heading` next to a small orange rounded-square mark. Don't use Riot or Valorant marks, colors or fonts.
