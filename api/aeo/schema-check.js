// api/aeo/schema-check.js — FREE TIER, fully working (no external API keys needed)
//
// Extracts JSON-LD blocks and validates them against a minimal required-
// field set for the schema.org types this product cares about most for
// local-business AEO: Organization, LocalBusiness, FAQPage, Product, Review.
//
// IMPORTANT: schema that is PRESENT but INVALID is flagged as a distinct,
// worse case than schema being absent entirely (broken markup can actively
// confuse AI crawlers/parsers, where no markup at all is just "no signal").
// See lib/scoring.js computeEntityAuthoritySubscore for how that's scored.

'use strict';

const { makeEvidence, safeFetchText, normaliseDomain, extractJsonLdBlocks } = require('./lib/evidence-utils');

// Minimal required-field sets — intentionally conservative (schema.org's
// own "required" fields for rich-result eligibility), not the full spec.
const REQUIRED_FIELDS = {
  Organization: ['name'],
  LocalBusiness: ['name', 'address'],
  FAQPage: ['mainEntity'],
  Product: ['name'],
  Review: ['reviewRating', 'author'],
};

const SUPPORTED_TYPES = Object.keys(REQUIRED_FIELDS);

function typesOf(node) {
  if (!node || !node['@type']) return [];
  return Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
}

/** Flattens a JSON-LD document into a list of individual typed nodes, including @graph. */
function flattenJsonLdNodes(parsed) {
  const nodes = [];
  const items = Array.isArray(parsed) ? parsed : [parsed];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    if (Array.isArray(item['@graph'])) {
      nodes.push(...item['@graph']);
    } else {
      nodes.push(item);
    }
  }
  return nodes;
}

function validateNode(node) {
  const types = typesOf(node).filter((t) => SUPPORTED_TYPES.includes(t));
  if (types.length === 0) return null; // not a type we score — ignore, not "invalid"

  const missingByType = {};
  let anyValid = false;
  for (const type of types) {
    const required = REQUIRED_FIELDS[type] || [];
    const missing = required.filter((field) => node[field] === undefined || node[field] === null || node[field] === '');
    missingByType[type] = missing;
    if (missing.length === 0) anyValid = true;
  }

  return {
    types,
    valid: anyValid,
    missingByType,
  };
}

async function checkSchema(domainInput) {
  const origin = normaliseDomain(domainInput);
  const pageRes = await safeFetchText(origin);

  const schemas = [];
  let parseErrors = 0;

  if (pageRes.ok) {
    const blocks = extractJsonLdBlocks(pageRes.text);
    for (const block of blocks) {
      let parsed;
      try {
        parsed = JSON.parse(block);
      } catch {
        parseErrors += 1;
        // A block that isn't even valid JSON is the clearest "present but
        // invalid" case there is.
        schemas.push({ type: 'UnparsableJsonLd', valid: false, missingByType: {}, raw: block.slice(0, 300) });
        continue;
      }
      const nodes = flattenJsonLdNodes(parsed);
      for (const node of nodes) {
        const result = validateNode(node);
        if (result) schemas.push(result);
      }
    }
  }

  const rawEvidence = {
    domain: origin,
    pageFetchOk: pageRes.ok,
    jsonLdBlockCount: pageRes.ok ? extractJsonLdBlocks(pageRes.text).length : 0,
    parseErrors,
    schemas, // [] means "no scored schema types found" (absent case)
    typesFound: Array.from(new Set(schemas.flatMap((s) => s.types || [s.type]))),
  };

  return makeEvidence('schema-check', 'JSON-LD extraction + schema.org field validation', rawEvidence);
}

module.exports = async (req, res) => {
  const domain = req.method === 'POST' ? (req.body && req.body.domain) : req.query.domain;
  if (!domain) {
    res.status(400).json({ error: 'domain is required (query param or JSON body field)' });
    return;
  }
  try {
    const evidence = await checkSchema(domain);
    res.status(200).json(evidence);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports.checkSchema = checkSchema;
module.exports.validateNode = validateNode;
