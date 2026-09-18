// api/aeo/run-free.js — FREE TIER ORCHESTRATOR
//
// Runs every free check for the target domain, computes a renormalised
// partial score (only the categories the free tier can actually evidence),
// and builds a templated (non-LLM) summary. This is the endpoint the public
// scorecard form on the hub page should call.
//
// Request:  POST { domain: "example.com.au" }
// Response: {
//   assessmentId, domain, generatedAtISO,
//   score: { score, includedCategories, excludedCategories },
//   subscores: { technicalReadiness, contentCoverage, entityAuthority },
//   summary: "<templated string, no LLM call>",
//   evidence: { <checkId>: <evidence object>, ... },
//   upsell: { priceCents, currency, categoriesUnlocked }
// }

"use strict";

const crypto = require("crypto");
const { withCache } = require("./lib/cache");
const { normaliseDomain } = require("./lib/evidence-utils");
const {
  computeTechnicalReadinessSubscore,
  computeContentCoverageSubscore,
  computeEntityAuthoritySubscore,
  computePartialScore,
} = require("./lib/scoring");
const { buildFreeTierSummary } = require("./lib/narrative");
const {
  PAID_REPORT_PRICE_CENTS,
  PAID_REPORT_CURRENCY,
} = require("./lib/config");

const { checkRobotsAndLlms } = require("./robots-llms");
const { checkSitemap } = require("./sitemap");
const { checkRawVsRendered } = require("./raw-vs-rendered");
const { checkSchema } = require("./schema-check");
const { checkContentStructure } = require("./content-structure");
const { checkInternalLinks } = require("./internal-links");
const { checkPageSpeed } = require("./pagespeed");

const FREE_INCLUDED_CATEGORIES = [
  "technicalReadiness",
  "contentCoverage",
  "entityAuthority",
];

async function runFreePipeline(domainInput) {
  const domain = normaliseDomain(domainInput);
  const assessmentId = crypto.randomUUID();

  // Technical checks are cached per-domain (see lib/cache.js) so re-running
  // a scorecard for the same domain within the TTL window doesn't re-crawl
  // from scratch. Content/internal-links are cached too since they only
  // change when the site changes, not per visitor.
  const [
    robotsLlms,
    sitemap,
    rawVsRendered,
    schema,
    content,
    internalLinks,
    pagespeed,
  ] = await Promise.all([
    withCache(domain, "robots-llms", () => checkRobotsAndLlms(domain)),
    withCache(domain, "sitemap", () => checkSitemap(domain)),
    withCache(domain, "raw-vs-rendered", () => checkRawVsRendered(domain)),
    withCache(domain, "schema-check", () => checkSchema(domain)),
    withCache(domain, "content-structure", () => checkContentStructure(domain)),
    withCache(domain, "internal-links", () => checkInternalLinks(domain)),
    withCache(domain, "pagespeed", () => checkPageSpeed(domain)),
  ]);

  const evidenceById = {
    "robots-llms": robotsLlms,
    sitemap,
    "raw-vs-rendered": rawVsRendered,
    "schema-check": schema,
    "content-structure": content,
    "internal-links": internalLinks,
    pagespeed,
  };

  const subscores = {
    technicalReadiness: computeTechnicalReadinessSubscore({
      robotsLlms: robotsLlms.rawEvidence,
      sitemap: sitemap.rawEvidence,
      rawVsRendered: { gapScore: rawVsRendered.gapScore },
      pagespeed: { mobileScore: pagespeed.mobileScore },
    }),
    contentCoverage: computeContentCoverageSubscore(content.rawEvidence),
    entityAuthority: computeEntityAuthoritySubscore(schema.rawEvidence, null),
  };

  const scoreInfo = computePartialScore(subscores, FREE_INCLUDED_CATEGORIES);
  const summary = buildFreeTierSummary(evidenceById, subscores, scoreInfo);

  return {
    assessmentId,
    domain,
    generatedAtISO: new Date().toISOString(),
    tier: "free",
    score: scoreInfo,
    subscores,
    summary,
    evidence: evidenceById,
    upsell: {
      priceCents: PAID_REPORT_PRICE_CENTS, // TODO: confirm final price with business owner
      currency: PAID_REPORT_CURRENCY,
      categoriesUnlocked: scoreInfo.excludedCategories,
    },
  };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST required" });
    return;
  }
  const { domain } = req.body || {};
  if (!domain) {
    res.status(400).json({ error: "domain is required" });
    return;
  }
  try {
    const report = await runFreePipeline(domain);
    res.status(200).json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports.runFreePipeline = runFreePipeline;
module.exports.FREE_INCLUDED_CATEGORIES = FREE_INCLUDED_CATEGORIES;
