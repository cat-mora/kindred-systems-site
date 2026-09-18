// api/aeo/lib/cache.js
//
// COST CONTROL: technical checks are cached per-domain for CACHE_TTL_DAYS
// (currently 14) so that a competitor domain seen across multiple
// assessments isn't re-crawled/re-scored from scratch every time.
//
// STUB WARNING: this in-process Map is NOT a real cache in production.
// Vercel serverless functions are stateless and short-lived — each cold
// start gets a fresh empty Map, and nothing is shared across concurrent
// invocations/regions. This file exists purely to define the interface so
// the rest of the pipeline can be written against a cache *now*, and to
// make it a one-line swap later.
//
// TODO (real implementation, before this goes live at any real volume):
//   Swap the body of get()/set()/del() below for one of:
//     - Vercel KV (Upstash Redis under the hood): `@vercel/kv` — kv.get/kv.set
//     - Supabase table `aeo_check_cache(domain, check_id, payload, expires_at)`
//   Keep the exported function signatures identical so no caller changes.

"use strict";

const { CACHE_TTL_DAYS } = require("./config");

const memoryStore = new Map();

function cacheKey(domain, checkId) {
  return `${domain.toLowerCase()}::${checkId}`;
}

/**
 * @returns {*|null} cached payload, or null if missing/expired
 */
async function getCached(domain, checkId) {
  const entry = memoryStore.get(cacheKey(domain, checkId));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(cacheKey(domain, checkId));
    return null;
  }
  return entry.payload;
}

/**
 * @param {number} [ttlDays] override the default TTL for this entry
 */
async function setCached(domain, checkId, payload, ttlDays = CACHE_TTL_DAYS) {
  memoryStore.set(cacheKey(domain, checkId), {
    payload,
    expiresAt: Date.now() + ttlDays * 24 * 60 * 60 * 1000,
    cachedAtISO: new Date().toISOString(),
  });
}

async function invalidate(domain, checkId) {
  memoryStore.delete(cacheKey(domain, checkId));
}

/**
 * Wraps a check function with cache-or-run semantics. Used by orchestrators
 * so individual check modules don't need to know about caching at all.
 * @param {string} domain
 * @param {string} checkId
 * @param {() => Promise<object>} runFn - produces a fresh evidence object
 */
async function withCache(domain, checkId, runFn) {
  const cached = await getCached(domain, checkId);
  if (cached) {
    return { ...cached, fromCache: true };
  }
  const fresh = await runFn();
  await setCached(domain, checkId, fresh);
  return { ...fresh, fromCache: false };
}

module.exports = { getCached, setCached, invalidate, withCache };
