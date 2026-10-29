// Receives Vapi end-of-call reports from the voice version of the
// recruitment intake and forwards the answers to the same Formspree
// inbox the written form uses.
//
// The shared secret lives only in Vercel environment variables
// (VAPI_WEBHOOK_SECRET) and in the Vapi assistant settings.
// Never put it in this file.
//
// If the Vapi request carries no secret header at all, it is still
// accepted when it comes from the Kindred intake assistant
// (VAPI_ASSISTANT_ID). A wrong secret is always rejected. Once the
// x-vapi-secret header is set in Vapi, every real call carries it.

const FORMSPREE_URL = "https://formspree.io/f/xpqgpdzg";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  let body = req.body || {};
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      res.status(400).json({ ok: false, error: "Invalid JSON" });
      return;
    }
  }

  const message = body.message || {};
  const call = message.call || {};

  const expected = process.env.VAPI_WEBHOOK_SECRET;
  const provided = req.headers["x-vapi-secret"];
  const assistantId = process.env.VAPI_ASSISTANT_ID;
  const fromOurAssistant =
    !!assistantId &&
    (call.assistantId === assistantId ||
      (message.assistant && message.assistant.id === assistantId));

  let authorised = false;
  if (provided) {
    authorised = !!expected && provided === expected;
  } else {
    authorised = fromOurAssistant;
  }
  if (!authorised) {
    res.status(401).json({ ok: false, error: "Unauthorised" });
    return;
  }

  // Vapi sends several event types. Only the final report is forwarded.
  if (message.type !== "end-of-call-report") {
    res.status(200).json({ ok: true, ignored: message.type || "unknown" });
    return;
  }

  const analysis = message.analysis || {};
  const answers = analysis.structuredData || {};
  const artifact = message.artifact || {};

  const payload = Object.assign(
    {
      _subject: "New pre-onboarding intake - Recruitment (voice)",
      vertical: "recruitment",
      source: "voice",
    },
    answers,
    {
      call_summary: analysis.summary || "",
      transcript: message.transcript || artifact.transcript || "",
      ended_reason: message.endedReason || "",
      call_id: call.id || "",
    },
  );

  try {
    const fsRes = await fetch(FORMSPREE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!fsRes.ok) {
      const text = await fsRes.text();
      console.error("Formspree error", fsRes.status, text);
      res.status(502).json({ ok: false, error: "Forwarding failed" });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Forwarding error", err);
    res.status(502).json({ ok: false, error: "Forwarding failed" });
  }
};
