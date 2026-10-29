// Returns the Vapi public key and assistant ID for the voice intake.
// Values live in Vercel environment variables (VAPI_PUBLIC_KEY and
// VAPI_ASSISTANT_ID). The public key is the browser-safe key, restricted
// in Vapi to kindredsystems.com.au and this one assistant.

module.exports = (req, res) => {
  const publicKey = process.env.VAPI_PUBLIC_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;
  if (!publicKey || !assistantId) {
    res.status(503).json({ ok: false });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ ok: true, publicKey, assistantId });
};
