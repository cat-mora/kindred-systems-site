// api/aeo/lib/config.js
//
// Single source of truth for constants used across the AEO / AI Visibility
// Scorecard pipeline. Nothing in here is a secret — actual credentials come
// from environment variables (see /api/aeo/README.md for the full list).

'use strict';

// ---------------------------------------------------------------------------
// Pricing (business decision, not yet finally confirmed by the owner)
// ---------------------------------------------------------------------------
// Treat this as a config constant everywhere in the codebase — never hardcode
// "97" or "9700" directly in a check/handler. When the business confirms the
// real price, change it here only.
const PAID_REPORT_PRICE_CENTS = 9700; // TODO: confirm final price with business owner
const PAID_REPORT_CURRENCY = 'AUD';

// ---------------------------------------------------------------------------
// Scoring weights — CURRENT, ADOPTED weights only.
// ---------------------------------------------------------------------------
// There is a proposed revision of these weights under real-world testing as
// of Sep 2026, but it has NOT been adopted. Do not swap these out without an
// explicit instruction from the business owner. Must sum to 1.
const SCORING_WEIGHTS = Object.freeze({
  aiDiscoverability: 0.25, // AI Discoverability & Recommendation
  entityAuthority: 0.15, // Entity & Brand Authority
  technicalReadiness: 0.15, // Website Technical Readiness
  contentCoverage: 0.15, // Content & Answer Coverage
  thirdPartyAuthority: 0.10, // Third-Party Authority & Citations
  searchVisibility: 0.10, // Search Visibility (traditional)
  competitivePosition: 0.10, // Competitive Position
});

const WEIGHT_SUM = Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(WEIGHT_SUM - 1) > 1e-9) {
  // Fail loudly at import time rather than silently mis-scoring every report.
  throw new Error(`SCORING_WEIGHTS must sum to 1, got ${WEIGHT_SUM}`);
}

// ---------------------------------------------------------------------------
// AI crawler bots we check in robots.txt / llms.txt
// ---------------------------------------------------------------------------
// IMPORTANT nuance (confirmed by research, do not collapse these together):
//   - OAI-SearchBot governs ChatGPT Search crawling/citation — this is the
//     bot that matters for "does ChatGPT cite this site" style discoverability.
//   - GPTBot is mainly OpenAI's training-data crawler — a separate concern
//     (whether your content trains future models), not a search-citation
//     signal. Blocking GPTBot does NOT block ChatGPT Search citations.
// They are scored separately for exactly this reason — see scoring.js.
const AI_CRAWLER_BOTS = Object.freeze([
  {
    id: 'oai-searchbot',
    userAgent: 'OAI-SearchBot',
    purpose: 'search-citation',
    engine: 'ChatGPT Search',
    weightInScore: 'high', // this is the one that actually moves the needle
  },
  {
    id: 'gptbot',
    userAgent: 'GPTBot',
    purpose: 'training-data',
    engine: 'OpenAI (training)',
    weightInScore: 'low',
  },
  {
    id: 'claudebot',
    userAgent: 'ClaudeBot',
    purpose: 'training-data',
    engine: 'Anthropic (training)',
    weightInScore: 'low',
  },
  {
    id: 'claude-searchbot',
    userAgent: 'Claude-SearchBot',
    purpose: 'search-citation',
    engine: 'Claude (search/browsing)',
    weightInScore: 'medium',
  },
  {
    id: 'perplexitybot',
    userAgent: 'PerplexityBot',
    purpose: 'search-citation',
    engine: 'Perplexity',
    weightInScore: 'medium',
  },
  {
    id: 'google-extended',
    userAgent: 'Google-Extended',
    purpose: 'ai-features',
    engine: 'Google AI Overviews / Gemini',
    weightInScore: 'medium',
  },
  {
    id: 'ccbot',
    userAgent: 'CCBot',
    purpose: 'training-data',
    engine: 'Common Crawl (feeds many LLMs)',
    weightInScore: 'low',
  },
]);

// ---------------------------------------------------------------------------
// Crawl / cache bounds
// ---------------------------------------------------------------------------
const MAX_CRAWL_PAGES = 30;
const MAX_CRAWL_DEPTH = 3;
const FETCH_TIMEOUT_MS = 10000;
const CACHE_TTL_DAYS = 14; // "1-2 weeks" per spec

// ---------------------------------------------------------------------------
// Competitor comparison bounds
// ---------------------------------------------------------------------------
const MAX_COMPETITORS = 5;

// ---------------------------------------------------------------------------
// AI panel — fixed prompt panel sent to OpenAI only (see ai-panel.js for why)
// ---------------------------------------------------------------------------
// {industry}, {service}, {location} are filled in per-assessment. Keep this
// panel fixed across assessments so scores are comparable over time — do not
// let the LLM freely generate its own prompts.
const AI_PANEL_PROMPT_TEMPLATES = Object.freeze([
  'What are the best {industry} businesses in {location}?',
  'Who does {service} near {location}?',
  'Recommend a {service} business in {location}.',
  'I need {service} in {location}. Who should I use?',
  "What's a good {industry} company in {location} and why?",
  'Can you suggest a reliable {service} provider in {location}?',
  'Top-rated {industry} businesses in {location}?',
]);

// ---------------------------------------------------------------------------
// Explicitly excluded by design (not oversight) — see api/aeo/ai-panel.js
// and README for the full rationale.
// ---------------------------------------------------------------------------
const EXCLUDED_BY_DESIGN = Object.freeze({
  backlinkIntegration:
    'DataForSEO Backlinks API (or similar) is deliberately excluded from ' +
    'this build to control cost. Not missing by oversight.',
  multiEngineAiPanel:
    'Gemini/Perplexity/Claude AI-panel testing was explicitly dropped for ' +
    'the initial build. ChatGPT (OpenAI) only, ~77% AI search/chat market ' +
    'share cited as the reason. Extension point left in ai-panel.js.',
});

module.exports = {
  PAID_REPORT_PRICE_CENTS,
  PAID_REPORT_CURRENCY,
  SCORING_WEIGHTS,
  AI_CRAWLER_BOTS,
  MAX_CRAWL_PAGES,
  MAX_CRAWL_DEPTH,
  FETCH_TIMEOUT_MS,
  CACHE_TTL_DAYS,
  MAX_COMPETITORS,
  AI_PANEL_PROMPT_TEMPLATES,
  EXCLUDED_BY_DESIGN,
};
