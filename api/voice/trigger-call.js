// /api/voice/trigger-call.js
//
// Places (or queues) the outbound Vapi call that follows up on a lead
// form submission. Exports both:
//   - `triggerOutboundCall(lead)`  - the core logic, imported directly by
//                                    /api/leads/submit.js so a lead
//                                    submission and its follow-up call
//                                    happen in one function invocation.
//   - the default handler          - so this can also be hit directly
//                                    over HTTP (manual testing, or a
//                                    queue processor calling back in).
//
// STAYS OFF BY DEFAULT.
// ----------------------
// OUTBOUND_CALLING_ENABLED must be explicitly set to "true" in Vercel's
// env vars before this will ever place a real call. Cat has not yet had
// a lawyer's read of the compliance approach documented in
// /docs/vapi/aeo-qualify-and-book-assistant.md (the "solicited call"
// framing under the Do Not Call Register Act). Until that happens, every
// call to triggerOutboundCall() below just logs what it WOULD have done
// and returns { status: "disabled" }. Do not remove this flag or default
// it to true without Cat's explicit go-ahead.
//
// TODO: needs VAPI_API_KEY, VAPI_ASSISTANT_ID and VAPI_PHONE_NUMBER_ID env
// vars before OUTBOUND_CALLING_ENABLED can do anything real. Get these
// from the Vapi dashboard once Cat has set the assistant up there from
// /docs/vapi/aeo-qualify-and-book-assistant.md. VAPI_PHONE_NUMBER_ID is
// the "from" number Vapi calls out on (Vapi requires either a
// phoneNumberId or a full byo-carrier config on every outbound call, see
// their docs - confirm the current request format before enabling, Vapi's
// API has changed format before).
//
// CALLING WINDOW (compliance constraint, not just the assistant's own
// awareness - this file enforces it too):
//   Weekdays  9am-8pm, recipient's local time
//   Saturday  9am-5pm, recipient's local time
//   Never Sunday, never a declared Australian public holiday
//
// ASSUMPTION FLAGGED: this checks Australia/Sydney time, because the lead
// form does not currently collect the person's state/timezone. Most of
// the Australian population is in an eastern-state timezone, but this
// will be wrong for WA (and to a lesser extent SA/NT) leads near the
// edges of the window. Ideally capture state/timezone on the form, or
// derive it from phone area code, before this goes live - flagged in the
// build report as needing a human decision, not something to keep
// guessing at unprompted.
//
// ASSUMPTION FLAGGED: isAustralianPublicHoliday() below is a stub that
// always returns false. There is no bundled AU public holiday calendar
// here. Wire a real source (e.g. data.gov.au's public holidays dataset,
// or the `date-holidays` npm package once this project has a
// package.json) before relying on this check - also flagged in the build
// report.

const OUTBOUND_CALLING_ENABLED =
  String(process.env.OUTBOUND_CALLING_ENABLED || "false").toLowerCase() ===
  "true";

const VAPI_API_KEY = process.env.VAPI_API_KEY || "";
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || "";
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || "";

const RECIPIENT_TIMEZONE = "Australia/Sydney"; // see ASSUMPTION FLAGGED above

function isAustralianPublicHoliday(date) {
  // TODO: stub only, always false. Wire a real AU public-holiday data
  // source before relying on this in production.
  return false;
}

// Returns { allowed: boolean, reason: string } for the given Date,
// evaluated in RECIPIENT_TIMEZONE.
function checkCallingWindow(date) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: RECIPIENT_TIMEZONE,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);

  const weekday = parts.find(function (p) {
    return p.type === "weekday";
  }).value; // "Sun", "Mon", ...
  const hourPart = parts.find(function (p) {
    return p.type === "hour";
  }).value;
  const hour = parseInt(hourPart, 10) % 24;

  if (weekday === "Sun") {
    return { allowed: false, reason: "Sunday - never call" };
  }
  if (isAustralianPublicHoliday(date)) {
    return { allowed: false, reason: "Public holiday - never call" };
  }
  if (weekday === "Sat") {
    if (hour >= 9 && hour < 17) {
      return { allowed: true, reason: "Within Saturday window" };
    }
    return { allowed: false, reason: "Outside Saturday 9am-5pm window" };
  }
  // Mon-Fri
  if (hour >= 9 && hour < 20) {
    return { allowed: true, reason: "Within weekday window" };
  }
  return { allowed: false, reason: "Outside weekday 9am-8pm window" };
}

// Given a Date that fails checkCallingWindow, returns the next Date that
// would pass it. Used to compute a scheduled_for time for the queue
// rather than dropping the call.
function nextAllowedTime(date) {
  let candidate = new Date(date.getTime());
  for (let i = 0; i < 8 * 24; i++) {
    // step forward in hourly increments, look ahead at most 8 days
    candidate = new Date(candidate.getTime() + 60 * 60 * 1000);
    const check = checkCallingWindow(candidate);
    if (check.allowed) {
      // snap to the top of the hour for a tidier scheduled time
      candidate.setUTCMinutes(0, 0, 0);
      return candidate;
    }
  }
  // Fallback, should not happen given the loop bound above
  return candidate;
}

// Builds the context Vapi passes into the assistant so it does not
// re-ask anything already answered on the form. Keys match the
// {{template_variables}} referenced in
// /docs/vapi/aeo-qualify-and-book-assistant.md's system prompt.
function buildKnownAnswers(lead) {
  return {
    lead_name: lead.name || "",
    business_name: lead.business_name || "",
    website: lead.website || "",
    aeo_score: lead.aeo_score || "",
    report_tier: lead.report_tier || "",
    concern: lead.concern || "",
    budget_range: lead.budget_range || "",
    decision_maker: lead.decision_maker || "",
    best_time: lead.best_time || "",
  };
}

// Queues a call for later rather than skipping it. This is a minimal
// stand-in for a real queue: it stores a "scheduled_calls" row via the
// same Supabase-or-stub storage used for leads (see /api/leads/submit.js)
// with a scheduled_for time, and relies on something else polling it -
// see /api/voice/process-queue.js. That file needs a scheduler (e.g. a
// Vercel Cron entry in vercel.json hitting it every 15-30 minutes) to
// run at all, which is outside this task's file scope (vercel.json is
// owned by whoever is assembling the final PR) - flagged in the build
// report.
async function queueCall(lead, scheduledFor, reason) {
  const record = {
    lead_id: lead.id,
    phone: lead.phone,
    scheduled_for: scheduledFor.toISOString(),
    reason: reason,
    known_answers: buildKnownAnswers(lead),
    status: "queued",
    created_at: new Date().toISOString(),
  };

  const SUPABASE_URL = process.env.SUPABASE_URL || "";
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await fetch(SUPABASE_URL + "/rest/v1/scheduled_calls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
          Prefer: "return=minimal",
        },
        body: JSON.stringify(record),
      });
    } catch (err) {
      console.error("[voice/trigger-call] could not queue call in Supabase:", err);
    }
  } else {
    console.log("[voice/trigger-call] STUB QUEUE (no Supabase env vars set):", JSON.stringify(record));
  }

  return record;
}

async function placeVapiCall(lead) {
  if (!VAPI_API_KEY || !VAPI_ASSISTANT_ID || !VAPI_PHONE_NUMBER_ID) {
    throw new Error(
      "Missing VAPI_API_KEY / VAPI_ASSISTANT_ID / VAPI_PHONE_NUMBER_ID env var(s) - cannot place call.",
    );
  }

  // Confirm this request format against Vapi's current docs before
  // enabling - this is written from their documented outbound-call
  // pattern (POST /call with assistantId + phoneNumberId + customer),
  // not tested against a live account.
  const res = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + VAPI_API_KEY,
    },
    body: JSON.stringify({
      assistantId: VAPI_ASSISTANT_ID,
      phoneNumberId: VAPI_PHONE_NUMBER_ID,
      customer: {
        number: lead.phone,
        name: lead.name,
      },
      assistantOverrides: {
        variableValues: buildKnownAnswers(lead),
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(function () {
      return "";
    });
    throw new Error("Vapi call request failed (" + res.status + "): " + text);
  }

  return res.json();
}

// Core entry point. Safe to call unconditionally from /api/leads/submit.js
// - it no-ops unless OUTBOUND_CALLING_ENABLED is explicitly "true".
async function triggerOutboundCall(lead) {
  if (!OUTBOUND_CALLING_ENABLED) {
    console.log(
      "[voice/trigger-call] OUTBOUND_CALLING_ENABLED is false - would have called",
      lead.phone,
      "with context",
      JSON.stringify(buildKnownAnswers(lead)),
    );
    return { status: "disabled" };
  }

  if (!lead.phone) {
    console.warn("[voice/trigger-call] lead has no phone number, skipping:", lead.id);
    return { status: "skipped", reason: "no phone number" };
  }

  const now = new Date();
  const window = checkCallingWindow(now);

  if (!window.allowed) {
    const scheduledFor = nextAllowedTime(now);
    const queued = await queueCall(lead, scheduledFor, window.reason);
    return { status: "queued", scheduledFor: queued.scheduled_for, reason: window.reason };
  }

  const result = await placeVapiCall(lead);
  return { status: "called", vapi: result };
}

// Default HTTP handler, for manual testing (POST a JSON body with the
// same fields as a lead record) or for /api/voice/process-queue.js to
// call back into once a queued
// call's scheduled_for time arrives.
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let lead = req.body;
  if (typeof lead === "string") {
    try {
      lead = JSON.parse(lead);
    } catch (err) {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }
  }
  lead = lead || {};

  try {
    const result = await triggerOutboundCall(lead);
    return res.status(200).json({ ok: true, result: result });
  } catch (err) {
    console.error("[voice/trigger-call] handler failed:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

module.exports.triggerOutboundCall = triggerOutboundCall;
module.exports.checkCallingWindow = checkCallingWindow;
module.exports.nextAllowedTime = nextAllowedTime;
module.exports.buildKnownAnswers = buildKnownAnswers;
