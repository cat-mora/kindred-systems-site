// api/aeo/raw-vs-rendered.js — FREE TIER, DIFF LOGIC WORKING / RENDER STEP STUBBED
//
// Flagged in the build spec as the single most useful crawlability signal:
// most AI crawlers (and plenty of traditional ones) do not execute
// JavaScript, so anything that only appears after client-side rendering is
// effectively invisible to them. This file gets the DIFF logic fully right
// — that's the part worth being careful about — while the actual headless
// rendering call is a clearly-labelled stub.
//
// TODO (needs a real headless-rendering integration before this check has
// teeth): this environment has no headless browser available to a Vercel
// serverless function out of the box (no Puppeteer/Playwright bundled, and
// bundling Chromium into a serverless function is a non-trivial build step
// on its own). The two realistic options:
//   1. Firecrawl API (https://firecrawl.dev) — `/v1/scrape` with
//      `formats: ["html"]` returns post-render HTML. Needs FIRECRAWL_API_KEY.
//   2. Browserless.io or a self-hosted `@sparticuz/chromium` + `puppeteer-core`
//      layer — more setup, more control, more cost.
// Once one of those is wired in, replace fetchRenderedHtml() below with the
// real call — everything downstream (diffContent, scoring) already expects
// exactly the shape it returns.

'use strict';

const { makeEvidence, safeFetchText, normaliseDomain, extractHeadings, stripHtmlToText } = require('./lib/evidence-utils');

const CONTACT_INFO_RE = /(\+?\d[\d\s().-]{7,}\d)|([\w.+-]+@[\w-]+\.[\w.-]+)/g;

/**
 * TODO: replace with a real Firecrawl / Browserless call. Currently returns
 * `null` to signal "rendering not available" so callers degrade gracefully
 * (report the raw-HTML facts, mark the rendered comparison as unavailable)
 * rather than silently pretending raw === rendered.
 */
async function fetchRenderedHtml(url) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return { available: false, html: null, reason: 'FIRECRAWL_API_KEY not configured' };
  }
  // TODO: real implementation once a key is available, e.g.:
  // const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
  //   method: 'POST',
  //   headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ url, formats: ['html'] }),
  // });
  // const data = await res.json();
  // return { available: true, html: data.data.html, reason: null };
  return { available: false, html: null, reason: 'Rendering integration not yet implemented' };
}

/**
 * Pure diff logic — this is the part the spec asks us to get right even
 * though rendering itself is stubbed. Compares raw vs rendered HTML for
 * content that only exists post-render: headings, body text volume, and
 * contact info (phone/email), which matters a lot for local-business AEO.
 */
function diffContent(rawHtml, renderedHtml) {
  const rawHeadings = extractHeadings(rawHtml).map((h) => h.text.toLowerCase().trim());
  const renderedHeadings = extractHeadings(renderedHtml).map((h) => h.text.toLowerCase().trim());
  const headingsOnlyAfterRender = renderedHeadings.filter((h) => h && !rawHeadings.includes(h));

  const rawText = stripHtmlToText(rawHtml);
  const renderedText = stripHtmlToText(renderedHtml);
  const rawWordCount = rawText ? rawText.split(/\s+/).filter(Boolean).length : 0;
  const renderedWordCount = renderedText ? renderedText.split(/\s+/).filter(Boolean).length : 0;

  const rawContacts = new Set((rawText.match(CONTACT_INFO_RE) || []).map((s) => s.trim()));
  const renderedContacts = new Set((renderedText.match(CONTACT_INFO_RE) || []).map((s) => s.trim()));
  const contactsOnlyAfterRender = Array.from(renderedContacts).filter((c) => !rawContacts.has(c));

  const wordCountGapRatio = renderedWordCount > 0 ? Math.max(0, (renderedWordCount - rawWordCount) / renderedWordCount) : 0;

  // gapScore: 0 = no meaningful gap, 1 = huge amount of content only exists post-render.
  // Weighted so missing contact info / headings hurts more than a raw word-count gap alone.
  const gapScore = Math.min(
    1,
    wordCountGapRatio * 0.5 +
      Math.min(1, headingsOnlyAfterRender.length / 3) * 0.3 +
      Math.min(1, contactsOnlyAfterRender.length) * 0.2
  );

  return {
    rawWordCount,
    renderedWordCount,
    wordCountGapRatio: Math.round(wordCountGapRatio * 1000) / 1000,
    headingsOnlyAfterRender,
    contactsOnlyAfterRender,
    gapScore: Math.round(gapScore * 1000) / 1000,
  };
}

async function checkRawVsRendered(domainInput) {
  const origin = normaliseDomain(domainInput);
  const rawRes = await safeFetchText(origin);
  const rendered = await fetchRenderedHtml(origin);

  let diff = null;
  if (rawRes.ok && rendered.available && rendered.html) {
    diff = diffContent(rawRes.text, rendered.html);
  }

  const rawEvidence = {
    domain: origin,
    rawFetchOk: rawRes.ok,
    rawHttpStatus: rawRes.status,
    renderedAvailable: rendered.available,
    renderedUnavailableReason: rendered.available ? null : rendered.reason,
    diff, // null when rendering wasn't available — see TODO above
  };

  // gapScore surfaced at the top level too so scoring.js can read it
  // directly without knowing about the `diff` nesting. Defaults to 0
  // (no known gap) rather than penalising sites when we simply couldn't
  // render them yet — that's an availability gap in OUR tooling, not a
  // fact about the site.
  return makeEvidence('raw-vs-rendered', 'raw HTML fetch + headless render diff', rawEvidence, {
    gapScore: diff ? diff.gapScore : 0,
  });
}

module.exports = async (req, res) => {
  const domain = req.method === 'POST' ? (req.body && req.body.domain) : req.query.domain;
  if (!domain) {
    res.status(400).json({ error: 'domain is required (query param or JSON body field)' });
    return;
  }
  try {
    const evidence = await checkRawVsRendered(domain);
    res.status(200).json(evidence);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports.checkRawVsRendered = checkRawVsRendered;
module.exports.diffContent = diffContent;
module.exports.fetchRenderedHtml = fetchRenderedHtml;
