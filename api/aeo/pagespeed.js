// api/aeo/pagespeed.js — FREE TIER, REAL INTEGRATION CODE, needs PAGESPEED_API_KEY
//
// Calls Google PageSpeed Insights API v5 (free tier, generous quota) for
// speed / mobile-friendliness / Core Web Vitals. The fetch/parsing below is
// a genuine working integration — it is only "stubbed" in the sense that it
// cannot be exercised in this environment without the API key.
//
// TODO: needs PAGESPEED_API_KEY env var set in Vercel before this check
// will return real data. Without it, the function returns a clearly-marked
// unavailable result rather than throwing, so the rest of the pipeline can
// still run and scoring.js just excludes this from the technical-readiness
// average (see lib/scoring.js computeTechnicalReadinessSubscore, which only
// pushes a pagespeed contribution when pagespeed.mobileScore is a number).

"use strict";

const { makeEvidence, normaliseDomain } = require("./lib/evidence-utils");

const PAGESPEED_API_BASE =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/**
 * Real PageSpeed Insights call. Requests the mobile strategy (most relevant
 * for local-business AEO — most "near me" style queries are mobile) and
 * pulls out the Lighthouse performance score plus Core Web Vitals field/lab
 * data that PSI exposes.
 */
async function fetchPageSpeed(url, apiKey, strategy = "mobile") {
  const params = new URLSearchParams({
    url,
    key: apiKey,
    strategy,
    category: "PERFORMANCE",
  });
  const res = await fetch(`${PAGESPEED_API_BASE}?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `PageSpeed Insights returned HTTP ${res.status}: ${body.slice(0, 300)}`,
    );
  }
  return res.json();
}

function parsePageSpeedResponse(data) {
  const lighthouse = data.lighthouseResult || {};
  const categories = lighthouse.categories || {};
  const audits = lighthouse.audits || {};

  const performanceScore = categories.performance
    ? Math.round(categories.performance.score * 100)
    : null;

  const cwv =
    data.loadingExperience && data.loadingExperience.metrics
      ? data.loadingExperience.metrics
      : {};

  return {
    performanceScore,
    coreWebVitals: {
      largestContentfulPaintMs: audits["largest-contentful-paint"]
        ? audits["largest-contentful-paint"].numericValue
        : null,
      cumulativeLayoutShift: audits["cumulative-layout-shift"]
        ? audits["cumulative-layout-shift"].numericValue
        : null,
      interactionToNextPaintMs: audits["interaction-to-next-paint"]
        ? audits["interaction-to-next-paint"].numericValue
        : null,
      totalBlockingTimeMs: audits["total-blocking-time"]
        ? audits["total-blocking-time"].numericValue
        : null,
    },
    fieldData: {
      lcpCategory: cwv.LARGEST_CONTENTFUL_PAINT_MS
        ? cwv.LARGEST_CONTENTFUL_PAINT_MS.category
        : null,
      clsCategory: cwv.CUMULATIVE_LAYOUT_SHIFT_SCORE
        ? cwv.CUMULATIVE_LAYOUT_SHIFT_SCORE.category
        : null,
    },
  };
}

async function checkPageSpeed(domainInput) {
  const origin = normaliseDomain(domainInput);
  const apiKey = process.env.PAGESPEED_API_KEY;

  if (!apiKey) {
    return makeEvidence(
      "pagespeed",
      "Google PageSpeed Insights API v5",
      {
        domain: origin,
        available: false,
        reason: "PAGESPEED_API_KEY not configured", // TODO: needs PAGESPEED_API_KEY env var
      },
      { mobileScore: null },
    );
  }

  try {
    const data = await fetchPageSpeed(origin, apiKey, "mobile");
    const parsed = parsePageSpeedResponse(data);
    return makeEvidence(
      "pagespeed",
      "Google PageSpeed Insights API v5",
      { domain: origin, available: true, strategy: "mobile", ...parsed },
      { mobileScore: parsed.performanceScore },
    );
  } catch (err) {
    return makeEvidence(
      "pagespeed",
      "Google PageSpeed Insights API v5",
      { domain: origin, available: false, reason: err.message },
      { mobileScore: null },
    );
  }
}

module.exports = async (req, res) => {
  const domain =
    req.method === "POST" ? req.body && req.body.domain : req.query.domain;
  if (!domain) {
    res
      .status(400)
      .json({ error: "domain is required (query param or JSON body field)" });
    return;
  }
  try {
    const evidence = await checkPageSpeed(domain);
    res.status(200).json(evidence);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports.checkPageSpeed = checkPageSpeed;
module.exports.parsePageSpeedResponse = parsePageSpeedResponse;
