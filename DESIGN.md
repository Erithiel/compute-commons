---
name: Compute Commons
description: A shared task list for a team's Claude; calm, legible, status at a glance.
colors:
  signal-violet: "oklch(0.5 0.17 288)"
  signal-violet-soft: "oklch(0.5 0.17 288 / 0.1)"
  signal-violet-dark: "oklch(0.76 0.12 288)"
  paper: "#fafaf9"
  panel: "#ffffff"
  sidebar: "#f3f2ef"
  ink: "#1c1917"
  muted: "#6f6964"
  line: "#e7e5e4"
  hover: "#f2f1ef"
  paper-dark: "#0f0d0c"
  panel-dark: "#1a1716"
  sidebar-dark: "#141211"
  ink-dark: "#f5f4f2"
  muted-dark: "#a8a29e"
  line-dark: "#2b2725"
  hover-dark: "#262220"
typography:
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.43
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    fontFeature: "tnum"
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.33
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
  button-secondary-hover:
    backgroundColor: "{colors.hover}"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.lg}"
    padding: "16px"
  badge:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  nav-item:
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  nav-item-active:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
---

# Design System: Compute Commons

## Overview

**Creative North Star: "The Shift Log"**

The app is the handover log between shifts of work. Claude runs after hours; people arrive in the morning and read what happened. Everything serves that read: warm paper surfaces, plain entries, a status on every line that can be taken in at a glance, and numbers that line up. Visits are short and task-shaped, so the interface stays out of the way and familiar controls behave exactly as expected.

Density is moderate and even: one sans family at small sizes, thin warm-grey borders, flat panels. Color is spent almost entirely on meaning. Status hues (free, in progress, done, failed, skipped) carry the board; the single accent, Signal Violet, only marks where you are, what is clickable and what has focus. Identity lives in small, precise details (the three-circles mark, themed focus rings and selection, tabular numerals) rather than in decoration.

Light and dark follow the system setting and are equal citizens; every token has a dark counterpart.

**Key Characteristics:**
- Warm stone neutrals, paper background, white panels, a slightly deeper sidebar layer.
- One accent (Signal Violet) for current place, links and focus only.
- Five fixed status hues as the main source of color.
- Geist at 12–20px, tight scale, semibold headings, tabular numerals everywhere.
- Flat surfaces with 1px borders; shadow only for the active nav pill and the login card.
- Plain and dependable controls: small radius, thin border, a 1px press.

## Colors

Restrained warm neutrals with one violet signal and a fixed status vocabulary.

### Primary
- **Signal Violet** (oklch(0.5 0.17 288); dark theme oklch(0.76 0.12 288)): links, the board's selected status filter ring, focus outlines, checkbox and radio fill, the caret, and the brand mark. Its soft 10–14% tint is the text-selection and input focus-ring color. Never used for fills of large areas or for status.

### Neutral
- **Paper** (#fafaf9 / dark #0f0d0c): page background behind content.
- **Panel** (#ffffff / dark #1a1716): cards, tables, inputs, secondary buttons, the active nav pill.
- **Sidebar Stone** (#f3f2ef / dark #141211): the second neutral layer for the sidebar, the account footer and the login backdrop.
- **Ink** (#1c1917 / dark #f5f4f2): body text and the primary button fill.
- **Muted Stone** (#6f6964 / dark #a8a29e): secondary text, labels, meta lines, table headers. Meets 4.5:1 on paper and panel.
- **Line** (#e7e5e4 / dark #2b2725): every border and divider.
- **Hover Stone** (#f2f1ef / dark #262220): hover fills, table header band, gray badges, code and prompt blocks.

### Status (semantic, fixed)
Tailwind's green, blue, red and amber at 15% fill with 700/800-weight text (400 in dark): **done** green, **in progress** blue, **failed** red, **skipped** amber, **free** gray (Hover Stone + Muted Stone). Amber also marks "lead only" and "mock data".

### Named Rules
**The Signal Rule.** Signal Violet means "you are here, this is clickable, this has focus". If an element is none of those, it is not violet.

**The Status Owns Color Rule.** Green, blue, red and amber are reserved for work state. Never use them for decoration or for the accent; a new state gets a new pairing, not a reused hue.

## Typography

**Body Font:** Geist (with ui-sans-serif, system-ui)
**Mono Font:** Geist Mono (with ui-monospace)

**Character:** One well-tuned sans carries everything from page titles to badges; mono appears only where the content is literally code or a prompt Claude will receive.

### Hierarchy
- **Headline** (600, 1.25rem, tracking -0.025em, balanced): page titles in the page header.
- **Title** (600, 0.875rem): card headers, the "Add a task" heading, task titles on the board.
- **Body** (400, 0.875rem, 1.43): table cells, row text, form values, paragraphs. Page subtitles cap at ~42rem.
- **Label** (500, 0.75rem): form labels, table headers, badges, meta lines ("Nino · scheduled · 17 Oct, 00:55").
- **Mono** (400, 0.75rem): prompts, team policy, the "What your Claude receives" preview, setup commands, audit action names.

### Named Rules
**The Ledger Numerals Rule.** Tabular numerals are on globally so times, counts and versions align in columns. Do not turn them off locally.

**The Mono Means Literal Rule.** Monospace is only for text that is copied to or read by Claude or a terminal. Never as a "technical" costume for labels.

## Layout

App shell: on md (768px) and up, a two-column grid with a 15rem sidebar (brand and status, then nav, account switcher pinned to the bottom) and a content column capped at max-w-5xl (64rem) with 32px padding. Below md, the sidebar becomes a sticky, slightly translucent top bar with the brand, a one-line status, and a horizontally scrollable nav; the account switcher moves below the page content.

Rhythm: 24px between cards and between the page header and content; 16px card padding; 8px inside groups; rows separated by 1px dividers at 10px vertical padding. Two-column detail pages (task page) split 3fr / 2fr from lg (1024px).

Tables keep their columns on desktop and either scroll horizontally with a minimum width (Tasks, 560px) or restack into a title + status line with a meta line underneath (Logs, board rows) on mobile.

## Elevation & Depth

Flat by default, depth through tonal layering: Sidebar Stone behind, Paper for the content field, Panel for cards. Borders, not shadows, separate surfaces.

### Shadow Vocabulary
- **Pill lift** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.06)` plus a 1px Line ring): the active nav item, so it reads as raised on the sidebar layer.
- **Card float** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.12)`): the login card only, alone on the backdrop.

### Named Rules
**The Flat Panel Rule.** Cards, tables and inputs carry no shadow. If something needs to stand out, change its layer or its border, not its elevation.

## Shapes

Gently rounded and consistent: 4px for badges and inline code, 6px for buttons, inputs, selects and nav items, 8px for cards, tables and the board filter area, 12px only for the login card. Borders are always 1px Line; empty states use a dashed 1px Line border. Icons are authored inline SVG at 14–16px with a 1.6 stroke and round caps.

## Components

### Buttons
Plain and dependable: they look like buttons, never wrap, and respond with a 1px press.
- **Shape:** gently rounded (6px).
- **Primary:** Ink fill, Paper text, 500 weight, 6px × 12px. One per form, for the commit action (Add, Save, Create task, Invite, Sign in). Hover drops to 85% opacity.
- **Secondary:** Panel fill, 1px Line border, 4px × 10px; hover fills Hover Stone. Used for Filter, Refresh, Revoke, Copy, Switch, Save note.
- **Text actions:** small Signal Violet text with underline on hover ("+ Add row", "Show prompt").
- **All:** 150ms transitions, `translate-y-px` on press, 50% opacity and no pointer events when disabled, Signal Violet focus outline (2px, offset 2px).

### Badges
- **Style:** 12px label weight, 2px × 6px, 4px radius, status tint fill with matching text. Never wrap.
- **State:** on the board the status counts are links that filter; the active one gets a 2px Signal Violet ring, hover a 2px Line ring.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** Panel on Paper.
- **Shadow Strategy:** none (see Flat Panel Rule).
- **Border:** 1px Line; header separated by a 1px Line divider.
- **Internal Padding:** 16px body; header 16px × 10px with title left and meta or actions right, wrapping on narrow widths.

### Inputs / Fields
- **Style:** Panel fill, 1px Line border, 6px radius, 6px × 10px, 14px text; placeholder in Muted Stone at 80%.
- **Focus:** border turns Signal Violet with a 3px Signal Violet soft ring.
- **Disabled:** Hover Stone fill, Muted Stone text (member view of lead-only forms).
- **Sizing:** the base control has no width; full-width is opt-in. Filters and selects size to their content.

### Navigation
- **Desktop:** vertical list in the sidebar, 14px, Muted Stone text; hover fills Hover Stone and darkens to Ink; the current page is a Panel pill with Pill lift and 500 weight, marked `aria-current="page"`.
- **Mobile:** the same items in one horizontal, scrollable row under the brand, scrollbar hidden.

### Log Row (signature)
An expandable `details` row: finished time, who (with "scheduled" tag), task · row · one-line summary, result badge, duration, and a chevron that rotates 90° when open. The opened panel sits on a Hover Stone tint with the full summary, Claude's details in mono, and a link back to the task.

## Do's and Don'ts

### Do:
- **Do** keep Signal Violet to links, current place, selection and focus (The Signal Rule).
- **Do** give every unit of work a status badge using the fixed five-state palette.
- **Do** use the width-free control and opt into full width, so filters and small inputs size themselves.
- **Do** restack tables into title + status + meta lines below 768px instead of squeezing columns.
- **Do** give every empty list a plain sentence and a way out ("Nothing matches these filters. Show everything").
- **Do** check both light and dark themes; every surface token has a dark pair.

### Don't:
- **Don't** add shadows to cards, tables or inputs (The Flat Panel Rule).
- **Don't** use status hues for decoration or the accent for status.
- **Don't** use monospace outside prompts, policy, commands and code.
- **Don't** add mission or "commons" messaging to team-mode screens.
- **Don't** add claim, complete or release buttons; work state is read-only in the web app.
- **Don't** use Unicode glyphs or emoji as icons; draw them as inline SVG at the 1.6 stroke.
