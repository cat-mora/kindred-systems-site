# TidyCal — Booking Platform (Kindred Systems)

TidyCal is the booking tool used across all Kindred Systems businesses. One account, one slug, separate Teams per business.

## Account Details

- **Plan:** Agency (lifetime, purchased 2026-06-20 via AppSumo — one-time cost)
- **Login:** cathrynmora.therapy@gmail.com (never expose this publicly)
- **Account slug:** `kindredsystems`
- **Base URL:** https://tidycal.com/kindredsystems/
- **Google Calendar:** Cathryn's primary Google Calendar connected for conflict checking

## How It's Structured

Each Kindred Systems business gets its own **TidyCal Team** for brand separation. Each team has its own booking types using a consistent naming convention.

### Naming Convention

`[business-abbreviation]-[person-or-agent]-[purpose]`

- `aap` = AI Assistant Pro
- `dep` = Digital Employee Pro
- `ks` = Kindred Systems (advisory/parent)
- Person names = real names (e.g. `cathryn`)
- Agent names = agent's name (e.g. `connor`)

Examples: `aap-connor-intake`, `aap-cathryn-intro`, `dep-cathryn-intro`

### Teams (current and planned)

| Business | TidyCal Team slug | Status |
|---|---|---|
| AI Assistant Pro | aiassistantpro | ⏳ To be created as team grows |
| Digital Employee Pro | digitalemployeepro | ⏳ To be created |
| Kindred Systems | kindredsystems | ✅ Using personal account slug for now |

Until teams are created, all booking pages live under `tidycal.com/kindredsystems/` with the business prefix in the URL (e.g. `aap-*`).

## Booking Pages — AI Assistant Pro (live ✅)

| Page | URL | Purpose |
|---|---|---|
| Connor intake | https://tidycal.com/kindredsystems/aap-connor-intake | Post-payment AI onboarding call |
| Cathryn intro | https://tidycal.com/kindredsystems/aap-cathryn-intro | Human intro call for prospects |

**Connor intake:** 20 min, TidyCal only (no Google Calendar), conflicts OFF, 14 days, 1hr notice. Title: "AI Assistant Pro — Intake Call with Connor (AI Agent)".

**Cathryn intro:** 20 min, Google Calendar synced, conflicts ON, 14 days, 4hr notice. Title: "Chat with Cathryn — AI Assistant Pro".

**Cathryn's availability:** M/T/W/F 5–7pm, Thu 9am–5pm, Sat 9am–12pm, Sun unavailable.

## Booking Pages — Digital Employee Pro

Not yet created. Will follow the same pattern: `dep-cathryn-intro` etc.

## Scalability

TidyCal Agency supports Teams, round-robin and multiple team members. As each business grows:
- Create a TidyCal Team for that business
- Add team members (human or AI) as members
- Each gets their own booking type: `[biz]-[name]-[purpose]`
- Round-robin can distribute bookings across team members automatically

## Still To Do

- [ ] Update Stripe success page redirect (AI Assistant Pro) to: https://tidycal.com/kindredsystems/aap-connor-intake
- [ ] Create `aap-connor-intake` booking type in Vapi (Session 1J)
- [ ] Create booking pages for Digital Employee Pro when ready
- [ ] Consider custom domain (e.g. book.kindredsystems.com.au) for cleaner branding
