// api/aeo/lib/evidence-utils.js
//
// Shared helpers for the EVIDENCE LAYER only. Every function here either
// makes a real network call or does pure string/DOM parsing — nothing here
// is allowed to "decide" a score or ask an LLM to judge anything. That
// separation is the whole point of the three-layer design (see README.md).

'use strict';

const { FETCH_TIMEOUT_MS } = require('./config');

/**
 * Builds one evidence object in the shape every check must return.
 * @param {string} checkId - stable id, e.g. "robots-llms:oai-searchbot"
 * @param {string} source - where the fact came from, e.g. "robots.txt fetch"
 * @param {*} rawEvidence - the raw fact(s) gathered, no interpretation
 * @param {object} [extra] - optional extra fields (value, passed, error, etc.)
 */
function makeEvidence(checkId, source, rawEvidence, extra = {}) {
  return {
    checkId,
    source,
    timestampISO: new Date().toISOString(),
    rawEvidence,
    ...extra,
  };
}

/**
 * fetch() with a hard timeout and a consistent, identifiable User-Agent so
 * site owners can see these requests in their logs and know what they are.
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent':
          'KindredSystemsAEOBot/1.0 (+https://kindredsystems.com.au/aeo; AI Visibility Scorecard)',
        ...(options.headers || {}),
      },
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetches a URL as text, never throws — returns a structured result so
 * callers can record "the fetch failed" as evidence rather than crashing.
 */
async function safeFetchText(url, options = {}) {
  const startedAt = Date.now();
  try {
    const res = await fetchWithTimeout(url, options);
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      url,
      text,
      durationMs: Date.now() - startedAt,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      url,
      text: null,
      durationMs: Date.now() - startedAt,
      error: err && err.message ? err.message : String(err),
    };
  }
}

/** Normalises a user-supplied domain/URL into a clean https origin. */
function normaliseDomain(input) {
  let value = String(input || '').trim();
  if (!value) throw new Error('domain is required');
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  const url = new URL(value);
  return `${url.protocol}//${url.host}`;
}

/** Extracts all <script type="application/ld+json"> block contents. */
function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

/** Strips tags to plain text (rough, good enough for word-count/readability). */
function stripHtmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extracts heading tags in document order as [{level, text}]. */
function extractHeadings(html) {
  const headings = [];
  const re = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    headings.push({ level: Number(match[1]), text: stripHtmlToText(match[2]) });
  }
  return headings;
}

/** Extracts same-domain <a href> links from HTML, resolved to absolute URLs. */
function extractInternalLinks(html, baseUrl) {
  const links = new Set();
  const re = /<a\s[^>]*href=["']([^"'#][^"']*)["']/gi;
  let match;
  const base = new URL(baseUrl);
  while ((match = re.exec(html)) !== null) {
    try {
      const resolved = new URL(match[1], base);
      if (resolved.host === base.host && /^https?:$/.test(resolved.protocol)) {
        resolved.hash = '';
        links.add(resolved.toString());
      }
    } catch {
      // ignore malformed hrefs (mailto:, javascript:, etc.)
    }
  }
  return Array.from(links);
}

module.exports = {
  makeEvidence,
  fetchWithTimeout,
  safeFetchText,
  normaliseDomain,
  extractJsonLdBlocks,
  stripHtmlToText,
  extractHeadings,
  extractInternalLinks,
};
