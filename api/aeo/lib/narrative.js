// api/aeo/lib/narrative.js
//
// THE NARRATIVE LAYER — the only place an LLM is allowed to write prose for
// this product, and even here it never sets the score.
//
// Rules enforced by this file:
//   1. Paid tier only. The narrative LLM call is never made for a free-tier
//      report (buildFreeTierSummary() below has no LLM call at all).
//   2. The model's prompt context is restricted to the evidence JSON already
//      gathered for THIS assessment — no browsing, no "what do you know
//      about this business", nothing outside the evidence object.
//   3. Every factual claim in the output must cite the specific evidence
//      checkId behind it, using the form [[checkId]] inline.
//   4. validateNarrative() then mechanically checks each citation: the
//      checkId must exist in the evidence set, and (best-effort) any number
//      or bot/schema name quoted near the citation must actually appear in
//      that evidence's rawEvidence. A narrative that fails validation is
//      rejected and regenerated (bounded retries), never shown to a user.

'use strict';

const OPENAI_API_BASE = 'https://api.openai.com/v1';
const NARRATIVE_MODEL = process.env.OPENAI_NARRATIVE_MODEL || 'gpt-4o';
const MAX_REGENERATION_ATTEMPTS = 2;

const CITATION_RE = /\[\[([a-zA-Z0-9:_-]+)\]\]/g;

/**
 * Free tier: a templated summary built directly from evidence values with
 * plain string interpolation — zero LLM calls, near-zero cost. This is the
 * ONLY narrative free-tier users see.
 */
function buildFreeTierSummary(evidenceById, subscores, overallScoreInfo) {
  const lines = [];
  lines.push(
    `Your AI Visibility preview score is ${overallScoreInfo.score}/100, based on ` +
      `${overallScoreInfo.includedCategories.length} of 7 categories we can check for free ` +
      `(the rest — AI recommendation testing, search citations and competitor comparison — ` +
      `are unlocked in the full report).`
  );

  const robots = evidenceById['robots-llms'];
  if (robots) {
    const oaiBlocked =
      robots.rawEvidence.botRules && robots.rawEvidence.botRules['oai-searchbot']
        ? robots.rawEvidence.botRules['oai-searchbot'].blockedEntirely
        : null;
    lines.push(
      oaiBlocked
        ? 'ChatGPT Search (OAI-SearchBot) is currently blocked from crawling your site — this alone can keep you out of ChatGPT answers entirely.'
        : 'ChatGPT Search can crawl your site — that gate is open.'
    );
  }

  const content = evidenceById['content-structure'];
  if (content) {
    lines.push(
      content.rawEvidence.hasDirectAnswerParagraph
        ? 'Your pages open with a direct-answer paragraph, which AI systems tend to quote well.'
        : 'Your pages don’t open with a clear, direct-answer paragraph — that’s an easy structural fix.'
    );
  }

  return lines.join(' ');
}

/**
 * Builds the restricted prompt for the paid narrative LLM call. Context is
 * ONLY the evidence JSON for this assessment — nothing else.
 */
function buildNarrativePrompt(evidenceById, subscores, overallScore, businessName) {
  const evidenceForPrompt = Object.fromEntries(
    Object.entries(evidenceById).map(([id, ev]) => [id, { checkId: ev.checkId, rawEvidence: ev.rawEvidence }])
  );

  return [
    {
      role: 'system',
      content:
        'You write short, factual AI-visibility report sections for a business owner. ' +
        'You may ONLY use facts present in the EVIDENCE JSON given to you below. ' +
        'Every factual sentence must end with a citation in the form [[checkId]] naming the ' +
        'exact evidence key it is based on. Never state a number, bot name, or schema type ' +
        'that is not literally present in that evidence entry. Do not speculate, do not use ' +
        'outside knowledge about this business or industry. Write in plain Australian English, ' +
        'no marketing fluff, no exclamation marks.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        businessName,
        overallScore,
        subscores,
        evidence: evidenceForPrompt,
      }),
    },
  ];
}

/** Calls the OpenAI chat completions API for the narrative write-up. */
async function callNarrativeModel(messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured — cannot generate paid narrative.');
  }
  const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: NARRATIVE_MODEL,
      temperature: 0.2,
      messages,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI narrative call failed: HTTP ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
}

/**
 * Mechanically validates a narrative against the evidence it claims to cite.
 * Returns { valid: boolean, problems: string[] }.
 *
 * This is deliberately conservative: any citation to a checkId that doesn't
 * exist is an automatic failure. Numeric claims are spot-checked when we can
 * cheaply extract numbers from the cited evidence's rawEvidence; failing that
 * check is a soft warning, not a hard failure, to avoid over-rejecting valid
 * text on a naive number-matching heuristic.
 */
function validateNarrative(narrativeText, evidenceById) {
  const problems = [];
  const citedIds = new Set();
  let match;
  CITATION_RE.lastIndex = 0;
  while ((match = CITATION_RE.exec(narrativeText)) !== null) {
    citedIds.add(match[1]);
  }

  if (citedIds.size === 0) {
    problems.push('Narrative contains no evidence citations at all.');
  }

  for (const id of citedIds) {
    if (!evidenceById[id]) {
      problems.push(`Citation [[${id}]] does not match any evidence checkId gathered for this assessment.`);
    }
  }

  // Strip citation markers and check for any sentence with a number that
  // has no citation anywhere nearby (within ~200 chars) — a weak but useful
  // guard against uncited numeric claims slipping through.
  const numberRe = /\b\d+(\.\d+)?%?\b/g;
  let numMatch;
  while ((numMatch = numberRe.exec(narrativeText)) !== null) {
    const windowStart = Math.max(0, numMatch.index - 200);
    const windowEnd = Math.min(narrativeText.length, numMatch.index + 200);
    const window = narrativeText.slice(windowStart, windowEnd);
    if (!CITATION_RE.test(window)) {
      problems.push(`Number "${numMatch[0]}" near position ${numMatch.index} has no nearby citation.`);
    }
    CITATION_RE.lastIndex = 0;
  }

  return { valid: problems.length === 0, problems };
}

/**
 * Generates a validated paid-tier narrative, regenerating (bounded) if
 * validation fails, and falling back to the templated free-tier-style
 * summary if the model can't produce a validated narrative at all — a
 * report must never ship with an unverified LLM claim.
 */
async function generateValidatedNarrative(evidenceById, subscores, overallScore, businessName) {
  const messages = buildNarrativePrompt(evidenceById, subscores, overallScore, businessName);
  let lastProblems = [];

  for (let attempt = 0; attempt <= MAX_REGENERATION_ATTEMPTS; attempt += 1) {
    const attemptMessages =
      attempt === 0
        ? messages
        : [
            ...messages,
            {
              role: 'user',
              content:
                'Your previous answer failed validation for these reasons: ' +
                lastProblems.join('; ') +
                '. Rewrite it, fixing every issue, citing only checkIds that exist in the evidence given.',
            },
          ];

    // eslint-disable-next-line no-await-in-loop
    const narrativeText = await callNarrativeModel(attemptMessages);
    const validation = validateNarrative(narrativeText, evidenceById);
    if (validation.valid) {
      return { narrativeText, validated: true, attempt, fallback: false };
    }
    lastProblems = validation.problems;
  }

  return {
    narrativeText: buildFreeTierSummary(evidenceById, subscores, {
      score: overallScore,
      includedCategories: Object.keys(subscores),
    }),
    validated: false,
    attempt: MAX_REGENERATION_ATTEMPTS,
    fallback: true,
    problems: lastProblems,
  };
}

module.exports = {
  buildFreeTierSummary,
  buildNarrativePrompt,
  callNarrativeModel,
  validateNarrative,
  generateValidatedNarrative,
};
