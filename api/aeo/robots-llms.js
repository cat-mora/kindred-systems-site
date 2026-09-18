// api/aeo/robots-llms.js — FREE TIER, fully working (no external API keys needed)
//
// Fetches and parses robots.txt and llms.txt for the target domain, and
// flags whether each AI crawler we care about is blocked. See config.js for
// why OAI-SearchBot (ChatGPT Search citation) is checked and scored
// separately from GPTBot (OpenAI training-data collection) — they are NOT
// the same concern and must never be lumped together.

'use strict';

const { AI_CRAWLER_BOTS } = require('./lib/config');
const { makeEvidence, safeFetchText, normaliseDomain } = require('./lib/evidence-utils');

/**
 * Parses a robots.txt body into { [userAgentLower]: { disallow: string[], allow: string[] } }
 * Handles multiple User-agent lines sharing one rule block, and the
 * "User-agent: *" wildcard block, per the (informal) robots.txt spec.
 */
function parseRobotsTxt(body) {
  const groups = []; // [{ agents: string[], disallow: string[], allow: string[] }]
  let current = null;

  const lines = String(body || '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      // A new User-agent line right after rules starts a new group; a
      // User-agent line right after another User-agent line (no rules yet)
      // extends the current group (agents sharing one rule block).
      if (!current || current.disallow.length || current.allow.length) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (key === 'disallow' && current) {
      if (value) current.disallow.push(value);
    } else if (key === 'allow' && current) {
      if (value) current.allow.push(value);
    }
  }
  return groups;
}

/** Resolves whether a given bot's user-agent is blocked entirely ("/") or partially. */
function evaluateBotAccess(groups, userAgent) {
  const ua = userAgent.toLowerCase();
  const specific = groups.find((g) => g.agents.includes(ua));
  const wildcard = groups.find((g) => g.agents.includes('*'));
  const applicable = specific || wildcard || null;

  if (!applicable) {
    return { found: false, blockedEntirely: false, disallowedPaths: [], matchedGroup: 'none' };
  }
  const blockedEntirely = applicable.disallow.some((p) => p === '/' || p === '');
  return {
    found: true,
    blockedEntirely,
    disallowedPaths: applicable.disallow,
    matchedGroup: specific ? 'specific' : 'wildcard',
  };
}

async function checkRobotsAndLlms(domainInput) {
  const origin = normaliseDomain(domainInput);
  const robotsUrl = `${origin}/robots.txt`;
  const llmsUrl = `${origin}/llms.txt`;

  const [robotsRes, llmsRes] = await Promise.all([safeFetchText(robotsUrl), safeFetchText(llmsUrl)]);

  const groups = robotsRes.ok ? parseRobotsTxt(robotsRes.text) : [];
  const botRules = {};
  for (const bot of AI_CRAWLER_BOTS) {
    botRules[bot.id] = {
      ...evaluateBotAccess(groups, bot.userAgent),
      userAgent: bot.userAgent,
      purpose: bot.purpose,
      engine: bot.engine,
    };
  }

  const rawEvidence = {
    domain: origin,
    robotsTxtFound: robotsRes.ok,
    robotsTxtStatus: robotsRes.status,
    robotsTxtContent: robotsRes.ok ? robotsRes.text.slice(0, 5000) : null,
    llmsTxtFound: llmsRes.ok,
    llmsTxtStatus: llmsRes.status,
    llmsTxtContent: llmsRes.ok ? llmsRes.text.slice(0, 5000) : null,
    botRules,
    // Called out explicitly because it's the single highest-impact fact on this check.
    oaiSearchBotBlocked: botRules['oai-searchbot'].blockedEntirely,
  };

  return makeEvidence('robots-llms', 'robots.txt / llms.txt fetch', rawEvidence);
}

// --- Vercel serverless handler --------------------------------------------
module.exports = async (req, res) => {
  const domain = req.method === 'POST' ? (req.body && req.body.domain) : req.query.domain;
  if (!domain) {
    res.status(400).json({ error: 'domain is required (query param or JSON body field)' });
    return;
  }
  try {
    const evidence = await checkRobotsAndLlms(domain);
    res.status(200).json(evidence);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports.checkRobotsAndLlms = checkRobotsAndLlms;
module.exports.parseRobotsTxt = parseRobotsTxt;
