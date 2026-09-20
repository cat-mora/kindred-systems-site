#!/usr/bin/env node
// Regenerates sitemap.xml from the pages that actually exist in this repo.
//
// Why this exists: sitemap.xml used to be edited by hand, so every new article
// depended on somebody remembering to add a URL and a date. This removes that
// step entirely. Nothing about the sitemap should ever need editing again.
//
// Run: node scripts/generate-sitemap.mjs
// The Sitemap and IndexNow workflow runs this on every push to main and commits
// the result only if it changed.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, sep } from "node:path";

const SITE = "https://kindredsystems.com.au";
const ROOT = process.cwd();

// Directories we never walk into at all.
const SKIP_DIRS = new Set([
  ".git",
  ".github",
  ".vercel",
  "node_modules",
  "scripts",
  "assets",
  "api",
  "docs",
  "project-docs",
]);

// Pages that exist and are served, but deliberately stay out of the sitemap.
// Each one is a decision, not an oversight, so each gets a reason.
const EXCLUDED_PREFIXES = [
  "articles/_article-template/", // build template, noindex by design
  "insights/", // noindex redirect stub, kept for old inbound links
  "ai-solutions/", // noindex redirect stub, kept for old inbound links
  "advisory/intake/", // client onboarding forms, not public marketing pages
  "advisory/welcome/", // client onboarding form, not a public marketing page
];

// Priority and change frequency by URL path. Anything not listed here gets the
// default below, which is what an article should have, so publishing a new
// article needs no change to this file.
const RULES = [
  [/^\/$/, { priority: "1.0", changefreq: "monthly" }],
  [/^\/advisory\/$/, { priority: "0.9", changefreq: "monthly" }],
  [/^\/about\/$/, { priority: "0.8", changefreq: "monthly" }],
  [/^\/articles\/$/, { priority: "0.8", changefreq: "weekly" }],
  [/^\/contact\/$/, { priority: "0.6", changefreq: "yearly" }],
  [/^\/aeo\/$/, { priority: "0.5", changefreq: "weekly" }],
  [/^\/ai-visibility\/$/, { priority: "0.9", changefreq: "monthly" }],
];
const DEFAULT_RULE = { priority: "0.7", changefreq: "monthly" };

function findIndexFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      findIndexFiles(full, out);
    } else if (entry === "index.html") {
      out.push(full);
    }
  }
  return out;
}

// A page that tells robots not to index it has no business in a sitemap.
// This is the safety net: any future noindex page drops out on its own.
function isNoIndex(html) {
  const metas = html.match(/<meta[^>]+name=["']robots["'][^>]*>/gi) || [];
  return metas.some((m) => /noindex/i.test(m));
}

function lastModified(file) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", file], {
      encoding: "utf8",
    }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(out)) return out;
  } catch {
    // Not a git checkout, or the file is not committed yet.
  }
  return new Date().toISOString().slice(0, 10);
}

function urlPathFor(file) {
  const rel = relative(ROOT, file).split(sep).join("/");
  const dir = rel.replace(/index\.html$/, "");
  return "/" + dir;
}

function ruleFor(urlPath) {
  for (const [pattern, rule] of RULES) {
    if (pattern.test(urlPath)) return rule;
  }
  return DEFAULT_RULE;
}

const pages = [];
for (const file of findIndexFiles(ROOT)) {
  const rel = relative(ROOT, file).split(sep).join("/");
  const dir = rel.replace(/index\.html$/, "");
  if (EXCLUDED_PREFIXES.some((p) => dir === p || dir.startsWith(p))) continue;

  const html = readFileSync(file, "utf8");
  if (isNoIndex(html)) continue;

  const urlPath = urlPathFor(file);
  pages.push({
    loc: SITE + urlPath,
    lastmod: lastModified(rel),
    ...ruleFor(urlPath),
  });
}

// Deterministic order: home first, then the explicitly ranked pages in the
// order they appear in RULES, then everything else alphabetically. Order has no
// effect on crawlers, it just keeps the diff readable.
const rank = (loc) => {
  const path = loc.replace(SITE, "");
  const i = RULES.findIndex(([pattern]) => pattern.test(path));
  return i === -1 ? RULES.length : i;
};
pages.sort((a, b) => rank(a.loc) - rank(b.loc) || a.loc.localeCompare(b.loc));

const body = pages
  .map(
    (p) => `  <url>\n    <loc>${p.loc}</loc>\n    <lastmod>${p.lastmod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`,
  )
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;

writeFileSync(join(ROOT, "sitemap.xml"), xml, "utf8");
console.log(`sitemap.xml written with ${pages.length} URLs`);
for (const p of pages) console.log(`  ${p.loc}`);
