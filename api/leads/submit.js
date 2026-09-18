// /api/leads/submit.js
//
// Vercel serverless function (Node.js runtime, CommonJS - there is no
// package.json at the repo root yet, so this deliberately avoids any npm
// dependency and talks to Supabase over plain REST with the built-in
// fetch, rather than importing @supabase/supabase-js).
//
// Receives a submission from /ai-visibility/lead-form.html, validates it,
// stores the lead, and then hands off to the voice-call trigger. The
// voice-call step is best-effort: if it fails, the lead is still stored
// and the person still gets a 200, because losing the lead is worse than
// losing the call.
//
// STORAGE
// -------
// The sibling app (cultivating-the-fruit-app) already uses Supabase, with
// an ENABLE_SUPABASE-style feature flag pattern (see app/lib/supabase/config.ts
// and app/lib/feature-flags.ts there). This function follows the same
// spirit: Supabase is used automatically when its env vars are present,
// and falls back to a clearly-labelled local stub otherwise, rather than
// hard-failing when the database isn't wired up yet.
//
// Env vars needed for real storage (Vercel project settings):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (service role, NOT the anon key - this
//                                 runs server-side only and needs to
//                                 bypass RLS to insert leads)
//
// Suggested table (run this migration in Supabase before flipping SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY on in Vercel):
//
//   create table ai_visibility_leads (
//     id uuid primary key default gen_random_uuid(),
//     name text not null,
//     email text not null,
//     phone text not null,
//     business_name text,
//     website text,
//     concern text,
//     budget_range text,
//     decision_maker text,
//     best_time text,
//     aeo_score text,
//     report_tier text,
//     source_page text,
//     submitted_at timestamptz not null,   -- from the form, the person's own timestamp
//     received_at timestamptz not null default now(),
//     call_status text default 'not_triggered',
//     raw jsonb,
//     created_at timestamptz not null default now()
//   );
//
// Until that table exists (or the env vars aren't set), leads are logged
// to the function's console output only. Vercel function logs are not a
// database - this is a stub for local testing, not durable storage. Do
// not rely on it once this is live; wire Supabase (or swap in whatever
// database the scoring-pipeline team ends up using) before real traffic.

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const REQUIRED_FIELDS = ["name", "email", "phone"];

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || "");
}

// Best-effort AU phone normalisation to E.164 (+61...). This assumes an
// Australian mobile or landline number entered in a local format (04xx xxx
// xxx, 02 xxxx xxxx, etc). It does not validate the number is real or
// currently reachable, and does not handle non-AU numbers - flagged as a
// known limitation, see the report handed back with this build.
function normalisePhoneAU(raw) {
  if (!raw) return "";
  var digits = String(raw).replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return "+61" + digits.slice(1);
  if (digits.startsWith("61")) return "+" + digits;
  return digits;
}

async function storeLead(lead) {
  if (SUPABASE_ENABLED) {
    const res = await fetch(SUPABASE_URL + "/rest/v1/ai_visibility_leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        business_name: lead.business_name,
        website: lead.website,
        concern: lead.concern,
        budget_range: lead.budget_range,
        decision_maker: lead.decision_maker,
        best_time: lead.best_time,
        aeo_score: lead.aeo_score,
        report_tier: lead.report_tier,
        source_page: lead.source_page,
        submitted_at: lead.submitted_at,
        raw: lead,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(function () {
        return "";
      });
      throw new Error("Supabase insert failed (" + res.status + "): " + text);
    }

    const rows = await res.json();
    return { id: rows && rows[0] && rows[0].id, storage: "supabase" };
  }

  // Dev/local stub - NOT durable storage. Vercel functions have a
  // read-only filesystem outside /tmp, and /tmp is wiped between cold
  // starts, so this only helps while testing within a single running
  // instance's lifetime. Kept
  // deliberately simple rather than adding a database dependency before
  // this is confirmed against whatever the scoring-pipeline team is
  // already building.
  console.log(
    "[leads/submit] STUB STORAGE (no Supabase env vars set):",
    JSON.stringify(lead),
  );
  try {
    const fs = require("fs");
    fs.appendFileSync(
      "/tmp/ai-visibility-leads.jsonl",
      JSON.stringify(lead) + "\n",
    );
  } catch (err) {
    console.warn("[leads/submit] could not write /tmp stub file:", err.message);
  }
  return { id: lead.id, storage: "stub" };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (err) {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }
  }
  body = body || {};

  const missing = REQUIRED_FIELDS.filter(function (field) {
    return !body[field] || !String(body[field]).trim();
  });
  if (missing.length) {
    return res.status(400).json({
      ok: false,
      error: "Missing required field(s): " + missing.join(", "),
    });
  }
  if (!isValidEmail(body.email)) {
    return res.status(400).json({ ok: false, error: "Invalid email address" });
  }

  const lead = {
    id:
      typeof require("crypto").randomUUID === "function"
        ? require("crypto").randomUUID()
        : String(Date.now()) + "-" + Math.random().toString(16).slice(2),
    name: String(body.name).trim(),
    email: String(body.email).trim().toLowerCase(),
    phone: normalisePhoneAU(body.phone),
    business_name: (body.business_name || "").trim(),
    website: (body.website || "").trim(),
    concern: (body.concern || "").trim(),
    budget_range: body.budget_range || "",
    decision_maker: body.decision_maker || "",
    best_time: body.best_time || "",
    aeo_score: body.aeo_score || "",
    report_tier: body.report_tier || "",
    source_page: body.source_page || "",
    // The form sets this at the moment the person clicks submit. It is
    // the record that they solicited contact themselves, which is the
    // legal basis the voice call relies on (see PART 2 of
    // /docs/vapi/aeo-qualify-and-book-assistant.md). Fall back to the
    // server's received time only if the form somehow didn't send one,
    // so a submission is never dropped over a missing timestamp.
    submitted_at: body.submitted_at || new Date().toISOString(),
    received_at: new Date().toISOString(),
  };

  let stored;
  try {
    stored = await storeLead(lead);
  } catch (err) {
    console.error("[leads/submit] storeLead failed:", err);
    return res.status(500).json({
      ok: false,
      error: "Could not save your details. Please try again shortly.",
    });
  }

  // Voice-call trigger is best-effort and imported directly rather than
  // called over HTTP, so one function invocation handles both steps
  // without a network round trip back to this same deployment. It is a
  // no-op today: OUTBOUND_CALLING_ENABLED defaults to false (see
  // /api/voice/trigger-call.js and /docs/vapi/aeo-qualify-and-book-assistant.md
  // for why it stays off until Cat has had a lawyer's read of the
  // compliance approach).
  try {
    const { triggerOutboundCall } = require("../voice/trigger-call.js");
    await triggerOutboundCall(lead);
  } catch (err) {
    console.error(
      "[leads/submit] triggerOutboundCall failed (lead is still saved):",
      err,
    );
  }

  return res.status(200).json({ ok: true, leadId: stored.id });
};
