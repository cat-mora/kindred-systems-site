// /api/voice/book-call.js
//
// Webhook stub for the Vapi "book_sales_call" tool (see
// /docs/vapi/aeo-qualify-and-book-assistant.md for the tool's schema and
// where this URL goes in the Vapi dashboard). When the voice assistant
// decides to book a call, Vapi sends a server-side request here with the
// function-call arguments, and this returns a result the assistant reads
// back to the caller.
//
// THIS DOES NOT TOUCH GOOGLE CALENDAR. It is a stub that logs the
// request and returns a placeholder response, exactly as the task calls
// for - someone with Google Calendar API access needs to wire the real
// check-availability + create-event calls in. See the TODOs inline.
//
// Also gated by OUTBOUND_CALLING_ENABLED for consistency with the rest
// of the voice flow, even though this endpoint alone does not place a
// phone call - if outbound calling is switched off, the assistant that
// would invoke this tool is never placing a call in the first place, so
// this is mostly a safety net in case it is ever hit directly during
// testing.

const OUTBOUND_CALLING_ENABLED =
  String(process.env.OUTBOUND_CALLING_ENABLED || "false").toLowerCase() ===
  "true";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Vapi's tool-call webhook payload has a specific envelope
  // (message.toolCalls[].function.arguments, roughly). Confirm the exact
  // current format against Vapi's docs when wiring this up for real - the
  // extraction below is written defensively so it does not crash if the
  // format differs slightly, but it has not been tested against a live
  // Vapi account.
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (err) {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }
  }
  body = body || {};

  const toolCall =
    body.message &&
    body.message.toolCalls &&
    body.message.toolCalls[0];
  const args =
    (toolCall && toolCall.function && toolCall.function.arguments) ||
    body.arguments ||
    body;

  console.log("[voice/book-call] book_sales_call invoked with:", JSON.stringify(args));

  if (!OUTBOUND_CALLING_ENABLED) {
    return res.status(200).json({
      results: [
        {
          toolCallId: toolCall && toolCall.id,
          result:
            "Outbound calling / booking is not yet switched on for this account. No booking was made.",
        },
      ],
    });
  }

  // TODO: real implementation, once someone wires Google Calendar in:
  //   1. Check availability - GET Cat's calendar (Google Calendar API,
  //      freebusy.query or events.list) around args.preferred_date_time_iso,
  //      or around the general slot implied by args.preferred_time_description
  //      if no specific time was given.
  //   2. Create the event - Google Calendar API events.insert on Cat's
  //      sales-call calendar, with args.lead_name / args.phone / args.email /
  //      args.business_name / args.notes in the event description, and an
  //      appropriate duration (confirm with Cat, 30 minutes is assumed
  //      here as a placeholder).
  //   3. Return the confirmed start time (and ideally a meeting
  //      link/dial-in) so the assistant can read it back to the caller
  //      and the person gets a calendar invite.
  //
  // Stub response below always returns a placeholder time one business
  // day out at 10am Sydney time, purely so the assistant has something
  // concrete to read back to the caller during testing. This is NOT a
  // real booking and nothing is written to any calendar.

  const placeholderTime = new Date();
  placeholderTime.setDate(placeholderTime.getDate() + 1);
  placeholderTime.setHours(10, 0, 0, 0);

  return res.status(200).json({
    results: [
      {
        toolCallId: toolCall && toolCall.id,
        result:
          "STUB: would book a call for " +
          (args.lead_name || "the caller") +
          " around " +
          placeholderTime.toISOString() +
          " once Google Calendar is wired in. No real booking has been made.",
      },
    ],
  });
};
