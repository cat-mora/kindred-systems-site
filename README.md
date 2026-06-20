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
