# MVP Scope

Owner: business agent · Last updated: 2026-10-12 · Status: **Recommended, pending team sign-off**

**MVP promise:** *"Everyone in the house knows what the dog needs today, who's doing it, and what's already done, so nothing is missed and nothing is doubled."*

Bar for MVP: a 2–5 person household can set up in under 5 minutes, use it every day for 4 weeks, and get a push when something is about to be missed.

---

## 1. In scope

Legend: ✅ built · 🟡 partly built · 🔨 to build

| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | Email/password accounts | ✅ | Add **Sign in with Apple** before iOS launch (required by App Store rule 4.8 once any third-party login is added; recommended regardless for conversion). Google sign-in optional. |
| 2 | One household per user, invite by code | ✅ | 🔨 Add a share-sheet invite **link** (deep link → join), not just a code. This is the #1 activation lever. |
| 3 | Daily needs: type, duration, repeat days | ✅ | Covers walks, meals, meds, grooming. |
| 4 | Today screen: shared book (claim) / complete, live via Realtime | ✅ | Core loop. |
| 5 | Member assignment & booking preferences | ✅ | |
| 6 | Weekly repeating bookings + week navigation | ✅ | |
| 7 | **Push reminders** (before due; "still open" nudge to household when missed) | 🟡 | `reminder_enabled` column exists; no delivery. Build with Expo Notifications + a scheduled Supabase Edge Function. **MVP blocker.** |
| 8 | **Simple history** (last 7 days, who did what, when) | 🟡 | Data already captured in `daily_need_occurrences` (`completed_by`, `completed_at`). Needs a read-only screen only. |
| 9 | **Minimal dog profile** (name, photo, optional birthday) | 🔨 | Currently the household *is* the dog. A name + photo on Today makes it feel personal; keep it to 3 fields. |
| 10 | Onboarding templates ("Puppy", "Adult dog", "Senior / on meds") | 🔨 | Pre-fills needs; cuts setup time and boosts activation. |
| 11 | Account deletion in-app + privacy policy + data export on request | 🔨 | Required by App Store (5.1.1(v)) and Google Play; GDPR. **Launch blocker.** |
| 12 | Greek + English localisation | 🔨 | Needed for Greece-first launch (see Q3). |
| 13 | Basic analytics events (privacy-friendly, EU-hosted) | 🔨 | Needed to measure the metrics below. |

## 2. Explicitly out of scope for MVP

| Item | Why not now | Earliest |
|---|---|---|
| Multiple dogs per household | See Q1. Schema change + UI complexity. | v1.1 (paid) |
| Payments / subscriptions | See Q2. Prove retention first. | v1.1 |
| Multiple households per user (e.g. co-parenting across two homes, dog-sitter) | Edge case; complicates auth model. | v2 |
| Full health records, vaccine tracking, vet documents | Different product (11pets, Pawprint own this). | v1.1 lite / v2 |
| Weight / food quantity / poop logging & charts | Nice, not core to "who's doing it". | v2 |
| Walk GPS tracking | Battery, privacy, scope; Strava-for-dogs is a separate product. | Not planned |
| Chat / comments | WhatsApp already exists; notes on a task suffice later. | v1.1 (task notes) |
| Training content (Puppr/Dogo territory) | Content business, not our job. | Not planned |
| Dog-sitter / walker guest access | Strong paid hook but needs roles & expiry. | v2 |
| Web app, widgets, Apple Watch | Post-PMF polish. | v1.1–v2 |
| Other pets (cats etc.) | Dilutes positioning; revisit with data. | v2+ |

---

## 3. Open questions: decisions

### Q1. Multiple dogs per household in MVP? **No.**
- ~70–80% of dog-owning households have one dog; MVP must nail that case.
- Workaround exists today: name needs "Max – walk", "Bella – walk".
- Multi-dog is a natural, easy-to-explain **paid feature** (see `pricing.md`); shipping it free at MVP would make it hard to charge later.
- **But:** design the dog profile table now (`dogs` with `household_id`, needs get a nullable `dog_id`) so v1.1 is a UI change, not a migration crisis. Engineer to confirm.

### Q2. Free vs paid? **Free at MVP launch; paywall in v1.1. Freemium, per household.**
- Monetising before retention is proven wastes the small Greek launch cohort and invites 1-star reviews.
- Launch fully free, labelled "Early access: everything free". Early households get a **founder discount** (e.g. 50% off first year) when premium launches. This converts goodwill into revenue.
- Core loop (shared today list, claim/complete, reminders, invites) stays **free forever**. Premium = more dogs, more history, more reminder power, guests. Details in `pricing.md`.

### Q3. Greece first? **Yes: Greece as a soft-launch market, built English-first, EU-ready.**
- Pros: founder network & local knowledge, cheap user acquisition (Greek-language ASO is uncrowded), tight feedback loop, multi-generational households (grandparents, kids) are exactly the shared-care use case.
- Cons: small market (~10.4M people, roughly 1 in 3 households with a dog; small revenue pool, lower purchasing power).
- Approach: ship EL + EN on day one; release in **Greece + Cyprus** for 6–8 weeks; if metrics hit targets, open the EU + UK + US with English listings (and DE/IT/ES localisation in v1.1). Greece is the test bed, not the business.

---

## 4. Success metrics (MVP, measured over the first 8 weeks)

| Metric | Definition | Target | Kill / rethink line |
|---|---|---|---|
| **Activation** | % of new households with ≥3 needs created **and** ≥2 members joined within 72h | ≥ 40% | < 20% |
| Invite rate | % of households that send ≥1 invite in 24h | ≥ 60% | < 35% |
| **Weekly active households (WAH)** | Households with ≥5 completions in the week | Grow week over week; 500 WAH by week 8 (Greece) | < 150 |
| **Task completion rate** | Completed ÷ scheduled occurrences, per active household | ≥ 70% | < 50% |
| Shared-ness | Avg distinct members completing tasks per active household per week | ≥ 2.0 | < 1.4 (= single-user app, positioning problem) |
| W4 household retention | % of activated households still WAH in week 4 | ≥ 35% | < 20% |
| Reminder effectiveness | % of reminded occurrences completed within 2h of push | ≥ 50% | — |
| Store rating | Avg rating | ≥ 4.5 | < 4.0 |

North-star: **Weekly Active Households.** A household is the paying unit, so measure that, not users.

## 5. Key risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Only one person in the house uses it (no network effect) | High | High | Invite link, onboarding requires inviting, "X marked feeding done" pushes to others. Track "shared-ness". |
| Push reminders unreliable (iOS background limits, Android OEM battery killers) | Med | High | Server-side scheduled pushes (not local-only); test on Xiaomi/Samsung, which are popular in Greece. |
| Novelty decay: households stop logging after routine forms | High | High | Reminders, a light streak, a weekly recap ("Your family did 42 tasks for Max"). |
| WhatsApp group "good enough" | High | Med | Win on zero-effort: one tap to claim/complete vs. typing; double-feeding prevention is the hook. |
| Small Greek market limits learnings/revenue | Med | Med | Time-box Greece to 8 weeks; expand on metrics, not dates. |
| GDPR / store rejection (no account deletion, missing privacy labels, minors in household) | Med | High | Launch-blocker items #11; self-declared age gate (Greek digital consent age is 15; we use 16 for EU-wide simplicity; younger kids come later as parent-managed members, see `pricing.md` §7). |
| Supabase cost scaling with Realtime | Low | Low | Free/Pro tier covers well beyond MVP volumes. |
