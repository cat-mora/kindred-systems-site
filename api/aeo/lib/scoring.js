// api/aeo/lib/scoring.js
//
// THE SCORING LAYER. Pure arithmetic over already-gathered evidence JSON.
// -----------------------------------------------------------------------
// No function in this file makes a network call, reads an env var, or asks
// an LLM anything. Every function here is a pure function: same evidence in,
// same score out, every single time. That determinism is what an
// LLM-narrative layer is explicitly NOT allowed to touch — the number on
// the scorecard must never come from a model's "judgement".
//
// Each computeXSubscore() function takes the relevant slice of the evidence
// array (as produced by the check modules in /api/aeo/*.js) and returns a
// number 0-100. computeOverallScore() combines the seven subscores using the
// CURRENT, ADOPTED weights from config.js.

'use strict';

const { SCORING_WEIGHTS } = require('./config');

function clamp(n, min = 0, max = 100) {
  if (Number.isNaN(n) || n === null || n === undefined) return 0;
  return Math.max(min, Math.min(max, n));
}

function average(numbers) {
  const valid = numbers.filter((n) => typeof n === 'number' && !Number.isNaN(n));
  if (valid.length === 0) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

// ---------------------------------------------------------------------------
// 1. AI Discoverability & Recommendation (25%)
// ---------------------------------------------------------------------------
// Input: the parsed ai-panel.js result for the TARGET business:
//   { promptsRun: number, mentions: number, firstMentionRankSum: number,
//     recommendedCount: number }
// (see ai-panel.js for exactly how "mentions" / "recommendedCount" are
// derived deterministically from the raw model responses)
function computeAIDiscoverabilitySubscore(aiPanelEvidence) {
  if (!aiPanelEvidence || !aiPanelEvidence.promptsRun) return 0;
  const { promptsRun, mentions, recommendedCount } = aiPanelEvidence;
  const mentionRate = mentions / promptsRun; // 0..1 — was the business named at all
  const recommendRate = recommendedCount / promptsRun; // 0..1 — was it *recommended*, not just named
  // Being actively recommended matters more than a passing mention.
  const score = mentionRate * 40 + recommendRate * 60; // already on a 0-100 scale
  return clamp(score);
}

// ---------------------------------------------------------------------------
// 2. Entity & Brand Authority (15%)
// ---------------------------------------------------------------------------
// Inputs: schema-check.js evidence + (paid tier) places.js evidence.
// Present-but-invalid schema is explicitly worse than absent schema, so it
// is scored below the "absent" baseline, not just "less good than valid".
function computeEntityAuthoritySubscore(schemaEvidence, placesEvidence) {
  let score = 0;
  if (schemaEvidence && Array.isArray(schemaEvidence.schemas)) {
    const total = schemaEvidence.schemas.length;
    if (total === 0) {
      score += 30; // absent: neutral-low baseline
    } else {
      const valid = schemaEvidence.schemas.filter((s) => s.valid).length;
      const invalid = total - valid;
      // valid schema is rewarded; invalid schema actively penalised below
      // the "absent" baseline of 30, per the spec's "worse case" rule.
      score += clamp(30 + valid * 15 - invalid * 20, 0, 100);
    }
  } else {
    score += 30;
  }

  if (placesEvidence && typeof placesEvidence.reviewCount === 'number') {
    const reviewScore = clamp((placesEvidence.reviewCount / 50) * 100); // 50+ reviews = full marks
    const ratingScore = placesEvidence.rating ? clamp((placesEvidence.rating / 5) * 100) : 0;
    const napScore = placesEvidence.napConsistent === false ? 0 : 100;
    score = average([score, reviewScore, ratingScore, napScore]);
  }

  return clamp(score);
}

// ---------------------------------------------------------------------------
// 3. Website Technical Readiness (15%)
// ---------------------------------------------------------------------------
// Inputs: robots-llms.js, sitemap.js, raw-vs-rendered.js, pagespeed.js
function computeTechnicalReadinessSubscore({ robotsLlms, sitemap, rawVsRendered, pagespeed }) {
  const parts = [];

  if (robotsLlms) {
    const bots = robotsLlms.botRules || {};
    const botIds = Object.keys(bots);
    if (botIds.length) {
      const blockedHighValue = bots['oai-searchbot'] && bots['oai-searchbot'].blockedEntirely;
      const openCount = botIds.filter((id) => !bots[id].blockedEntirely).length;
      let botScore = clamp((openCount / botIds.length) * 100);
      if (blockedHighValue) botScore = clamp(botScore - 40); // OAI-SearchBot is the one that matters most
      parts.push(botScore);
    }
    parts.push(robotsLlms.llmsTxtFound ? 100 : 40);
  }

  if (sitemap) {
    parts.push(sitemap.found && sitemap.valid ? 100 : sitemap.found ? 30 : 0);
  }

  if (rawVsRendered) {
    // Large gaps between raw HTML and rendered DOM mean crawlers that don't
    // execute JS (most AI crawlers) miss real content — bad for AEO.
    const gapRatio = rawVsRendered.gapScore; // 0 (no gap) .. 1 (huge gap), from raw-vs-rendered.js
    parts.push(clamp(100 - gapRatio * 100));
  }

  if (pagespeed && typeof pagespeed.mobileScore === 'number') {
    parts.push(clamp(pagespeed.mobileScore));
  }

  return clamp(average(parts));
}

// ---------------------------------------------------------------------------
// 4. Content & Answer Coverage (15%)
// ---------------------------------------------------------------------------
// Input: content-structure.js evidence
function computeContentCoverageSubscore(contentEvidence) {
  if (!contentEvidence) return 0;
  const parts = [];
  parts.push(contentEvidence.hasSingleH1 ? 100 : 40);
  parts.push(contentEvidence.headingHierarchyValid ? 100 : 40);
  parts.push(contentEvidence.hasDirectAnswerParagraph ? 100 : 20);
  parts.push(clamp((contentEvidence.listOrBulletCount || 0) * 20)); // up to 5 lists = full marks
  parts.push(clamp(((contentEvidence.wordCount || 0) / 800) * 100)); // 800+ words = full marks
  if (typeof contentEvidence.readabilityScore === 'number') {
    parts.push(clamp(contentEvidence.readabilityScore));
  }
  return clamp(average(parts));
}

// ---------------------------------------------------------------------------
// 5. Third-Party Authority & Citations (10%)
// ---------------------------------------------------------------------------
// Input: serp-visibility.js evidence (citingDomains, AI Overview presence).
// Deliberately does NOT include a backlink-profile metric — see
// config.js EXCLUDED_BY_DESIGN.backlinkIntegration.
function computeThirdPartyAuthoritySubscore(serpEvidence) {
  if (!serpEvidence) return 0;
  const citingDomainsScore = clamp(((serpEvidence.citingDomainCount || 0) / 10) * 100); // 10+ = full marks
  const aiOverviewScore = serpEvidence.aiOverviewMentionsBusiness ? 100 : serpEvidence.aiOverviewPresent ? 30 : 0;
  return clamp(average([citingDomainsScore, aiOverviewScore]));
}

// ---------------------------------------------------------------------------
// 6. Search Visibility, traditional (10%)
// ---------------------------------------------------------------------------
// Input: serp-visibility.js evidence (organic rank)
function computeSearchVisibilitySubscore(serpEvidence) {
  if (!serpEvidence || typeof serpEvidence.organicRank !== 'number' || serpEvidence.organicRank <= 0) {
    return 0;
  }
  // Rank 1 = 100, rank 10 = ~10, rank >20 = ~0. Simple, monotonic, deterministic.
  return clamp(100 - (serpEvidence.organicRank - 1) * 10);
}

// ---------------------------------------------------------------------------
// 7. Competitive Position (10%)
// ---------------------------------------------------------------------------
// Percentile rank of the target's overall (pre-competitive-position) score
// against the combined set of {target, competitors}. Pure statistics, no
// external call — competitor scores are computed the same way as the
// target's, just with the lighter pipeline (see competitor-pipeline.js).
function computeCompetitivePositionSubscore(targetPreCompetitiveScore, competitorScores) {
  const scores = Array.isArray(competitorScores) ? competitorScores.filter((n) => typeof n === 'number') : [];
  if (scores.length === 0) return 50; // no competitor data: neutral midpoint, not a penalty
  const beaten = scores.filter((s) => targetPreCompetitiveScore > s).length;
  const tied = scores.filter((s) => targetPreCompetitiveScore === s).length;
  const percentile = ((beaten + tied * 0.5) / scores.length) * 100;
  return clamp(percentile);
}

// ---------------------------------------------------------------------------
// Overall score
// ---------------------------------------------------------------------------
/**
 * @param {object} subscores - all seven 0-100 subscores, keyed exactly as
 *   in config.SCORING_WEIGHTS: aiDiscoverability, entityAuthority,
 *   technicalReadiness, contentCoverage, thirdPartyAuthority,
 *   searchVisibility, competitivePosition
 * @param {object} [weightsOverride] - only for testing; production callers
 *   must not pass this so the adopted weights are always used.
 */
function computeOverallScore(subscores, weightsOverride) {
  const weights = weightsOverride || SCORING_WEIGHTS;
  let total = 0;
  for (const key of Object.keys(weights)) {
    const sub = clamp(subscores[key]);
    total += sub * weights[key];
  }
  return Math.round(clamp(total) * 10) / 10; // one decimal place
}

/**
 * Renormalises a subset of weights to sum to 1, for the free tier where
 * several categories have no evidence yet (AI panel / SERP / Places /
 * competitive position are paid-only). Returns { score, includedCategories,
 * excludedCategories } so callers can be explicit with users about what the
 * free-tier number does and doesn't cover.
 */
function computePartialScore(subscores, includedKeys) {
  const includedWeights = {};
  let sum = 0;
  for (const key of includedKeys) {
    if (!(key in SCORING_WEIGHTS)) throw new Error(`Unknown scoring category: ${key}`);
    includedWeights[key] = SCORING_WEIGHTS[key];
    sum += SCORING_WEIGHTS[key];
  }
  if (sum === 0) throw new Error('At least one included category is required');
  const renormalised = {};
  for (const key of includedKeys) renormalised[key] = includedWeights[key] / sum;

  const score = computeOverallScore(subscores, renormalised);
  return {
    score,
    includedCategories: includedKeys,
    excludedCategories: Object.keys(SCORING_WEIGHTS).filter((k) => !includedKeys.includes(k)),
    renormalisedWeights: renormalised,
  };
}

module.exports = {
  clamp,
  average,
  computeAIDiscoverabilitySubscore,
  computeEntityAuthoritySubscore,
  computeTechnicalReadinessSubscore,
  computeContentCoverageSubscore,
  computeThirdPartyAuthoritySubscore,
  computeSearchVisibilitySubscore,
  computeCompetitivePositionSubscore,
  computeOverallScore,
  computePartialScore,
};
