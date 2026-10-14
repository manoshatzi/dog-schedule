# Mockups

Phone mockups (390×844) exported from the Claude design canvas
[Dog Schedule](https://claude.ai/artifact/AUropkEjuyeyqFhs99kk3H) on 2026-10-13.
The canvas is the editable source; these files are a snapshot. `canvas.json` is
the canvas index (artboard positions and titles).

The `.dc.html` files need the canvas runtime (`support.js`) to render, so open
the canvas link to view them. Read them here for exact copy, spacing and colors.

| File | Screen | Code today |
|---|---|---|
| `Main.dc.html` | Today: progress, timeline with a "now" line, done / booked / open rows | `src/app/(tabs)/index.tsx`, `src/components/today-list.tsx` |
| `Book.dc.html` | Book a task: who's doing it, repeat, reminder | `src/app/book-task.tsx`, `src/components/book-task-screen.tsx` |
| `Needs.dc.html` | Daily needs: dog card plus the list of recurring needs | `src/app/(tabs)/needs.tsx`, `src/components/daily-needs-screen.tsx` |
| `Week.dc.html` | Week overview | `src/app/(tabs)/week.tsx`, `src/components/week-screen.tsx` |
| `AddNeed.dc.html` | Add a need (sheet): type, name, time, amount, repeat days, "must do", notes | form inside `src/components/daily-needs-screen.tsx` |

## Visual language

- **Fonts:** Bricolage Grotesque (headings, 600/700), DM Sans (body, 400–600).
- **Colors:**

  | Role | Hex |
  |---|---|
  | Ground | `#F4F5F1` |
  | Surface | `#FFFFFF` |
  | Text | `#1C2321` |
  | Muted text | `#5A635F` |
  | Primary green | `#2F6B4F` |
  | Open or unbooked (orange) | `#D9822B` border, `#FFF6EA` fill, `#8A4510` text |
  | "Now" line | `#B8452A` |
  | "Must" badge | `#F8DDD5` fill, `#8F2F1A` text |
  | Done row | `#E9EDE6` |

- **Shape:** 14–18px card radius, 44px minimum touch targets, a 3-tab bar (Today / Week / Needs).

## Known inconsistencies

- `AddNeed` names the dog "Summer"; the other screens use "Luna".
- `Needs` shows the dog card with `[Breed] · [Age] · [Weight]` placeholders. The MVP
  dog profile is name, photo and birthday (see `docs/business/mvp-scope.md`).
- Missing from the mockups (new in the MVP): onboarding, invite, history,
  settings, dog profile editing.
