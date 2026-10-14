# Screens (MVP)

Owner: designer · Draft v1 · 2026-10-13 · Flows: [user-flows.md](user-flows.md)

Status legend: **EXISTS** = ships as-is apart from i18n · **CHANGES** = exists, needs the listed changes · **NEW** = to build · **SLOT** = reserved for v1.1, not shown at MVP.

**Visual baseline:** [mockups/](mockups/README.md) (390×844 snapshots of the [design canvas](https://claude.ai/artifact/AUropkEjuyeyqFhs99kk3H)): `Main` (Today), `Book`, `Needs`, `Week`, `AddNeed`. Every EXISTS/CHANGES screen below cites its mockup. Every NEW screen needs a new mockup on the canvas in the same visual language (§4).

## 1. Terminology (recommendation)

Today the code and UI mix "daily needs", "need", "task", "book" and "household". The brief and marketing say "task", "claim" and "family". Recommendation:

| Concept | Current UI / code | **Recommended UI term** | Why |
|---|---|---|---|
| A recurring item (walk at 07:30) | "Daily need" (`daily_needs`) | **Task** | Matches brief, store copy and positioning. "Need" is vague and translates awkwardly into Greek. Keep `daily_needs` in code; no rename needed |
| The list of recurring tasks | "Needs" tab, "Daily needs" title (code and mockup `Needs`) | **Routine** tab | Describes the *set up once* nature, separate from Today. Only a label change on the mockups' 3-tab bar |
| Reserving a task before doing it | "Book", "Book a task", "You booked" | Concept: **claim**. Button: **I'll do it**. Status: **Claimed: Maria** | "Book" sounds like an appointment and reads as "book a walker". "I'll do it" is self-explaining in one tap. "Claim" stays the word for marketing and docs ("Claim → Done") |
| Undoing your own claim | "Cancel" | **Release** | "Cancel" is ambiguous (cancel the walk?) |
| Claiming for someone else | "Who's doing it" in Book screen | **Assign** (row label "Who's doing it") | Separate from self-claim |
| Taking someone's claim | not possible | **Take over** | New, with a confirm step |
| Household | "Household", "Shared household" | **Family** (Max's family) | Warmer, fits the "Pack"/«Οικογενειακό» premium framing. Works for flatmates too. Code stays `households` |
| Premium (v1.1) | n/a | **Pack** | Per `pricing.md` |

### Core EN / GR labels

Greek style: informal **εσύ**, sentence case. Avoid name + gendered article (write «Ανέλαβε: Μαρία», not «Η Μαρία ανέλαβε»). Greek ALL-CAPS must drop accents (ΤΡΙΤΗ, not ΤΡΊΤΗ). `today-list.tsx` currently calls `.toUpperCase()` on the date label, so use a locale-aware helper or avoid caps. Native-speaker review is still pending (`positioning.md` §7).

| Key | EN | ΕΛ |
|---|---|---|
| tab.today | Today | Σήμερα |
| tab.week | Week | Εβδομάδα |
| tab.routine | Routine | Ρουτίνα |
| family (screen) | Family | Οικογένεια |
| task / tasks | Task / Tasks | Εργασία / Εργασίες |
| action.claim | I'll do it | Το αναλαμβάνω |
| status.claimed | Claimed: {name} | Ανέλαβε: {name} |
| status.claimed.me | You've got this | Το ανέλαβες εσύ |
| action.done | Done | Έγινε |
| status.done | {name} · {time} | {name} · {time} |
| action.release | Release | Το αφήνω |
| action.takeOver | Take over | Το παίρνω εγώ |
| action.assign | Who's doing it | Ποιος θα το κάνει |
| action.undo | Undo | Αναίρεση |
| status.open | Open | Ανοιχτό |
| status.due | Due now | Τώρα |
| status.overdue | Overdue | Καθυστερεί |
| status.missed | Missed | Δεν έγινε |
| action.doneLate | Mark done late | Έγινε, το σημειώνω τώρα |
| must | Must do | Απαραίτητο |
| history | History | Ιστορικό |
| reminder | Reminder | Υπενθύμιση |
| invite | Invite family | Πρόσκληση οικογένειας |
| inviteCode | Invite code | Κωδικός πρόσκλησης |
| members | Members | Μέλη |
| leave | Leave family | Αποχώρηση από την οικογένεια |
| deleteAccount | Delete account | Διαγραφή λογαριασμού |
| type.walk / meal / medicine / potty / play / grooming / vet / other | Walk / Meal / Medicine / Potty / Play / Grooming / Vet / Other | Βόλτα / Φαγητό / Φάρμακο / Τουαλέτα / Παιχνίδι / Περιποίηση / Κτηνίατρος / Άλλο |
| conflict.claimed | {name} claimed this a moment ago. | Το ανέλαβε μόλις: {name}. |
| conflict.done | Already done by {name} at {time}. | Έγινε ήδη · {name}, {time}. |

## 2. Navigation map

Keep the mockups' **3-tab bar**: Today, Week, Routine (was Needs). **Family** (dog profile, members, invite, History, Settings) is a pushed screen opened from the dog card at the top of Routine (it already exists in mockup `Needs` with an **Edit** link) and from the dog photo in the Today header. This avoids a 4th tab at MVP. Revisit if analytics show low discovery of Invite. The root `_layout.tsx` Stack gains an `(onboarding)` group, shown when signed out or with no family (replacing the single `AccountGate` component), and the modal routes below.

```mermaid
flowchart TB
  subgraph Onboarding["(onboarding) stack: no session or no family"]
    W[Welcome] --> SU[Sign up / Sign in] --> CE[Check email]
    SU --> YN[Your name] --> CJ[Create or join]
    CJ --> DP[Dog profile setup] --> ST[Starter tasks] --> IV1[Invite family] --> NP[Reminders priming]
    CJ --> JC[Join confirmation] --> NP
  end
  NP --> Tabs
  DL[Invite deep link] --> JC
  subgraph Tabs["(tabs): 3-tab bar per mockups"]
    T[Today]
    WK[Week]
    R[Routine]
  end
  T -->|tap row / push| TS[[Task sheet: modal]]
  WK -->|tap slot| TS
  T -->|History icon| H[History]
  WK -->|past day| H
  R -->|add / tap| TE[[Task editor: sheet]]
  T -->|empty: Add a task| TE
  R -->|dog card| F[Family screen]
  T -->|dog photo| F
  F --> H
  F -->|Edit dog| DE[[Dog profile edit: sheet]]
  F -->|Invite| IV[[Invite sheet]]
  T -->|solo card| IV
  TS -->|+ Invite chip| IV
  F -->|gear| S[Settings]
  R -->|gear| S
  S --> NS[Notification settings]
  S --> LG[Language]
  S --> LF[[Leave family: confirm]]
  S --> DA[Delete account]
  F -.v1.1.-> PW[[Pack paywall: SLOT]]
```

## 3. Screen inventory

### Onboarding & auth (no mockups yet)
| # | Screen | Purpose | Key content / components | Primary action | Status / mockup |
|---|---|---|---|---|---|
| 1 | Loading / error / config error | Boot states | Splash overlay, "Try again" | Try again | **EXISTS**: `components/account-gate.tsx` (modes `loading`, `error`, `configuration-error`), `components/animated-icon.tsx`. No mockup; restyle to the tokens in §4 |
| 2 | Welcome | Value prop; route new vs invited users | One-liner, illustration, EN/ΕΛ switch | Get started · I have an invite | **NEW**: needs mockup |
| 3 | Sign up / Sign in | Create account | **Continue with Apple**, email + password, 16+ checkbox, privacy and terms links, forgot password | Continue | **CHANGES**: `account-gate.tsx` `signed-out` mode. Add Apple, age gate, reset, and separate sign-in from sign-up. Needs mockup |
| 4 | Check email | Confirm email address | Inbox illustration, Resend, Open mail | Open mail app | **CHANGES**: today only a `notice` line in `account-gate.tsx`. Needs mockup |
| 5 | Your name | Display name shown to family | Single field, helper copy | Continue | **NEW**: needs mockup. Replaces the email-prefix name in `use-daily-needs.tsx` `setOccurrence` |
| 6 | Create or join | Choose path | Two large options; code field on Join | Set up a new family | **CHANGES**: `account-gate.tsx` `needs-household` mode, split into two steps. Needs mockup |
| 7 | Dog profile setup | Name, photo, birthday | Photo picker, name, optional birthday | Continue | **NEW**: needs mockup. Today the household name *is* the dog name |
| 8 | Starter tasks | Pre-fill routine | Template cards (Puppy / Adult / Senior or meds) → checklist with editable times, rows styled like mockup `Needs` | Add N tasks | **NEW**: needs mockup |
| 9 | Invite family | Drive the 2nd member (activation) | Share link (primary), QR code, copyable code, "I'll do it later" | Share invite link | **NEW**: needs mockup. Reuses the Invite sheet (#21) |
| 10 | Reminders priming | Ask for push permission in context | Example notification preview | Turn on reminders | **NEW**: needs mockup |
| 11 | Join confirmation | Confirm the family; privacy disclosure | Dog photo and name, member avatars, "Your family sees your name…", one-family conflict variant | Join Max's family | **NEW**: needs mockup |

### Tabs
| # | Screen | Purpose | Key content / components | Primary action | Status / mockup |
|---|---|---|---|---|---|
| 12 | **Today** | See the dog's day; claim and complete | Header with day label + "Luna's day" + dog photo (tap → Family) + History icon; progress card ("3 of 7 done · 1 still open"); red NOW line; 60px rows: done (`#E9EDE6`), claimed (white + member avatar), open (orange dashed + **I'll do it**); solo invite card; "Yesterday: N missed" chip; offline / reminders-off banners; snackbar Undo | I'll do it / Done | **CHANGES**: mockup `Main.dc.html`; `app/(tabs)/index.tsx`, `components/today-list.tsx`. **Code is out of sync with the mockup:** code draws *booked* rows orange dashed, while the mockup (and these flows) use orange dashed for *open / nobody claimed*. Align the code to the mockup. Also: claim on every type (code shows Book only for future walks), Book→I'll do it, Cancel→Release, Done-on-others confirm, conflict toasts, Overdue tag, amount in title ("Dinner · 150 g"), toasts instead of header error text, i18n dates (hard-coded `en-GB`) |
| 13 | **Week** | Plan who covers what this week | Task × day grid, member initials, open cells, "Who covers what" totals incl. Open, prev/next week | Tap open cell → Task sheet | **CHANGES**: mockup `Week.dc.html`; `app/(tabs)/week.tsx`, `components/week-screen.tsx`. Past-day tap → History; solo legend nudge; terminology; i18n |
| 14 | **Routine** (was Needs) | Manage recurring tasks + entry to Family | Dog card (photo, name, **age from birthday**; tap → Family), intro line, task list (time, name, MUST badge, amount/duration · repeat), Add a task, gear → Settings | Add a task | **CHANGES**: mockup `Needs.dc.html`; `app/(tabs)/needs.tsx`, `components/daily-needs-screen.tsx`. Rename the tab; replace the mockup's `[Breed] · [Age] · [Weight]` with "{age} · {N} members" (MVP profile is name/photo/birthday only); intro copy "…a slot someone in the family can book" → "…can claim"; **move** email, invite code and Sign out to Family and Settings |
| 15 | **Family** (pushed screen, not a tab) | Dog profile, members, invites, plan slot, History and Settings | Dog card with Edit; Members list with roles + Invite; History row; "Early access: everything is free" card (future Pack slot; "Add another dog" reserved here); gear → Settings | Invite | **NEW**: needs mockup. Reuse the `Needs` dog-card component |

### Stacks, sheets & modals
| # | Screen | Purpose | Key content / components | Primary action | Status / mockup |
|---|---|---|---|---|---|
| 16 | **Task sheet** (was Book a task) | Details, claim options, secondary actions | Task card (OPEN badge, date, time–end, duration, notes); Who's doing it (Me + members + **+ Invite** chip); Repeat (Just today / Every Thu / Every day); Remind me 15 min before; helper copy; Release / Take over / Mark as not done | I'll do it (or Assign) | **CHANGES**: mockup `Book.dc.html`; `app/book-task.tsx`, `components/book-task-screen.tsx`. Show as a modal sheet; open for any task type and state (badge shows Open/Claimed/Done); push deep-link target; remove "add a note" from the helper copy (task notes are v1.1); button "Book evening walk" → "I'll do the evening walk"; i18n |
| 17 | **Task editor** | Create / edit / delete a recurring task | Type tiles (Walk, Food, Medicine, Potty, Play, Grooming + **Vet**, Other), name, time presets, **amount by type** (g / pills / minutes), repeat days, Must do ("Alerts everyone if it isn't claimed 1 hour before"), notes, **Usually done by**, **Remind before**, **Delete task**, "Just once on date" | Add to Luna's day / Save changes | **CHANGES**: mockup `AddNeed.dc.html` (fix dog name "Summer" → the real dog); `NeedForm` in `components/daily-needs-screen.tsx`. Add delete, default assignee, reminder default, Vet type, one-off date, amount field (schema: `type` enum, amount, one-off date). New rows need mockup additions |
| 18 | **History** | Last 7 days: who did what; missed | Summary strip (done/total, per-member counts styled like the Week "Who covers what" legend), day-grouped list (rows like Today's done rows; missed rows use the MUST red), filters (All / Missed / member), Mark done late; "Older history" row = SLOT | Mark done late | **NEW**: needs mockup. Data in `daily_need_occurrences` |
| 19 | **Dog profile edit** | Edit name, photo, birthday | Photo, name, birthday, Save. Built on a `dogs` table so a v1.1 dog switcher only adds a list above it | Save | **NEW**: needs mockup (sheet in `AddNeed` style) |
| 20 | **Settings** | Personal and family preferences | Profile, Language, Notifications, Family (rename, Leave), Account (Sign out, Delete), About | — | **NEW**: needs mockup. Sign out moves here from `daily-needs-screen.tsx` |
| 21 | **Invite sheet** | Share access | Share link, QR, code + copy, owner: Reset link, member count | Share invite link | **NEW**: needs mockup. Today only "Invite code: X" text in `daily-needs-screen.tsx` |
| 22 | Notification settings | Per-member push preferences | OS status + deep link, 5 toggles, quiet-hours note, Android battery help | — | **NEW**: needs mockup |
| 23 | Language | Choose language | System / English / Ελληνικά radio | — | **NEW**: could be an inline picker in Settings; no separate mockup needed |
| 24 | Leave family (confirm) | Leave safely | Consequences, owner-transfer or last-member variant | Leave family | **NEW**: needs mockup (confirm sheet pattern) |
| 25 | Delete account | Store and GDPR compliance | What's deleted / kept, re-auth, data-export link | Delete my account | **NEW**: needs mockup |
| 26 | Removed from family | Explain lost access | Message → Create or join | Continue | **NEW**: small state screen; can share a template with #1 |
| 27 | Pack paywall | v1.1 Premium (per household) | Plans, household avatars, "Ask {owner} to upgrade" for members | Start free trial | **SLOT**: not built or mocked at MVP |
| — | `ScheduleScreen` | Generic placeholder | — | — | Unused: `components/schedule-screen.tsx` is not imported anywhere. Remove or reuse as the empty-state shell |

### Counts
- **Existing, i18n / restyle only:** 1 (#1)
- **Existing, needs changes:** 8 (#3, 4, 6, 12, 13, 14, 16, 17). All 5 mocked screens are in this group
- **New:** 16 (#2, 5, 7–11, 15, 18–26). **13 need new mockups** (all except #23 Language, #26 Removed, and the reuse of #9/#21 counted once)
- **Reserved slots (v1.1):** Pack paywall; "Add another dog" and dog switcher (Family dog card / Today header photo); "Older history" row; custom quiet hours and escalation in Notification settings

## 4. Visual language (from mockups) and design-system follow-ups

Tokens from `mockups/README.md`. New mockups must use them; code should move to them.

| Role | Mockup token | Code today | Action |
|---|---|---|---|
| Ground / Surface / Text / Muted | `#F4F5F1` / `#FFFFFF` / `#1C2321` / `#5A635F` | `#F4F6F3` / `#FFFFFF` / `#1B2522` / `#5C6762` (local `palette` in each screen) | Consolidate into `constants/theme.ts` tokens (light + dark) |
| Primary green | `#2F6B4F` | `#286B50` (`today-list.tsx`), `#2D6D51` (`account-gate.tsx`) | One token |
| Open / unclaimed | `#D9822B` dashed 2px border, `#FFF6EA` fill, `#8A4510` text | Code uses orange dashed for **booked** rows | **Swap to the mockup meaning:** orange dashed = needs someone |
| Claimed | White row + member-colour initials avatar (mockup member colours: blue `#DCE6F7`/`#1F4280`, peach `#FBE3CC`/`#8A4510`, lilac `#E9DFF5`/`#4F2C80`) | `#FFF7E9` dashed | Follow mockup; member colours are stable per member across Today, Week, History |
| Done row | `#E9EDE6` | muted surface + strikethrough | Follow mockup |
| NOW line / Overdue | `#B8452A` | `#BF442B` | Reuse for the **Overdue** tag and Missed in History |
| MUST badge | `#F8DDD5` fill, `#8F2F1A` text | text badge | Follow mockup |
| Primary buttons | Done = green; Book/I'll do it = near-black `#1C2321`; 44px high, 12px radius | 64pt high, 20px radius | Keep 44px minimum, but allow wider buttons for Greek ("Το αναλαμβάνω" is about 2× "Book"). Test at 390px width; fall back to an icon + short label ("Εγώ") if it overflows |
| Shape | 14–18px card radius, 60px rows | 24px radius, 96px rows | Follow mockup |
| Type badges | Icons in mockup rows / AddNeed tiles | Letters (W/F/M) in `getTypeStyle` | Use icons; letters don't translate |

**Fonts and Greek (blocker to verify):** the mockups use **Bricolage Grotesque** (headings) and **DM Sans** (body). As far as I know, neither ships Greek glyphs on Google Fonts (Latin / Latin-ext / Vietnamese only), so Greek text would fall back to the system font mid-screen. Options: (1) keep them for Latin and set an explicit Greek fallback (system SF Pro / Roboto, which look clean); (2) switch to fonts with Greek coverage that keep the feel (e.g. **Manrope** or **Commissioner** for body, **Noto Sans Display** for headings). Recommendation: (1) for MVP, then a real pairing test with Greek copy on the canvas before launch.

**Other mockup inconsistencies to fix on the canvas:** "Summer" in `AddNeed` vs "Luna" elsewhere; `[Breed] · [Age] · [Weight]` placeholders in `Needs`; "Book" / "Nobody booked" / "Daily needs" copy → the terminology in §1; the "add a note" helper copy in `Book` (v1.1).
