// Receives Vapi end-of-call reports from the voice version of the
// recruitment intake and forwards the answers to the same Formspree
// inbox the written form uses.
//
// The shared secret lives only in Vercel environment variables
// (VAPI_WEBHOOK_SECRET) and in the Vapi assistant settings.
// Never put it in this file.

const FORMSPREE_URL = "https://formspree.io/f/xpqgpdzg";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const expected = process.env.VAPI_WEBHOOK_SECRET;
  const provided = req.headers["x-vapi-secret"];
  if (!expected || provided !== expected) {
    res.status(401).json({ ok: false, error: "Unauthorised" });
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

  // Vapi sends several event types. Only the final report is forwarded.
  if (message.type !== "end-of-call-report") {
    res.status(200).json({ ok: true, ignored: message.type || "unknown" });
    return;
  }

  const analysis = message.analysis || {};
  const answers = analysis.structuredData || {};
  const artifact = message.artifact || {};
  const call = message.call || {};

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
