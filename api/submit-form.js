// Serverless function that receives every Kindred Systems website form
// submission (the contact page, plus all six advisory intake forms) and
// emails it via Resend. This replaces the shared Formspree endpoint
// (https://formspree.io/f/xpqgpdzg), which kept returning a genuine
// success response to the browser while nothing arrived at info@ -
// almost certainly a Formspree-account-side notification setting or the
// free plan's shared 50 submissions/month cap, neither of which was
// visible or fixable from the code.
//
// This function is self-contained (no npm dependencies) and logs every
// attempt, so a delivery problem shows up in Vercel's function logs
// instead of disappearing silently.
//
// Required environment variable (set in Vercel -> Project -> Settings ->
// Environment Variables, never in this repo):
//   RESEND_API_KEY   API key from a Resend.com account. The free tier
//                    (3,000 emails/month, 100/day) is far more than this
//                    site needs.
//
// Optional environment variables:
//   LEAD_NOTIFY_EMAIL  Overrides the notification recipient.
//                       Defaults to info@kindredsystems.com.au
//   RESEND_FROM_EMAIL  Overrides the "from" address. Defaults to Resend's
//                       shared sandbox address, which sends immediately
//                       with no setup. Once kindredsystems.com.au is
//                       verified as a sending domain in Resend, change
//                       this to something like:
//                       "Kindred Systems Website <noreply@kindredsystems.com.au>"

const DEFAULT_TO = "info@kindredsystems.com.au";
const DEFAULT_FROM = "Kindred Systems Website <onboarding@resend.dev>";
const ALLOWED_ORIGIN_SUBSTRING = "kindredsystems.com.au";

function isEmptySubmission(payload) {
  const values = Object.values(payload || {});
  return !values.some((v) => typeof v === "string" && v.trim().length > 0);
}

function buildEmailText(payload) {
  const skipKeys = new Set(["_subject"]);
  const lines = [];
  for (const [key, value] of Object.entries(payload || {})) {
    if (skipKeys.has(key)) continue;
    if (value === undefined || value === null || value === "") continue;
    lines.push(`${key}: ${value}`);
  }
  if (lines.length === 0) {
    lines.push("(No fields were filled in.)");
  }
  return lines.join("\n");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  // Best-effort origin check. This never blocks a request that has no
  // Origin/Referer header at all (some browsers omit it even for
  // same-origin fetches), it only rejects a request that explicitly
  // names a different site.
  const origin = req.headers.origin || req.headers.referer || "";
  if (origin && !origin.includes(ALLOWED_ORIGIN_SUBSTRING)) {
    console.warn(
      "submit-form: rejected request from unexpected origin",
      origin,
    );
    res.status(403).json({ ok: false, error: "Origin not allowed" });
    return;
  }

  let payload = req.body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch (err) {
      res.status(400).json({ ok: false, error: "Invalid JSON body" });
      return;
    }
  }
  if (!payload || typeof payload !== "object") {
    res.status(400).json({ ok: false, error: "Missing form data" });
    return;
  }

  if (isEmptySubmission(payload)) {
    res.status(400).json({ ok: false, error: "Empty submission" });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error(
      "submit-form: RESEND_API_KEY is not set. Add it in Vercel project settings before this can send email.",
    );
    res.status(500).json({ ok: false, error: "Email service not configured" });
    return;
  }

  const toEmail = process.env.LEAD_NOTIFY_EMAIL || DEFAULT_TO;
  const fromEmail = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  const subjectLine =
    (typeof payload._subject === "string" && payload._subject.trim()) ||
    "New website enquiry - kindredsystems.com.au";

  const replyTo =
    typeof payload.email === "string" && payload.email.trim()
      ? payload.email.trim()
      : undefined;

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        reply_to: replyTo,
        subject: `Kindred Systems - ${subjectLine}`,
        text: buildEmailText(payload),
      }),
    });

    const resendJson = await resendRes.json().catch(() => ({}));

    if (!resendRes.ok) {
      console.error("submit-form: Resend rejected the email", {
        status: resendRes.status,
        body: resendJson,
      });
      res.status(502).json({ ok: false, error: "Email service error" });
      return;
    }

    console.log("submit-form: email sent", {
      resendId: resendJson.id,
      subject: subjectLine,
      vertical: payload.vertical || null,
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("submit-form: unexpected error sending email", err);
    res.status(500).json({ ok: false, error: "Unexpected error" });
  }
};
