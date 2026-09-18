# AI Visibility / AEO Scorecard — backend pipeline

Evidence-gathering + scoring backend for the AI Visibility Scorecard funnel.
Lives entirely under `/api/aeo/`. No new npm dependencies — every external
call (OpenAI, Stripe, PageSpeed, SERP, Places) is a plain `fetch()` against
that provider's REST API, so there's nothing to `npm install` and no build
step to add to this static site.

## Why this is built the way it is: the three-layer anti-hallucination design

This product's core promise is that the score is a fact, not an opinion —
so an LLM is never allowed to invent it. Three layers, strictly separated:

1. **Evidence layer** — `robots-llms.js`, `sitemap.js`, `raw-vs-rendered.js`,
   `schema-check.js`, `content-structure.js`, `internal-links.js`,
   `pagespeed.js`, `ai-panel.js`, `serp-visibility.js`, `places.js`.
   Deterministic code and real API/tool calls only. Every check returns one
   evidence object: `{ checkId, source, timestampISO, rawEvidence, ...extra
   }`. No interpretation happens here — just facts, with a timestamp and a
   named source so every claim is auditable back to where it came from.
2. **Scoring layer** — `lib/scoring.js`. Pure arithmetic over the evidence
   objects. No LLM call is anywhere near this file. Same evidence in, same
   score out, every time — see `lib/scoring.test.js` for tests that prove
   exactly that (`node api/aeo/lib/scoring.test.js`).
3. **Narrative layer** — `lib/narrative.js`. The ONLY place an LLM writes
   prose, and only for the paid tier. Its prompt context is restricted to
   the evidence JSON already gathered for that assessment (nothing else —
   no outside knowledge, no browsing). Every factual sentence it writes must
   cite the evidence checkId behind it (`[[checkId]]`), and
   `validateNarrative()` mechanically checks every citation resolves to real
   evidence before the text is ever shown to a user; a narrative that fails
   validation is regenerated (bounded retries) and, failing that, replaced
   by the same templated summary the free tier uses. The free tier has NO
   LLM call at all — `buildFreeTierSummary()` is plain string templating
   over evidence values, to keep free-tier cost near zero.

## Pipeline flow, end to end

**Free tier** (`run-free.js`, called by the public scorecard form):
1. Normalise the submitted domain.
2. Run all seven free checks in parallel, each wrapped in `lib/cache.js`'s
   `withCache()` so repeat lookups for the same domain within the cache TTL
   don't re-crawl from scratch.
3. Compute the three subscores we can evidence for free (Website Technical
   Readiness, Content & Answer Coverage, Entity & Brand Authority) with
   `lib/scoring.js`.
4. `computePartialScore()` renormalises just those three categories' weights
   to sum to 1 and returns a preview score — labelled explicitly as partial,
   never presented as the full 7-category score.
5. Build the templated (no-LLM) summary and return everything, plus an
   `upsell` block naming the price (config constant, see below) and which
   categories unlock on payment.

**Paid tier** (`run-paid.js`, called after Stripe checkout succeeds):
1. **Payment gate first, always.** `lib/payment-gate.js` calls the Stripe
   API to confirm the given Checkout Session is `payment_status: "paid"`
   and linked to this `assessmentId`. This is enforced in *every* paid check
   module too (`ai-panel.js`, `serp-visibility.js`, `places.js` each take a
   `paymentVerified` flag and throw `PaymentRequiredError` if it isn't
   `true`) — defense in depth, not "the orchestrator already checked so the
   check module can trust the caller."
2. Re-use (or freshly run) the cached free-tier technical/content evidence
   for the target domain.
3. Run the three paid checks for the target ONCE: `ai-panel.js` (the fixed
   prompt panel against OpenAI), `serp-visibility.js`, `places.js`.
4. Run the LIGHTER pipeline (`lib/competitor-pipeline.js`) against up to 5
   named competitors: technical + schema checks (cached per domain) + a
   citation/rank check, and pulls each competitor's AI-panel result out of
   the SAME shared panel call from step 3 rather than re-running the panel
   per competitor.
5. Compute all seven subscores, including Competitive Position as a
   percentile rank of the target against the competitor set (on the subset
   of categories both sides actually have evidence for — see
   `COMPARABLE_CATEGORIES` in `lib/competitor-pipeline.js`).
6. `computeOverallScore()` combines all seven with the adopted weights.
7. Generate the validated narrative (layer 3, above).
8. Return the full report: subscores, overall score, competitor comparison,
   narrative, and every evidence object gathered (full audit trail).

## Files

```
api/aeo/
  lib/
    config.js                constants: pricing, adopted scoring weights, AI
                              crawler bot list, crawl/cache bounds, AI-panel
                              prompt templates, EXCLUDED_BY_DESIGN notes
    evidence-utils.js         fetch/parsing helpers shared by every check
    cache.js                  cost-control cache (STUB — see below)
    scoring.js                pure scoring functions (layer 2)
    scoring.test.js            unit tests proving determinism
    payment-gate.js           Stripe payment verification, enforced in code
    narrative.js              paid-tier LLM narrative + citation validation
                              (layer 3) + free-tier templated summary
    competitor-pipeline.js    lighter pipeline for up to 5 named competitors

  robots-llms.js              FREE — robots.txt / llms.txt, per-bot analysis
  sitemap.js                  FREE — sitemap.xml presence/validity
  raw-vs-rendered.js          FREE — diff logic done, render step STUBBED
  schema-check.js             FREE — JSON-LD extraction + validation
  content-structure.js        FREE — headings, direct-answer, readability
  internal-links.js           FREE — bounded crawl (max 30 pages, depth 3)
  pagespeed.js                FREE — PageSpeed Insights, needs API key
  ai-panel.js                 PAID — THE CORE SIGNAL, needs OpenAI key
  serp-visibility.js          PAID — STUBBED, needs a SERP API key
  places.js                   PAID — STUBBED, needs Google Places key
  run-free.js                 free-tier orchestrator (evidence + score)
  run-paid.js                 paid-tier orchestrator (full report)
  README.md                  this file
```

## Environment variables a human needs to set before this goes live

| Variable | Used by | Required for |
|---|---|---|
| `OPENAI_API_KEY` | `ai-panel.js`, `lib/narrative.js` | THE core AI-panel signal, and the paid narrative. Nothing paid works without this. |
| `OPENAI_AI_PANEL_MODEL` (optional, defaults `gpt-4o`) | `ai-panel.js` | override the panel model |
| `OPENAI_NARRATIVE_MODEL` (optional, defaults `gpt-4o`) | `lib/narrative.js` | override the narrative model |
| `PAGESPEED_API_KEY` | `pagespeed.js` | free PageSpeed Insights quota — get one from Google Cloud Console |
| `STRIPE_SECRET_KEY` | `lib/payment-gate.js` | verifying payment before ANY paid check runs. Without this, paid checks fail closed (refuse to run), they do NOT silently assume payment. |
| `SERPAPI_KEY` | `serp-visibility.js` | organic rank / AI Overview / citation-count check (currently stubbed — see below) |
| `GOOGLE_PLACES_API_KEY` | `places.js` | review count/rating/NAP check (currently stubbed — see below) |
| `FIRECRAWL_API_KEY` | `raw-vs-rendered.js` | real headless-rendered HTML (currently stubbed — see below) |

None of these are hardcoded anywhere in this codebase. If a key is missing,
the relevant check returns a clearly-marked `available: false` evidence
object instead of throwing, so the rest of the pipeline still runs and
scoring.js just excludes that check's contribution.

## What's fully working vs. stubbed vs. needs a human decision

**Fully working right now (tested live against kindredsystems.com.au while
building this):**
- `robots-llms.js` — real fetch + parse, OAI-SearchBot checked separately
  from GPTBot as specified.
- `sitemap.js` — real fetch + XML validity + sitemap-index follow.
- `schema-check.js` — real JSON-LD extraction + validation, invalid-vs-
  absent distinction implemented.
- `content-structure.js` — real heading/word-count/readability/direct-
  answer detection.
- `internal-links.js` — real bounded crawl (capped at 30 pages / depth 3).
- `ai-panel.js` — real OpenAI integration + deterministic entity matching
  (fuzzy name matching, recommendation-heuristic scoring). Needs
  `OPENAI_API_KEY` to actually call the API, but every line of logic is
  real, not mocked.
- `lib/scoring.js` — fully implemented, unit-tested, deterministic.
- `lib/payment-gate.js` — real Stripe REST call; fails closed with no key.
- `lib/narrative.js` — real OpenAI call + citation-validation logic. Needs
  `OPENAI_API_KEY`.
- `run-free.js` / `run-paid.js` — real orchestration, tested end to end for
  the free tier.

**Stubbed — real integration code written, needs an API key to switch on:**
- `pagespeed.js` — needs `PAGESPEED_API_KEY`. The fetch + Lighthouse-result
  parsing is real; there's nothing left to build once the key exists.
- `serp-visibility.js` — needs `SERPAPI_KEY` (or swap the provider). The
  response-normalisation logic (`normaliseSerpApiResponse`) is written
  against SerpApi's documented shape; `fetchSerpResults()` itself throws a
  clear "not yet implemented" error until wired in.
- `places.js` — needs `GOOGLE_PLACES_API_KEY`. Same pattern:
  `checkNapConsistency()` is real logic, `fetchPlaceDetails()` is the one
  function to fill in.
- `raw-vs-rendered.js` — the **diff logic** (`diffContent()`) is fully real
  and is the part the spec calls out as most important to get right. The
  rendering step itself (`fetchRenderedHtml()`) has no headless browser
  available in this environment — needs Firecrawl (`FIRECRAWL_API_KEY`) or
  a Browserless/Chromium setup. Until then this check reports the raw-HTML
  facts honestly and marks the rendered comparison `unavailable` rather
  than faking a diff.

**Deliberately excluded by design, not missing by oversight:**
- No backlink/citation-data integration (e.g. DataForSEO Backlinks API).
  Explicitly dropped to control cost for this initial build — see
  `config.js` → `EXCLUDED_BY_DESIGN.backlinkIntegration`.
- Multi-engine AI panel (Gemini/Perplexity/Claude). `ai-panel.js` is
  OpenAI/ChatGPT only, a confirmed scope decision (~77% AI search/chat
  market share cited, and the business owner has an OpenAI account to test
  with). Extension point documented in `ai-panel.js` for adding another
  engine later without changing the scoring contract.

**Needs a human decision:**
- `PAID_REPORT_PRICE_CENTS` in `lib/config.js` is a placeholder (A$97,
  9700 cents) — **not yet finally confirmed by the business owner.** It's a
  single config constant, never hardcoded elsewhere, so changing the real
  price is a one-line edit.
- The free-tier partial-score design (renormalising weights across only the
  3 categories evidenced for free, rather than showing a "score out of 45%
  weight covered") was my call while building this — flagging it
  explicitly since it affects what number a free visitor actually sees. If
  the business wants a different free-tier presentation (e.g. show raw
  category scores with no combined number at all), that's a `run-free.js`
  change only, scoring.js doesn't need to move.
- `lib/cache.js` is an in-memory `Map` and is **not a real cache in
  production** — Vercel functions are stateless/short-lived, so this
  resets on every cold start and isn't shared across concurrent
  invocations. It exists to define the interface (`getCached` /
  `setCached` / `withCache`) the rest of the pipeline is written against.
  Before this goes live at any real volume, swap its body for Vercel KV or
  a Supabase table — every call site stays identical.
- The scoring weights in `lib/scoring.js`/`config.js` are the CURRENT,
  ADOPTED weights only. There's a proposed revision under real-world
  testing as of Sep 2026 that is NOT adopted — don't swap these out without
  an explicit go-ahead from the business owner.

## Request/response contracts for the front-end team

`POST /api/aeo/run-free` — body: `{ "domain": "example.com.au" }` — no auth,
this is the free public scorecard. Returns the shape documented at the top
of `run-free.js`.

`POST /api/aeo/run-paid` — body:
```json
{
  "assessmentId": "<the id returned by run-free>",
  "domain": "example.com.au",
  "businessName": "Example Pty Ltd",
  "industry": "plumbing",
  "service": "emergency plumbing",
  "location": "Brisbane",
  "competitors": [{ "name": "Acme Plumbing", "domain": "acmeplumbing.com.au" }],
  "stripeSessionId": "cs_test_..."
}
```
Fails with HTTP 402 if the Stripe session isn't a verified, paid session for
this `assessmentId`. Whoever builds the Stripe checkout / lead-form flow
needs to set `client_reference_id` (or `metadata.assessmentId`) on the
Checkout Session to this same `assessmentId` when creating it, so
`lib/payment-gate.js` can link the payment back to the right assessment.
