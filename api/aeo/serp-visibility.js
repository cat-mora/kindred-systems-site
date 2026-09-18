// api/aeo/serp-visibility.js — PAID TIER, STUBBED (needs a SERP API key)
//
// Checks organic ranking, AI Overview presence, and citation count (distinct
// domains mentioning the business) for the business's core query. The real
// call is stubbed because no SerpApi/DataForSEO/Serper.dev key is available
// in this environment, but the request/response SHAPES below are the real
// integration contract — wire in fetchSerpResults() and this check works
// with zero changes anywhere else in the pipeline.
//
// TODO: needs SERPAPI_KEY (or DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD, or
// SERPER_API_KEY — pick one provider) env var before this returns real data.
//
// Gated the same way as every other paid check: refuses to run without a
// verified Stripe payment.
//
// Deliberately excluded from this build (see config.js EXCLUDED_BY_DESIGN):
// a backlink/citation-DATA integration (e.g. DataForSEO Backlinks API) is
// NOT part of serp-visibility or anywhere else in this codebase, by design,
// to control cost — not an oversight.

"use strict";

const { makeEvidence } = require("./lib/evidence-utils");
const {
  requirePaidAccess,
  PaymentRequiredError,
} = require("./lib/payment-gate");

/**
 * Real integration shape for SerpApi's Google Search endpoint (swap the
 * base URL/params for DataForSEO or Serper.dev if that's the provider
 * chosen instead — the parse function below expects a normalised shape,
 * see normaliseSerpApiResponse()).
 *
 * TODO: implement the real fetch once SERPAPI_KEY exists, e.g.:
 *   const params = new URLSearchParams({ engine: 'google', q: query, location, api_key: apiKey });
 *   const res = await fetch(`https://serpapi.com/search?${params}`);
 *   return res.json();
 */
async function fetchSerpResults(query, location, apiKey) {
  if (!apiKey) {
    return null; // signals "not configured" to the caller
  }
  // TODO: real implementation — see comment above.
  throw new Error(
    "serp-visibility fetchSerpResults() is not yet implemented — SERPAPI_KEY was provided but no provider call exists yet.",
  );
}

/**
 * Normalises whatever the chosen SERP provider returns into the shape
 * scoring.js expects: { organicRank, aiOverviewPresent,
 * aiOverviewMentionsBusiness, citingDomainCount, citingDomains }.
 *
 * Written against SerpApi's documented response shape
 * (organic_results[], ai_overview.references[]) as the reference
 * implementation; adjust the field paths if a different provider is used.
 */
function normaliseSerpApiResponse(raw, businessName, businessDomain) {
  const organicResults = (raw && raw.organic_results) || [];
  const normalisedDomain = String(businessDomain || "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "");
  const matchIndex = organicResults.findIndex((r) =>
    String(r.link || "").includes(normalisedDomain),
  );
  const organicRank = matchIndex >= 0 ? matchIndex + 1 : null;

  const aiOverview = raw && raw.ai_overview;
  const aiOverviewPresent = Boolean(aiOverview);
  const aiOverviewText = aiOverview ? String(aiOverview.text || "") : "";
  const aiOverviewMentionsBusiness =
    aiOverviewPresent && businessName
      ? aiOverviewText
          .toLowerCase()
          .includes(String(businessName).toLowerCase())
      : false;

  const citingDomains = new Set();
  if (aiOverview && Array.isArray(aiOverview.references)) {
    for (const ref of aiOverview.references) {
      try {
        citingDomains.add(new URL(ref.link).host.replace(/^www\./, ""));
      } catch {
        // ignore malformed reference URLs
      }
    }
  }

  return {
    organicRank,
    aiOverviewPresent,
    aiOverviewMentionsBusiness,
    citingDomainCount: citingDomains.size,
    citingDomains: Array.from(citingDomains),
  };
}

async function checkSerpVisibility({
  businessName,
  businessDomain,
  query,
  location,
  paymentVerified,
}) {
  if (paymentVerified !== true) {
    throw new PaymentRequiredError(
      "checkSerpVisibility called without a verified payment.",
    );
  }

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    return makeEvidence(
      "serp-visibility",
      "SERP API (SerpApi/DataForSEO/Serper.dev)",
      {
        available: false,
        reason: "SERPAPI_KEY not configured", // TODO: needs SERPAPI_KEY env var
        query,
        location,
      },
      {
        organicRank: null,
        aiOverviewPresent: false,
        aiOverviewMentionsBusiness: false,
        citingDomainCount: 0,
      },
    );
  }

  try {
    const raw = await fetchSerpResults(query, location, apiKey);
    const parsed = normaliseSerpApiResponse(raw, businessName, businessDomain);
    return makeEvidence(
      "serp-visibility",
      "SerpApi Google Search",
      { available: true, query, location, raw: null, ...parsed },
      parsed,
    );
  } catch (err) {
    return makeEvidence(
      "serp-visibility",
      "SERP API (SerpApi/DataForSEO/Serper.dev)",
      { available: false, reason: err.message, query, location },
      {
        organicRank: null,
        aiOverviewPresent: false,
        aiOverviewMentionsBusiness: false,
        citingDomainCount: 0,
      },
    );
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST required" });
    return;
  }
  const {
    businessName,
    businessDomain,
    query,
    location,
    assessmentId,
    stripeSessionId,
  } = req.body || {};
  if (!businessName || !query) {
    res.status(400).json({ error: "businessName and query are required" });
    return;
  }
  try {
    await requirePaidAccess(stripeSessionId, assessmentId);
    const evidence = await checkSerpVisibility({
      businessName,
      businessDomain,
      query,
      location,
      paymentVerified: true,
    });
    res.status(200).json(evidence);
  } catch (err) {
    const status = err instanceof PaymentRequiredError ? err.statusCode : 500;
    res.status(status).json({ error: err.message });
  }
};

module.exports.checkSerpVisibility = checkSerpVisibility;
module.exports.normaliseSerpApiResponse = normaliseSerpApiResponse;
module.exports.fetchSerpResults = fetchSerpResults;
