// api/aeo/ai-panel.js — PAID TIER, fully working (needs OPENAI_API_KEY). THE CORE SIGNAL.
//
// Sends a FIXED panel of recommendation-style prompts to the OpenAI API
// (ChatGPT) ONLY, once each, and deterministically checks whether the
// target business and each named competitor were mentioned/recommended in
// the responses. This is the single most important evidence source in the
// whole product, so the two hard rules below are non-negotiable:
//
//   1. NO LLM call ever decides "did you recommend this business" by asking
//      a follow-up question. Every response is parsed with plain string/
//      fuzzy matching (see findEntityMentions below) — deterministic,
//      re-runnable, auditable.
//   2. Each of the fixed prompts runs EXACTLY ONCE per assessment. Both the
//      target and every named competitor are checked against that same
//      set of responses — we never multiply calls per competitor.
//
// SCOPE (confirmed decision, not an oversight): OpenAI/ChatGPT only for now.
// ~77% AI search/chat market share was the cited reason, and the business
// owner has an OpenAI account to test against. Gemini/Perplexity/Claude
// panel testing was explicitly dropped from this build. See EXTENSION POINT
// below for how to add another engine later without changing the scoring
// contract (each engine would just add its own evidence under the same
// aiPanel evidence shape, per-engine, and scoring.js averages across engines
// present).
//
// Enforced in code, not just documented: this file refuses to call OpenAI
// unless a verified Stripe payment has been passed in — see
// lib/payment-gate.js and the `paymentVerified` guard below.

"use strict";

const { AI_PANEL_PROMPT_TEMPLATES } = require("./lib/config");
const { makeEvidence } = require("./lib/evidence-utils");
const {
  requirePaidAccess,
  PaymentRequiredError,
} = require("./lib/payment-gate");

const OPENAI_API_BASE = "https://api.openai.com/v1";
const AI_PANEL_MODEL = process.env.OPENAI_AI_PANEL_MODEL || "gpt-4o";

// --- Deterministic entity matching (no LLM involved) ----------------------

const BUSINESS_SUFFIX_RE =
  /\b(pty ltd|pty\.? ltd\.?|ltd|llc|inc|co\.?|group|company)\b/gi;

function normaliseEntityName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(BUSINESS_SUFFIX_RE, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cheap Levenshtein distance for short strings (business names), no dependency. */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Finds every occurrence of `entityName` (normalised, fuzzy-tolerant) inside
 * `responseText`, and flags whether any occurrence reads as an active
 * recommendation rather than a passing mention.
 */
function findEntityMentions(responseText, entityName) {
  const normalisedName = normaliseEntityName(entityName);
  if (!normalisedName)
    return {
      mentioned: false,
      firstIndex: null,
      recommended: false,
      occurrences: 0,
    };

  const normalisedText = String(responseText || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");

  const occurrenceIndices = [];
  let searchFrom = 0;
  while (searchFrom <= normalisedText.length) {
    const idx = normalisedText.indexOf(normalisedName, searchFrom);
    if (idx === -1) break;
    occurrenceIndices.push(idx);
    searchFrom = idx + normalisedName.length;
  }

  // Fuzzy fallback for close variants (e.g. missing/extra word) when there's
  // no exact substring match: slide a window the length of the name across
  // the text and accept a low edit-distance-per-character as a match. Bounded
  // to short names/short-ish text to keep this cheap and predictable.
  let fuzzyMatch = false;
  if (occurrenceIndices.length === 0 && normalisedName.length <= 60) {
    const words = normalisedText.split(/\s+/);
    const nameWordCount = normalisedName.split(/\s+/).length;
    for (let i = 0; i <= words.length - nameWordCount; i += 1) {
      const windowText = words.slice(i, i + nameWordCount).join(" ");
      const distance = levenshtein(windowText, normalisedName);
      if (distance <= Math.max(1, Math.floor(normalisedName.length * 0.15))) {
        fuzzyMatch = true;
        break;
      }
    }
  }

  const mentioned = occurrenceIndices.length > 0 || fuzzyMatch;
  const firstIndex = occurrenceIndices.length > 0 ? occurrenceIndices[0] : null;

  // "Recommended" heuristic (deterministic, string-based — not an LLM call):
  // mentioned AND either (a) appears inside a numbered/bulleted list item,
  // or (b) appears within ~60 chars of a recommendation verb.
  const RECOMMEND_WORDS =
    /(recommend|suggest|consider|best|top|great choice|go with|check out|worth trying)/;
  let recommended = false;
  if (mentioned && firstIndex !== null) {
    const windowStart = Math.max(0, firstIndex - 60);
    const windowEnd = Math.min(
      normalisedText.length,
      firstIndex + normalisedName.length + 60,
    );
    const window = normalisedText.slice(windowStart, windowEnd);
    const inListItem = /(^|\n)\s*(\d+[.)]|[-*])\s/.test(
      String(responseText).slice(Math.max(0, firstIndex - 5), firstIndex + 5),
    );
    recommended = RECOMMEND_WORDS.test(window) || inListItem;
  }

  return {
    mentioned,
    firstIndex,
    recommended,
    occurrences: occurrenceIndices.length,
  };
}

// --- Prompt panel construction --------------------------------------------

function buildPromptPanel({ industry, service, location }) {
  return AI_PANEL_PROMPT_TEMPLATES.map((template) =>
    template
      .replace(/{industry}/g, industry || service || "business")
      .replace(/{service}/g, service || industry || "this service")
      .replace(/{location}/g, location || "my area"),
  );
}

// --- OpenAI call (each prompt runs exactly once) ---------------------------

async function callOpenAiOnce(prompt, apiKey) {
  const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AI_PANEL_MODEL,
      temperature: 0.7, // representative of a real user's default experience, not tuned for consistency
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `OpenAI AI-panel call failed: HTTP ${res.status} ${body.slice(0, 300)}`,
    );
  }
  const data = await res.json();
  return data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : "";
}

/**
 * Runs the full AI panel ONCE and checks the target + every named
 * competitor against the same response set.
 *
 * @param {object} input
 * @param {string} input.businessName
 * @param {string} [input.industry]
 * @param {string} [input.service]
 * @param {string} [input.location]
 * @param {string[]} [input.competitorNames]
 * @param {boolean} input.paymentVerified - MUST be true; caller obtains this
 *   from lib/payment-gate.requirePaidAccess() before calling this function.
 *   Extra defense-in-depth so this function can't accidentally be called
 *   for free from elsewhere in the codebase.
 */
async function runAiPanel(input) {
  if (input.paymentVerified !== true) {
    throw new PaymentRequiredError(
      "runAiPanel called without a verified payment — refusing to spend on OpenAI calls.",
    );
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured — cannot run the AI panel.",
    );
  }

  const prompts = buildPromptPanel(input);
  const responses = [];
  // Sequential, not parallel, on purpose: keeps us well inside OpenAI rate
  // limits for a panel this small, and makes failures easy to attribute to
  // a specific prompt.
  for (const prompt of prompts) {
    // eslint-disable-next-line no-await-in-loop
    const responseText = await callOpenAiOnce(prompt, apiKey);
    responses.push({ prompt, responseText });
  }

  const entities = [
    { name: input.businessName, role: "target" },
    ...(input.competitorNames || []).map((name) => ({
      name,
      role: "competitor",
    })),
  ];

  const perEntity = {};
  for (const entity of entities) {
    let mentions = 0;
    let recommendedCount = 0;
    const perPrompt = [];
    for (const { prompt, responseText } of responses) {
      const result = findEntityMentions(responseText, entity.name);
      if (result.mentioned) mentions += 1;
      if (result.recommended) recommendedCount += 1;
      perPrompt.push({ prompt, ...result });
    }
    perEntity[entity.name] = {
      role: entity.role,
      promptsRun: responses.length,
      mentions,
      recommendedCount,
      perPrompt,
    };
  }

  const rawEvidence = {
    engine: "openai-chatgpt",
    model: AI_PANEL_MODEL,
    promptsRun: responses.length,
    promptPanel: prompts,
    // Full raw responses kept for the narrative layer / audit trail, but
    // truncated defensively in case a response is unexpectedly huge.
    responses: responses.map((r) => ({
      prompt: r.prompt,
      responseText: r.responseText.slice(0, 4000),
    })),
    entities: perEntity,
  };

  // Top-level convenience fields for the TARGET only, matching exactly what
  // lib/scoring.js computeAIDiscoverabilitySubscore expects.
  const targetResult = perEntity[input.businessName];

  return makeEvidence(
    "ai-panel",
    "OpenAI (ChatGPT) chat completions, fixed prompt panel",
    rawEvidence,
    {
      promptsRun: targetResult.promptsRun,
      mentions: targetResult.mentions,
      recommendedCount: targetResult.recommendedCount,
    },
  );
}

// EXTENSION POINT for a future multi-engine panel (Gemini / Perplexity /
// Claude): add a sibling function per engine that returns the same shape
// (`{ engine, model, promptsRun, entities, ... }`), and have the
// orchestrator (run-paid.js) call each engine present and pass an array of
// results into a small aggregator that averages mentions/recommendedCount
// across engines before handing off to scoring.js. Deliberately not built
// yet — see config.js EXCLUDED_BY_DESIGN.multiEngineAiPanel.

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST required" });
    return;
  }
  const {
    businessName,
    industry,
    service,
    location,
    competitorNames,
    assessmentId,
    stripeSessionId,
  } = req.body || {};

  if (!businessName) {
    res.status(400).json({ error: "businessName is required" });
    return;
  }

  try {
    await requirePaidAccess(stripeSessionId, assessmentId);
    const evidence = await runAiPanel({
      businessName,
      industry,
      service,
      location,
      competitorNames,
      paymentVerified: true,
    });
    res.status(200).json(evidence);
  } catch (err) {
    const status = err instanceof PaymentRequiredError ? err.statusCode : 500;
    res.status(status).json({ error: err.message });
  }
};

module.exports.runAiPanel = runAiPanel;
module.exports.findEntityMentions = findEntityMentions;
module.exports.normaliseEntityName = normaliseEntityName;
module.exports.buildPromptPanel = buildPromptPanel;
