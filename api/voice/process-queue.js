// /api/voice/process-queue.js
//
// Processes calls that /api/voice/trigger-call.js queued because they
// landed outside the compliant calling window (see the constants and
// comments there). Intended to be hit periodically by a scheduler, e.g.
// a Vercel Cron entry such as:
//
//   { "path": "/api/voice/process-queue", "schedule": "*/15 * * * *" }
//
// in vercel.json. Adding that cron entry is NOT done in this file - it
// is outside this task's file scope (vercel.json is shared, owned by
// whoever assembles the final PR for this branch) and is flagged in the
// build report as a follow-up. Without a cron (or some other scheduler)
// calling this endpoint, queued calls will sit in "queued" indefinitely
// and nothing will process them - that is expected and safe (fails
// closed, not open), just incomplete until wired up.
//
// Same OUTBOUND_CALLING_ENABLED flag as trigger-call.js applies here too
// - this will not place a real call unless it is explicitly "true".
//
// This is a stub: it reads queued rows from Supabase if configured,
// re-checks the calling window for each one (since "now" has moved on
// from when it was queued), places the call via the same logic
// trigger-call.js uses, and marks the row as called/still-queued. If
// Supabase is not configured, it logs what it would have done and exits,
// same stub spirit as the rest of this build.

const { checkCallingWindow, buildKnownAnswers } = require("./trigger-call.js");

const OUTBOUND_CALLING_ENABLED =
  String(process.env.OUTBOUND_CALLING_ENABLED || "false").toLowerCase() ===
  "true";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const VAPI_API_KEY = process.env.VAPI_API_KEY || "";
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || "";
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || "";

async function fetchDueQueuedCalls() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(
      "[voice/process-queue] no Supabase env vars set - nothing to process (stub queue only logs, it does not persist across invocations).",
    );
    return [];
  }

  const nowIso = new Date().toISOString();
  const url =
    SUPABASE_URL +
    "/rest/v1/scheduled_calls?status=eq.queued&scheduled_for=lte." +
    encodeURIComponent(nowIso);

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
    },
  });

  if (!res.ok) {
    throw new Error("Could not fetch scheduled_calls (" + res.status + ")");
  }

  return res.json();
}

async function markCallRow(id, patch) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  await fetch(
    SUPABASE_URL + "/rest/v1/scheduled_calls?id=eq." + encodeURIComponent(id),
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify(patch),
    },
  ).catch(function (err) {
    console.error("[voice/process-queue] could not update scheduled_calls row:", err);
  });
}

module.exports = async function handler(req, res) {
  if (!OUTBOUND_CALLING_ENABLED) {
    return res.status(200).json({
      ok: true,
      processed: 0,
      note: "OUTBOUND_CALLING_ENABLED is false, queue not processed.",
    });
  }

  let due;
  try {
    due = await fetchDueQueuedCalls();
  } catch (err) {
    console.error("[voice/process-queue] failed to fetch queue:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }

  const results = [];
  for (const row of due) {
    const windowCheck = checkCallingWindow(new Date());
    if (!windowCheck.allowed) {
      // Still outside the window (e.g. cron ran a little early/late
      // relative to the boundary) - leave it queued, do not call.
      results.push({ id: row.id, status: "still_queued", reason: windowCheck.reason });
      continue;
    }

    if (!VAPI_API_KEY || !VAPI_ASSISTANT_ID || !VAPI_PHONE_NUMBER_ID) {
      results.push({ id: row.id, status: "error", reason: "Missing Vapi env vars" });
      continue;
    }

    try {
      const vapiRes = await fetch("https://api.vapi.ai/call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + VAPI_API_KEY,
        },
        body: JSON.stringify({
          assistantId: VAPI_ASSISTANT_ID,
          phoneNumberId: VAPI_PHONE_NUMBER_ID,
          customer: { number: row.phone },
          assistantOverrides: {
            variableValues: row.known_answers || {},
          },
        }),
      });

      if (!vapiRes.ok) {
        const text = await vapiRes.text().catch(function () {
          return "";
        });
        throw new Error("Vapi call failed (" + vapiRes.status + "): " + text);
      }

      await markCallRow(row.id, { status: "called", called_at: new Date().toISOString() });
      results.push({ id: row.id, status: "called" });
    } catch (err) {
      console.error("[voice/process-queue] call failed for row", row.id, err);
      await markCallRow(row.id, { status: "error", error_message: err.message });
      results.push({ id: row.id, status: "error", reason: err.message });
    }
  }

  return res.status(200).json({ ok: true, processed: results.length, results: results });
};
