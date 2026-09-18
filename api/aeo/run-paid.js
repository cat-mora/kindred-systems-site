// api/aeo/run-paid.js — PAID TIER ORCHESTRATOR
//
// Enforced payment gate: this handler refuses to do any paid-cost work
// (OpenAI, SERP, Places, competitor pipeline) unless lib/payment-gate
// confirms the given Stripe Checkout Session is actually paid_status=paid
// and linked to this assessmentId. This check happens here AND again inside
// every individual paid check module (ai-panel.js, serp-visibility.js,
// places.js) — defense in depth, not "trust the caller".
//
// Request:  POST {
//   assessmentId, domain, businessName, industry, service, location,
//   competitors: [{ name, domain }, ...]  (capped at 5),
//   stripeSessionId
// }
// Response: full report — free-tier evidence (re-used from cache where
//   possible) + paid evidence + the full 7-category weighted score +
//   competitor comparison + a validated LLM narrative.

'use strict';

const { normaliseDomain } = require('./lib/evidence-utils');
const { withCache } = require('./lib/cache');
const { requirePaidAccess, PaymentRequiredError } = require('./lib/payment-gate');
const { MAX_COMPETITORS } = require('./lib/config');
const {
  computeTechnicalReadinessSubscore,
  computeContentCoverageSubscore,
  computeEntityAuthoritySubscore,
  computeAIDiscoverabilitySubscore,
  computeThirdPartyAuthoritySubscore,
  computeSearchVisibilitySubscore,
  computeCompetitivePositionSubscore,
  computeOverallScore,
  computePartialScore,
} = require('./lib/scoring');
const { generateValidatedNarrative } = require('./lib/narrative');

const { checkRobotsAndLlms } = require('./robots-llms');
const { checkSitemap } = require('./sitemap');
const { checkRawVsRendered } = require('./raw-vs-rendered');
const { checkSchema } = require('./schema-check');
const { checkContentStructure } = require('./content-structure');
const { checkInternalLinks } = require('./internal-links');
const { checkPageSpeed } = require('./pagespeed');
const { runAiPanel } = require('./ai-panel');
const { checkSerpVisibility } = require('./serp-visibility');
const { checkPlaces } = require('./places');
const { runCompetitorComparison, COMPARABLE_CATEGORIES } = require('./lib/competitor-pipeline');

async function runPaidPipeline(input) {
  const {
    assessmentId,
    domain: domainInput,
    businessName,
    industry,
    service,
    location,
    competitors,
    stripeSessionId,
    expectedNap,
  } = input;

  if (!businessName) throw new Error('businessName is required');
  if (!domainInput) throw new Error('domain is required');

  // Hard gate. Throws PaymentRequiredError (HTTP 402) if not verified.
  await requirePaidAccess(stripeSessionId, assessmentId);

  const domain = normaliseDomain(domainInput);
  const cappedCompetitors = (competitors || []).slice(0, MAX_COMPETITORS);
  const searchQuery = `${service || industry || 'business'} ${location || ''}`.trim();

  // Re-use (or freshly run, if not cached / cache expired) the same
  // technical + content evidence the free tier already gathered for this
  // domain, rather than re-crawling from scratch.
  const [robotsLlms, sitemap, rawVsRendered, schema, content, internalLinks, pagespeed] = await Promise.all([
    withCache(domain, 'robots-llms', () => checkRobotsAndLlms(domain)),
    withCache(domain, 'sitemap', () => checkSitemap(domain)),
    withCache(domain, 'raw-vs-rendered', () => checkRawVsRendered(domain)),
    withCache(domain, 'schema-check', () => checkSchema(domain)),
    withCache(domain, 'content-structure', () => checkContentStructure(domain)),
    withCache(domain, 'internal-links', () => checkInternalLinks(domain)),
    withCache(domain, 'pagespeed', () => checkPageSpeed(domain)),
  ]);

  // Paid checks for the TARGET. ai-panel is called once here and its
  // `entities` map already contains every named competitor's mentions —
  // the competitor pipeline below reuses that instead of re-running it.
  const [aiPanel, serp, places] = await Promise.all([
    runAiPanel({
      businessName,
      industry,
      service,
      location,
      competitorNames: cappedCompetitors.map((c) => c.name),
      paymentVerified: true,
    }),
    checkSerpVisibility({ businessName, businessDomain: domain, query: searchQuery, location, paymentVerified: true }),
    checkPlaces({ businessName, location, expectedNap, paymentVerified: true }),
  ]);

  const competitorComparison = await runCompetitorComparison(
    cappedCompetitors,
    aiPanel.rawEvidence.entities,
    searchQuery,
    location
  );

  const subscores = {
    aiDiscoverability: computeAIDiscoverabilitySubscore(aiPanel),
    entityAuthority: computeEntityAuthoritySubscore(schema.rawEvidence, places.rawEvidence),
    technicalReadiness: computeTechnicalReadinessSubscore({
      robotsLlms: robotsLlms.rawEvidence,
      sitemap: sitemap.rawEvidence,
      rawVsRendered: { gapScore: rawVsRendered.gapScore },
      pagespeed: { mobileScore: pagespeed.mobileScore },
    }),
    contentCoverage: computeContentCoverageSubscore(content.rawEvidence),
    thirdPartyAuthority: computeThirdPartyAuthoritySubscore(serp.rawEvidence),
    searchVisibility: computeSearchVisibilitySubscore(serp.rawEvidence),
    // Filled in below once we have the comparable-score percentile.
    competitivePosition: 50,
  };

  // Competitive Position: percentile rank of the target across the SAME
  // comparable-category subset used for competitors (no content-structure/
  // places data exists for competitors, so it would be unfair to include
  // those in the comparison — see lib/competitor-pipeline.js).
  const targetComparableScore = computePartialScore(subscores, COMPARABLE_CATEGORIES).score;
  const competitorComparableScores = competitorComparison.competitors.map((c) => c.comparableScore);
  subscores.competitivePosition = computeCompetitivePositionSubscore(targetComparableScore, competitorComparableScores);

  const overallScore = computeOverallScore(subscores);

  const evidenceById = {
    'robots-llms': robotsLlms,
    sitemap,
    'raw-vs-rendered': rawVsRendered,
    'schema-check': schema,
    'content-structure': content,
    'internal-links': internalLinks,
    pagespeed,
    'ai-panel': aiPanel,
    'serp-visibility': serp,
    places,
  };

  const narrative = await generateValidatedNarrative(evidenceById, subscores, overallScore, businessName);

  return {
    assessmentId,
    domain,
    businessName,
    generatedAtISO: new Date().toISOString(),
    tier: 'paid',
    overallScore,
    subscores,
    competitivePosition: {
      targetComparableScore,
      competitors: competitorComparison.competitors.map((c) => ({
        name: c.name,
        domain: c.domain,
        comparableScore: c.comparableScore,
      })),
      comparableCategories: COMPARABLE_CATEGORIES,
    },
    narrative,
    evidence: evidenceById,
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST required' });
    return;
  }
  try {
    const report = await runPaidPipeline(req.body || {});
    res.status(200).json(report);
  } catch (err) {
    const status = err instanceof PaymentRequiredError ? err.statusCode : 500;
    res.status(status).json({ error: err.message });
  }
};

module.exports.runPaidPipeline = runPaidPipeline;
