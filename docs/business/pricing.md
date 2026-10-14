# Pricing

Owner: business agent · Last updated: 2026-10-12 · Status: **Recommended. Price points to be validated against the marketer's competitor research (`docs/marketing/`).**

## TL;DR

- **Model:** Freemium **subscription, priced per household** (one purchase unlocks Premium for every member).
- **Free:** the whole shared daily loop, forever. **Premium:** more dogs, full history, smarter reminders, guests.
- **Price:** **€2.99/mo or €19.99/yr** (US: $2.99/mo or $19.99/yr). Annual is the default, shown as "€1.67/mo".
- **Optional lifetime:** €49.99 / $49.99, offered at launch to early adopters, then reviewed.
- **Trial:** 7-day free trial on annual only. Paywall goes live in **v1.1**; MVP ships free.

---

## 1. Model choice

| Option | Verdict | Why |
|---|---|---|
| Paid upfront | ❌ | Kills the invite loop: every family member would face a price wall. Paid-upfront apps barely sell in 2026. |
| One-time unlock (IAP) | ⚠️ Secondary only | Greek/EU users dislike subscriptions for "simple" apps, so offer a **lifetime** option. But we have recurring costs (push, Realtime, storage), so it can't be the only option. |
| Ads | ❌ | Low eCPM in Greece, ruins a calm family utility, and creates GDPR consent burden (tracking SDKs, ATT prompt). |
| **Freemium subscription** | ✅ | Free core drives invites and network effect; Premium monetises the engaged minority (typical 2–5% conversion for utilities). |

### Why per household, not per user
- **The household is the unit of value.** The app is useless to one person; charging each member taxes the invite loop, which is our growth engine.
- **One decision-maker pays** (usually the person who set it up). One purchase, everyone benefits. Matches Cozi Gold, OurHome and Tody's family framing.
- **Simpler support and entitlements:** entitlement lives on `households`, synced server-side from store receipts (RevenueCat or similar). Any member sees Premium; only the purchaser manages billing.
- Note: Apple Family Sharing only covers members of the same Apple family and doesn't help mixed iOS/Android households, so do our own household-level entitlement **and** enable Family Sharing on iOS as a bonus.

## 2. Free vs. Premium split

Rule: **never paywall the act of caring for the dog.** Free must stay great for a one-dog family; Premium is for power, scale and peace of mind.

| Feature | Free | Premium ("Pack") |
|---|---|---|
| Household members | **Unlimited** | Unlimited |
| Dogs | 1 | **Up to 5** |
| Daily needs / repeating tasks | Unlimited | Unlimited |
| Today: claim / complete, live sync | ✅ | ✅ |
| Week view & repeating bookings | ✅ | ✅ |
| Push reminders: before due | ✅ | ✅ |
| Missed-task escalation (nudge the whole household / a backup person) | — | ✅ |
| Custom reminder times & quiet hours per member | Basic | ✅ |
| History | Last 7 days | **Unlimited** + monthly recap & "who did what" stats |
| Dog profile | Name, photo, birthday | + vet contact, meds list, notes, vaccination dates |
| Guest access (sitter / walker / grandparent, time-limited) | — | ✅ (v2) |
| Export history (PDF/CSV, e.g. for vet or sitter) | — | ✅ |
| Home-screen widgets, themes | — | ✅ (v1.1–v2) |

Primary upgrade triggers (where the paywall appears): adding a 2nd dog, scrolling past 7 days of history, enabling missed-task escalation.

## 3. Price points

| Plan | EUR (incl. VAT) | USD (excl. tax) | Notes |
|---|---|---|---|
| Monthly | **€2.99** | **$2.99** | Anchor; few will choose it. |
| Annual | **€19.99** | **$19.99** | Default/highlighted. "Save 44%". ≈ €1.67/mo. |
| Lifetime (optional) | **€49.99** | **$49.99** | ≈ 2.5× annual. Launch-window offer; keep if it doesn't cannibalise annual > 30% of sales. |
| Founder offer (MVP households) | €9.99 first year | $9.99 | 50% off annual, for households active before paywall launch. |

### Anchors (general knowledge; **validate against marketer's research**)
| App | Category | Approx. price |
|---|---|---|
| Cozi Gold | Family organiser | ~$39/yr |
| OurHome | Family chores | Free (ad/premium-lite) |
| Tody | Cleaning chores, shared | ~$6.99 one-time / sub for sync, ~$20–30/yr range |
| 11pets | Pet health records | ~$3–5/mo, ~$20–40/yr |
| Pawprint | Pet records | Free core, premium ~$30–40/yr |
| Dogo / Puppr | Dog training content | ~$10–15/mo, ~$50–100/yr |

Positioning: we're a **utility**, not content. Price **below** pet-health and training apps and below Cozi, so the annual plan is an impulse buy (< €20) for a family. Greek purchasing power (~65–70% of EU average per capita) supports the low end; a €19.99 annual fits that and is fine for EU/US too.

**Regional pricing:** use store price tiers. Keep €19.99 across the eurozone; US $19.99; UK £17.99. Revisit for lower-income markets only if we expand there.

## 4. Monthly vs. annual & trial

- **Lead with annual** (pre-selected, shows monthly-equivalent). Utility apps see better LTV and lower churn on annual.
- **Trial:** 7-day free trial **on annual only**, with clear reminder 24h before billing (Apple/Google show their own too). No trial on monthly.
- **Reverse trial alternative (test in v1.1):** new households get 14 days of Premium automatically, then downgrade. Good for showing the value of escalation and history. A/B test against the standard trial.
- **No card-required trial outside the stores.** All purchases go through IAP.

## 5. Store fees, VAT, revenue math

| Item | Detail |
|---|---|
| Store commission | **15%** via Apple App Store Small Business Program and Google Play's 15% tier (first $1M/yr). **Enrol in Apple's program before launch** (it's not automatic). Google applies 15% to subscriptions regardless. |
| VAT | Apple and Google are the **merchant of record** in the EU: they collect and remit VAT (Greece **24%**, Cyprus 19%, others vary). We set the VAT-inclusive EUR price; proceeds are net of VAT and commission. No EU OSS VAT registration needed for store sales. |
| Greek income tax | Store payouts are business income for the operating entity (Greek company/sole trader). Confirm invoicing of Apple/Google with an accountant (self-billing). |
| DMA alternative payments (EU) | Not worth it at our scale: added compliance, Apple's Core Technology fees, and we'd become merchant of record for VAT. Revisit > €500k ARR. |

**Net per annual subscriber (Greece):** €19.99 ÷ 1.24 VAT = €16.12 → minus 15% = **≈ €13.70/yr**. (US $19.99 → ≈ $17.00/yr before sales tax handled by stores.)

**Illustrative:** 10,000 WAH × 4% conversion = 400 payers ≈ €5.5k/yr in Greece alone. This is why Greece is a test market and EU/US expansion is the business case.

Infra cost per household is negligible (Supabase Pro ~$25/mo covers thousands of households; push via Expo is free), so gross margin after store fees is ~85%.

## 6. Family-plan framing (copy direction for marketer)

- Name the tier for the household, not the person: **"Pack Premium"** / **"Family Premium"**. Greek: «Οικογενειακό Premium».
- Copy: *"One subscription. The whole family. Every dog."* / *"Less than a bag of treats a year."*
- Show the household avatars on the paywall: "Everyone in *The Papadopoulos Pack* gets Premium."
- Never show the paywall to invited members during onboarding; only the owner sees upgrade prompts by default, members see "Ask [owner] to upgrade".

## 7. GDPR & compliance (brief)

| Topic | Action |
|---|---|
| Lawful basis | Contract (running the household service). Analytics: legitimate interest only if anonymised/EU-hosted and cookieless; otherwise consent. No ad SDKs. |
| Data location | Host Supabase in an **EU region** (e.g. Frankfurt). Sign Supabase DPA; list sub-processors (Supabase, Expo push, RevenueCat, analytics) in privacy policy. |
| Shared data visibility | Members see each other's display names and task activity. State this clearly at invite/join. Use first names/nicknames. |
| Children | Greek digital age of consent is **15**; set the minimum account age at **16** for EU-wide simplicity, with a self-declared age gate. Younger kids: v2 "managed member" created by a parent, no own login/email. |
| Data subject rights | In-app account deletion (also store requirement), export on request (manual is fine at MVP), 30-day response SLA. |
| Household deletion | If the owner deletes their account: transfer ownership to the longest-standing member; delete household only when last member leaves. |
| Payments data | Handled entirely by Apple/Google; we store only entitlement status. |
| Store privacy labels | Complete Apple privacy nutrition label and Google Data safety form accurately (email, name, user content, photos of dog, diagnostics). |
| Retention | Free history UI shows 7 days, but data is kept (so upgrade unlocks the past). Disclose retention; purge occurrences > 24 months for inactive households. |
