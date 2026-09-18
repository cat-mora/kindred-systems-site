// api/aeo/sitemap.js — FREE TIER, fully working (no external API keys needed)
//
// Checks presence + basic validity of sitemap.xml, whether it's referenced
// from robots.txt, and counts URLs found (including nested sitemap-index
// files, one level deep, since that's a common real-world pattern).

'use strict';

const { makeEvidence, safeFetchText, normaliseDomain } = require('./lib/evidence-utils');

function extractLocs(xml) {
  const locs = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let match;
  while ((match = re.exec(xml)) !== null) locs.push(match[1]);
  return locs;
}

function looksLikeValidXml(xml) {
  if (!xml || !xml.trim().startsWith('<?xml')) {
    // Some sitemaps omit the XML declaration but are still well-formed;
    // fall back to checking for a root <urlset> or <sitemapindex> tag.
    if (!/<\s*(urlset|sitemapindex)[\s>]/i.test(xml || '')) return false;
  }
  return /<\s*(urlset|sitemapindex)[\s>]/i.test(xml || '');
}

async function checkSitemap(domainInput) {
  const origin = normaliseDomain(domainInput);
  const sitemapUrl = `${origin}/sitemap.xml`;

  const [sitemapRes, robotsRes] = await Promise.all([
    safeFetchText(sitemapUrl),
    safeFetchText(`${origin}/robots.txt`),
  ]);

  const found = sitemapRes.ok && sitemapRes.status === 200;
  const valid = found ? looksLikeValidXml(sitemapRes.text) : false;
  const isIndex = valid && /<\s*sitemapindex[\s>]/i.test(sitemapRes.text);
  const topLevelLocs = valid ? extractLocs(sitemapRes.text) : [];

  let childUrlCount = 0;
  let childSitemapsChecked = 0;
  if (isIndex && topLevelLocs.length) {
    // Follow up to 3 child sitemaps to get a real URL count, bounded to
    // keep this check fast and cheap.
    const childrenToCheck = topLevelLocs.slice(0, 3);
    const childResults = await Promise.all(childrenToCheck.map((url) => safeFetchText(url)));
    for (const child of childResults) {
      childSitemapsChecked += 1;
      if (child.ok && looksLikeValidXml(child.text)) {
        childUrlCount += extractLocs(child.text).length;
      }
    }
  }

  const referencedInRobots =
    robotsRes.ok && new RegExp(`sitemap:\\s*${sitemapUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(
      robotsRes.text
    );

  const rawEvidence = {
    domain: origin,
    sitemapUrl,
    found,
    httpStatus: sitemapRes.status,
    valid,
    isSitemapIndex: isIndex,
    urlCount: isIndex ? childUrlCount : topLevelLocs.length,
    childSitemapsChecked,
    referencedInRobotsTxt: Boolean(referencedInRobots),
  };

  return makeEvidence('sitemap', 'sitemap.xml fetch', rawEvidence);
}

module.exports = async (req, res) => {
  const domain = req.method === 'POST' ? (req.body && req.body.domain) : req.query.domain;
  if (!domain) {
    res.status(400).json({ error: 'domain is required (query param or JSON body field)' });
    return;
  }
  try {
    const evidence = await checkSitemap(domain);
    res.status(200).json(evidence);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports.checkSitemap = checkSitemap;
