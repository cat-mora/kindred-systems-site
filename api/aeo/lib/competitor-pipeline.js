// api/aeo/lib/competitor-pipeline.js
//
// Runs the LIGHTER pipeline against up to MAX_COMPETITORS named competitors
// once payment has succeeded: technical checks (robots/llms + schema) +
// citation check (serp-visibility) + the AI-panel data that was ALREADY
// gathered for these competitors in the single shared ai-panel.js call
// (never re-run the AI panel per competitor — see ai-panel.js header).
// No narrative is generated for competitors.
//
// Technical checks are cached per domain (lib/cache.js) so a competitor
// domain that shows up across multiple client assessments isn't re-crawled
// from scratch every time.

'use strict';

const { MAX_COMPETITORS } = require('./config');
const { withCache } = require('./cache');
const { computePartialScore } = require('./scoring');
const { checkRobotsAndLlms } = require('../robots-llms');
const { checkSchema } = require('../schema-check');
const { checkSerpVisibility } = require('../serp-visibility');

// Categories we can fairly compare target vs. competitor on with the LIGHT
// pipeline (no content-structure or places data is gathered for
// competitors, and competitivePosition doesn't apply to itself).
const COMPARABLE_CATEGORIES = [
  'aiDiscoverability',
  'entityAuthority',
  'technicalReadiness',
  'thirdPartyAuthority',
  'searchVisibility',
];

const {
  computeAIDiscoverabilitySubscore,
  computeEntityAuthoritySubscore,
  computeTechnicalReadinessSubscore,
  computeThirdPartyAuthoritySubscore,
  computeSearchVisibilitySubscore,
} = require('./scoring');

/**
 * Runs the light pipeline for one competitor and returns its comparable
 * subscores + overall comparable score (renormalised across
 * COMPARABLE_CATEGORIES only).
 *
 * @param {{name: string, domain: string}} competitor
 * @param {object} sharedAiPanelEntity - this competitor's slice of the
 *   ai-panel.js `entities` map from the ONE shared panel call already made
 *   for the target assessment.
 */
async function runLightPipelineForCompetitor(competitor, sharedAiPanelEntity, query, location) {
  const [robotsLlms, schema, serp] = await Promise.all([
    withCache(competitor.domain, 'robots-llms', () => checkRobotsAndLlms(competitor.domain)),
    withCache(competitor.domain, 'schema-check', () => checkSchema(competitor.domain)),
    // Citation/search-visibility check does cost real money per competitor
    // (capped at MAX_COMPETITORS for exactly that reason) so it is NOT
    // cached the same way technical checks are — rankings move day to day.
    checkSerpVisibility({
      businessName: competitor.name,
      businessDomain: competitor.domain,
      query,
      location,
      paymentVerified: true,
    }),
  ]);

  const subscores = {
    aiDiscoverability: computeAIDiscoverabilitySubscore(
      sharedAiPanelEntity || { promptsRun: 0, mentions: 0, recommendedCount: 0 }
    ),
    entityAuthority: computeEntityAuthoritySubscore(schema.rawEvidence, null),
    technicalReadiness: computeTechnicalReadinessSubscore({ robotsLlms: robotsLlms.rawEvidence }),
    thirdPartyAuthority: computeThirdPartyAuthoritySubscore(serp.rawEvidence),
    searchVisibility: computeSearchVisibilitySubscore(serp.rawEvidence),
  };

  const comparable = computePartialScore(subscores, COMPARABLE_CATEGORIES);

  return {
    name: competitor.name,
    domain: competitor.domain,
    evidence: { robotsLlms, schema, serp },
    subscores,
    comparableScore: comparable.score,
  };
}

/**
 * @param {Array<{name: string, domain: string}>} competitors - capped at MAX_COMPETITORS
 * @param {object} sharedAiPanelEntities - the full `entities` map from the
 *   single shared ai-panel.js call for this assessment (target + all named
 *   competitors), keyed by business name.
 */
async function runCompetitorComparison(competitors, sharedAiPanelEntities, query, location) {
  const capped = (competitors || []).slice(0, MAX_COMPETITORS);
  const results = [];
  for (const competitor of capped) {
    // Sequential to keep paid-API concurrency predictable and easy to
    // reason about/rate-limit; MAX_COMPETITORS keeps this bounded anyway.
    // eslint-disable-next-line no-await-in-loop
    const result = await runLightPipelineForCompetitor(
      competitor,
      sharedAiPanelEntities ? sharedAiPanelEntities[competitor.name] : null,
      query,
      location
    );
    results.push(result);
  }
  return { competitors: results, comparableCategories: COMPARABLE_CATEGORIES };
}

module.exports = {
  COMPARABLE_CATEGORIES,
  runLightPipelineForCompetitor,
  runCompetitorComparison,
};
