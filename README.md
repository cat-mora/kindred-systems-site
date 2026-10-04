# Kindred Systems Website

This repository contains the public website for **Kindred Systems**, the parent company for the Kindred Systems AI product family.

Kindred Systems builds AI workers for commercial and human connection use cases, with three product lines:

- **AI Assistant Pro**: natural-sounding phone voice agents for small service businesses
- **Digital Employee Pro**: multiple AI agents managed as one AI employee system for established businesses
- **AI Companion Calls**: a coming-soon companion conversation line, built with clear ethical guardrails

The website is currently a static HTML site deployed through Vercel.

## Project Docs

Cross-business platform documentation lives in `/project-docs/`:

- [`project-docs/tidycal.md`](project-docs/tidycal.md) — TidyCal booking platform setup, all business URLs, naming convention, scalability plan

Business-specific documentation lives in each product repo's own `/project-docs/` folder.

---

## Purpose of this site

This is the parent-company credibility site, not the full sales page for each product.

It should help visitors understand:

- what Kindred Systems does
- the difference between AI Assistant Pro and Digital Employee Pro
- that AI Assistant Pro is a voice-agent product line
- that Digital Employee Pro is a managed AI employee system, not mainly a phone-answering service
- that AI Companion Calls is coming soon and will be handled separately
- that the company is being built as a serious, scalable and transferable business asset

This site will often be used from LinkedIn, early sales conversations, partner discussions and business profile links. It should look credible, commercially sharp and clear.

## Platform Tools (shared across all businesses)

| Tool | Purpose | Account | Status |
|---|---|---|---|
| TidyCal Agency | Booking pages for all businesses | kindredsystems slug | ✅ Live — see project-docs/tidycal.md |
| Google Workspace | Email for all businesses | Kindred Systems account | ✅ Active |
| Vercel | Hosting for all websites | kindred-systems-team | ✅ Active |
| GitHub | Code repos for all sites | cat-mora | ✅ Active |
| Canva | Brand assets for all businesses | Cathryn's account | ✅ Active |

---

## Current file structure

```text
index.html
assets/
  kindred-logo-header.png
  kindred-logo-transparent.png
  favicon-source-512.png
  favicon.ico
  favicon-16.png
  favicon-32.png
  favicon-48.png
  apple-touch-icon.png
  android-chrome-192.png
  android-chrome-512.png
  social-share.png
  site.webmanifest
project-docs/
  tidycal.md
README.md
```

## How to preview locally

Open `index.html` directly in a browser.

For a better local preview, use a small local server:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Deployment

This site is deployed through Vercel from GitHub.

Usual workflow:

1. Edit `index.html` or files inside `assets/`
2. Commit changes to the `main` branch
3. Vercel automatically deploys the latest version
4. Check the Vercel preview and live domain after deployment

## Asset notes

### Header logo

The header logo should use the clean Canva export.

Preferred file:

```text
assets/kindred-logo-header.png
```

If replacing it, export from Canva at a large size so the logo stays crisp. Do not use screenshots or tightly cropped versions.

### Favicon

The favicon should use the simplified three-circle icon, not the full wordmark. Text will not read at favicon size.

Source file:

```text
assets/favicon-source-512.png
```

Generated favicon files:

```text
assets/favicon.ico
assets/favicon-16.png
assets/favicon-32.png
assets/favicon-48.png
assets/apple-touch-icon.png
assets/android-chrome-192.png
assets/android-chrome-512.png
```

### Social share image

Social preview image:

```text
assets/social-share.png
```

This is the image used when the site is shared on LinkedIn, Facebook or other platforms that read Open Graph metadata.

## Brand and copy rules

Use Australian English.

Avoid startup fluff and generic AI language. The copy should sound practical, commercial and human.

Do not use:

- em dashes
- exaggerated claims
- vague AI phrases such as "unlock", "elevate", "seamless", "game-changing", "empower" or "transform"
- passive phrases such as "the first job is..."
- "that matters because..."
- "it's not just X, it's Y"
- overused phrases such as "AI-powered solutions" or "tailored solutions"

Prefer direct wording that names the buyer, the problem and the commercial outcome.

Example:

```text
AI Assistant Pro gives small service businesses natural-sounding voice agents that answer, call back, book and rebook by phone.
```

Not:

```text
AI Assistant Pro unlocks seamless customer engagement through AI-powered automation.
```

## Product positioning rules

### AI Assistant Pro

AI Assistant Pro is specifically a voice-agent product line.

It should be described as natural-sounding phone voice agents that can:

- answer calls
- call leads back
- speak with customers
- book appointments
- rebook past customers
- escalate calls to a person where needed

The rebooking/reactivation version is still voice-led, but may also work with customer records, calendars, emails or SMS to identify customers due for follow-up and contact them.

### Digital Employee Pro

Digital Employee Pro is not mainly a voice-agent offer.

It should be described as:

```text
Multiple agents, managed as one AI employee system.
```

It can work across:

- sales
- marketing
- research
- reporting
- customer support
- documents
- CRM tasks
- internal operations

Voice can be added for Digital Employee Pro clients, but the core offer is a managed AI working layer across business systems and workflows.

### AI Companion Calls

AI Companion Calls is coming soon.

Any wording for this product must be careful, warm and ethical. It must state that the companion is AI and should avoid fear-based language, dependency-building language or direct hard-selling to vulnerable people.

## Pricing copy rules

When using Australian dollar prices in public-facing copy, add an approximate US dollar equivalent in brackets.

Use clean rounded figures.

Example:

```text
A$295/month (approx US$210/month)
```

Current parent-site pricing signal:

```text
AI Assistant Pro voice agents usually involve a setup fee, then ongoing plans from around A$295 to A$795/month (approx US$210 to US$565/month), depending on call volume, booking needs, callbacks, rebooking and integrations.
```

```text
Premium Digital Employee Pro engagements are scoped around the commercial value of the work being handled, with monthly retainers up to around A$5,000/month (approx US$3,550/month).
```

## SEO and metadata

The parent site should be lightly optimised for broad brand and category terms. The individual product websites should carry the heavier SEO work.

Parent-site terms may include:

- AI workers
- AI voice agents
- AI receptionist
- managed AI employees
- digital employee
- AI companion calls
- AI agents for business

Product-site SEO should be more specific.

Examples:

- AI receptionist for tradies
- AI phone answering service for small business
- AI appointment booking for pest control
- AI rebooking calls for service businesses
- managed AI employee for business
- AI digital worker for operations
- AI companion calls

## Advisory positioning (Kindred Systems core offer)

As of August 2026, the Kindred Systems advisory business (separate from the AI Assistant Pro / Digital Employee Pro product lines above) sells two offers only:

- **Free Discovery Call** — a 30-minute conversation, no obligation on either side.
- **AI Business Outcomes Advisory** — from A$2,500/month + GST, a 90-day engagement. One agreed measurable outcome, moved in 90 days.
- **Executive AI Sprint** — from A$1,900/day + GST, minimum 5 consecutive days (or weeks), delivered remotely or in person if the client is in Brisbane.

There is no longer a tiered/5-package pricing structure on the advisory pages (`index.html`, `advisory/index.html`, `about/index.html`). Do not reintroduce one without approval.

Positioning: "Kindred Systems helps established organisations turn AI investment into measurable business outcomes." The core insight driving the copy: most organisations don't have an AI problem, they have a business outcomes problem, money and effort going into AI with no clear commercial return.

Copywriting rules specific to the advisory pages:

- Sell the benefit of the benefit (outcome → so what → and then what), not a delivery framework. Cat's own methodology (L.E.A.P.: Limiting Focus, Establishing Plan, Developing Assets, Reviewing Progress, from Laura Meyer's Expert Freedom coaching) is how the work gets delivered once a client signs, not how it gets sold. Do not expose "L.E.A.P.," "Month 1/2/3," or any step-by-step framework language on public pages. If a page needs to gesture at rigour, say something like "there's a proper method behind this, it belongs in the discovery call, not a page."
- Avoid staccato, social-media-style short sentences in hero/lead copy. Write flowing prose that follows a reality-first, then-insight, then-solution arc (describe the prospect's current situation in plain sentences, reveal the insight once earned, then introduce Kindred Systems as the solution).
- Avoid the word "governance" in client-facing copy unless it's explained in plain language. It tends to read as a legal/compliance term to prospects and Cat herself found it unclear.
- Business-outcomes bullets should always include at least one explicit make-money bullet and one explicit save-money bullet.
- Never describe the A$2,500+/month or A$1,900+/day engagements as being about "one result" without framing the scale of that result (it can be worth hundreds of thousands of dollars, not a small/incremental fix).
- Follow the additional brand banned-word list in "Brand and copy rules" above, plus (per the Aug 2026 messaging review): no negative-construct triplets ("Not X. Not Y. Not Z.") and no "not X but Y" formulations.

## Forms and lead capture

All forms on this site (contact page, the six advisory intake forms, and the client-details/welcome form) submit to **`api/submit-form.js`**, a Vercel serverless function in this repo, not a third-party form backend.

- **Why not Formspree:** every form used to share one Formspree endpoint (`https://formspree.io/f/xpqgpdzg`). Formspree kept returning a genuine success response to the browser while submissions silently never reached `info@kindredsystems.com.au` - most likely an account-side notification setting or the free plan's shared 50 submissions/month cap. Neither was visible or fixable from this repo, so the dependency was replaced (24 Sept 2026).
- **How it works now:** each page's `<form>` posts JSON to `/api/submit-form` via `fetch()`. The function sends the notification email through **Resend** and logs every attempt, so a delivery problem shows up in Vercel's function logs instead of disappearing.
- **Required env var:** `RESEND_API_KEY`, set in Vercel project settings (never committed to this repo). Without it the function returns an error and logs why.
- **Optional env vars:** `LEAD_NOTIFY_EMAIL` (recipient override, defaults to `info@kindredsystems.com.au`) and `RESEND_FROM_EMAIL` (sender override, defaults to Resend's shared sandbox address - verify the `kindredsystems.com.au` sending domain in Resend to use a branded from-address instead).
- To CC someone (e.g. a VA), extend `api/submit-form.js` to read an extra recipient, or add it via `LEAD_NOTIFY_EMAIL` as a comma-separated list once that's needed.

### Client intake forms

- **Live URLs:** `https://kindredsystems.com.au/advisory/intake/` (general) plus `/building/`, `/cosmetic/`, `/familylaw/`, `/financial/`, `/realestate/` variants, one per industry vertical.
- **Source files:** `advisory/intake/index.html` and `advisory/intake/<vertical>/index.html`.
- Added 13 Aug 2026, split into per-industry variants after that. Sent directly to new advisory clients after the Onboarding Call is booked, so Cat has what she needs to shape the first 90-day plan before that call.
- Each is ONE shared link for every client in that vertical, not a unique link generated per person. There is no login, token or pre-fill. Each client identifies themselves by filling in the "Your details" section at the top, same as any public web form.
- The pages are tagged `noindex, nofollow` in their `<head>` and are not linked from site navigation. They are private/client-only by omission, not by access control - anyone with the direct link can open and submit them.
- Content structure: a "Your details" section (name, business name, email, phone - all optional) followed by 7 numbered sections (Business overview, Client/lead value and enquiry volume, Conversion, What happens after an enquiry, Existing leads and systems, What is working, Next 90 days), worded per vertical.
- Submits to `/api/submit-form` (see above).

### Client-details ("welcome") form

- **Live URL:** `https://kindredsystems.com.au/advisory/welcome/`
- **Source file:** `advisory/welcome/index.html`
- Sent to a client once they've signed on, to collect what's needed for their agreement, invoice and document sharing before onboarding.
- Same privacy model as the intake forms: `noindex, nofollow`, not linked from navigation, one shared link.
- Submits to `/api/submit-form` (see above).

## What not to change without approval

Do not change the core product positioning without approval.

Do not blur AI Assistant Pro and Digital Employee Pro together.

Do not make Digital Employee Pro sound like a more expensive missed-call service.

Do not make AI Assistant Pro sound like email automation or desktop workflow automation. It is a voice-agent line.

Do not remove metadata, favicon links or social share tags unless replacing them with updated versions.

Do not add tracking scripts, forms, CRM integrations or analytics without checking the current implementation plan.

## Future improvements

Likely next updates:

- connect the main CTA to the Kai AI Growth Advisor once built
- add the live domain and Vercel project details
- add analytics after the deployment approach is confirmed
- create separate websites for AI Assistant Pro, Digital Employee Pro and AI Companion Calls
- add a proper privacy policy and terms page before collecting leads
- add case studies once real clients are live
- document deployment and update steps as a separate SOP

## Maintainer notes

Keep the site simple and static unless there is a clear reason to add complexity.

This company is being built as a transferable business asset. Clean files, clear decisions and documented processes matter.
