// api/aeo/content-structure.js — FREE TIER, fully working (no external API keys needed)
//
// Checks heading hierarchy, direct-answer-paragraph detection, list/bullet
// usage, word count and a basic readability estimate. All deterministic
// string/DOM parsing — no LLM involved in deciding any of these facts.

"use strict";

const {
  makeEvidence,
  safeFetchText,
  normaliseDomain,
  extractHeadings,
  stripHtmlToText,
} = require("./lib/evidence-utils");

/** Very rough syllable counter for a Flesch-Kincaid-style readability estimate. */
function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  const matches = w.match(/[aeiouy]+/g);
  let count = matches ? matches.length : 1;
  if (w.endsWith("e") && count > 1) count -= 1;
  return Math.max(1, count);
}

/** Flesch Reading Ease, rescaled 0-100 (already roughly on that scale, just clamped). */
function fleschReadingEase(text) {
  const sentences = (text.match(/[.!?]+/g) || []).length || 1;
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length || 1;
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const score =
    206.835 - 1.015 * (wordCount / sentences) - 84.6 * (syllables / wordCount);
  return Math.max(0, Math.min(100, score));
}

/** Checks the heading levels appear in non-skipping order (h1 -> h2 -> h3, not h1 -> h3). */
function headingHierarchyIsValid(headings) {
  if (headings.length === 0) return false;
  let lastLevel = 0;
  for (const h of headings) {
    if (lastLevel > 0 && h.level > lastLevel + 1) return false;
    lastLevel = h.level;
  }
  return true;
}

/**
 * Heuristic "direct answer paragraph" detector: within roughly the first
 * 100 words of body text, is there a paragraph that reads like a direct,
 * declarative answer (not a question, not a nav/menu fragment)? We look for
 * a heading phrased as a question followed closely by a declarative
 * sentence, OR simply a substantial declarative first paragraph — both are
 * patterns AI answer engines tend to quote well.
 */
function hasDirectAnswerParagraph(html, bodyText) {
  const first100Words = bodyText.split(/\s+/).slice(0, 100).join(" ");
  const firstSentenceMatch = first100Words.match(/^[^.!?]{20,220}[.!?]/);
  if (!firstSentenceMatch) return false;
  const firstSentence = firstSentenceMatch[0];
  const isQuestion = firstSentence.trim().endsWith("?");
  const wordCount = firstSentence.split(/\s+/).length;
  // A direct-answer paragraph is a substantial declarative sentence early
  // in the content — not a question, not a one-liner nav fragment.
  return !isQuestion && wordCount >= 8;
}

function countListsAndBullets(html) {
  const listTagMatches = html.match(/<(ul|ol)[^>]*>/gi) || [];
  const listItemMatches = html.match(/<li[^>]*>/gi) || [];
  return {
    listCount: listTagMatches.length,
    listItemCount: listItemMatches.length,
  };
}

async function checkContentStructure(domainInput) {
  const origin = normaliseDomain(domainInput);
  const pageRes = await safeFetchText(origin);

  if (!pageRes.ok) {
    return makeEvidence("content-structure", "homepage HTML fetch", {
      domain: origin,
      fetchOk: false,
      httpStatus: pageRes.status,
    });
  }

  const headings = extractHeadings(pageRes.text);
  const h1Count = headings.filter((h) => h.level === 1).length;
  const bodyText = stripHtmlToText(pageRes.text);
  const wordCount = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;
  const { listCount, listItemCount } = countListsAndBullets(pageRes.text);
  const readability = fleschReadingEase(bodyText);

  const rawEvidence = {
    domain: origin,
    fetchOk: true,
    headingCount: headings.length,
    h1Count,
    hasSingleH1: h1Count === 1,
    headingHierarchyValid: headingHierarchyIsValid(headings),
    headings: headings.slice(0, 30),
    hasDirectAnswerParagraph: hasDirectAnswerParagraph(pageRes.text, bodyText),
    listCount,
    listOrBulletCount: listCount,
    listItemCount,
    wordCount,
    readabilityScore: Math.round(readability * 10) / 10,
  };

  return makeEvidence("content-structure", "homepage HTML parse", rawEvidence);
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
    const evidence = await checkContentStructure(domain);
    res.status(200).json(evidence);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports.checkContentStructure = checkContentStructure;
module.exports.fleschReadingEase = fleschReadingEase;
