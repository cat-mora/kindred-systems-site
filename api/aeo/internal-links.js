// api/aeo/internal-links.js — FREE TIER, fully working (no external API keys needed)
//
// Bounded breadth-first crawl of the target site (same-domain links only)
// to check internal link structure and crawl depth to key pages. Capped at
// MAX_CRAWL_PAGES pages and MAX_CRAWL_DEPTH levels so this stays fast and
// cheap regardless of site size.

'use strict';

const { MAX_CRAWL_PAGES, MAX_CRAWL_DEPTH } = require('./lib/config');
const { makeEvidence, safeFetchText, normaliseDomain, extractInternalLinks } = require('./lib/evidence-utils');

// URL path fragments we consider "key pages" for a local-business site.
// Depth-to-first-match is recorded for each.
const KEY_PAGE_PATTERNS = {
  contact: /\/contact/i,
  about: /\/about/i,
  services: /\/(services|what-we-do|solutions)/i,
  blog: /\/(blog|insights|articles|news)/i,
  pricing: /\/(pricing|plans)/i,
};

async function crawl(startUrl) {
  const visited = new Set();
  const queue = [{ url: startUrl, depth: 0 }];
  const pages = [];
  const linkCounts = {}; // url -> number of internal links pointing at it (inbound count, within crawl)
  const keyPageDepth = {};
  for (const key of Object.keys(KEY_PAGE_PATTERNS)) keyPageDepth[key] = null;

  while (queue.length && pages.length < MAX_CRAWL_PAGES) {
    const { url, depth } = queue.shift();
    if (visited.has(url) || depth > MAX_CRAWL_DEPTH) continue;
    visited.add(url);

    // eslint-disable-next-line no-await-in-loop
    const res = await safeFetchText(url);
    if (!res.ok) {
      pages.push({ url, depth, ok: false, status: res.status, outboundInternalLinks: 0 });
      continue;
    }

    for (const [key, pattern] of Object.entries(KEY_PAGE_PATTERNS)) {
      if (keyPageDepth[key] === null && pattern.test(url)) keyPageDepth[key] = depth;
    }

    const links = extractInternalLinks(res.text, url);
    pages.push({ url, depth, ok: true, status: res.status, outboundInternalLinks: links.length });

    for (const link of links) {
      linkCounts[link] = (linkCounts[link] || 0) + 1;
      if (!visited.has(link) && pages.length + queue.length < MAX_CRAWL_PAGES) {
        queue.push({ url: link, depth: depth + 1 });
      }
    }
  }

  return { pages, linkCounts, keyPageDepth, hitPageCap: pages.length >= MAX_CRAWL_PAGES };
}

async function checkInternalLinks(domainInput) {
  const origin = normaliseDomain(domainInput);
  const { pages, linkCounts, keyPageDepth, hitPageCap } = await crawl(origin);

  const orphanCandidates = pages
    .filter((p) => p.depth > 0 && !linkCounts[p.url])
    .map((p) => p.url);

  const avgOutboundLinks =
    pages.length > 0
      ? pages.reduce((sum, p) => sum + (p.outboundInternalLinks || 0), 0) / pages.length
      : 0;

  const rawEvidence = {
    domain: origin,
    pagesCrawled: pages.length,
    maxPagesCap: MAX_CRAWL_PAGES,
    maxDepthCap: MAX_CRAWL_DEPTH,
    hitPageCap,
    avgOutboundInternalLinksPerPage: Math.round(avgOutboundLinks * 10) / 10,
    keyPageDepth, // e.g. { contact: 1, about: 1, services: 0, blog: null, pricing: null }
    orphanPageCount: orphanCandidates.length,
    orphanPageSample: orphanCandidates.slice(0, 10),
    pages: pages.map((p) => ({ url: p.url, depth: p.depth, ok: p.ok, status: p.status })),
  };

  return makeEvidence('internal-links', `bounded crawl (max ${MAX_CRAWL_PAGES} pages)`, rawEvidence);
}

module.exports = async (req, res) => {
  const domain = req.method === 'POST' ? (req.body && req.body.domain) : req.query.domain;
  if (!domain) {
    res.status(400).json({ error: 'domain is required (query param or JSON body field)' });
    return;
  }
  try {
    const evidence = await checkInternalLinks(domain);
    res.status(200).json(evidence);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports.checkInternalLinks = checkInternalLinks;
