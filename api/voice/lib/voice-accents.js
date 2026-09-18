// /api/voice/lib/voice-accents.js
//
// Maps a lead's country to the ElevenLabs voice Vapi should speak with on
// that call, so the accent roughly matches the person being called.
// Added 18 September 2026 at Cat's direct request. This is an ACCENT
// match only, not a language switch - the assistant still speaks English
// throughout (see the system prompt in
// /docs/vapi/aeo-qualify-and-book-assistant.md).
//
// Cat provides the actual ElevenLabs voice IDs, one per accent she wants
// covered, as Vercel env vars. This file only holds the country -> env
// var mapping and the fallback logic, and never hardcodes a voice ID, so
// swapping a voice never needs a code change.
//
// SETUP CAT NEEDS TO DO before any of this does anything real (full
// walkthrough in docs/vapi/aeo-qualify-and-book-assistant.md, "Matching
// the caller's accent" section):
//   1. Confirm the Vapi and ElevenLabs accounts are both active - Cat
//      flagged both may be dormant. Reactivating either needs her own
//      login, this build can't do that step.
//   2. In Vapi's dashboard, under Voice Providers, connect the
//      ElevenLabs API key so Vapi can synthesise 11labs voices directly.
//      This code only ever sends a voiceId to Vapi - it never calls
//      ElevenLabs itself, so if this link isn't set up in Vapi, the
//      override will fail or silently fall back.
//   3. In ElevenLabs, pick (or clone) one voice per accent below and
//      copy its Voice ID.
//   4. Set the matching env var in Vercel for each accent Cat wants
//      covered. Leaving one unset just means that country falls back to
//      ELEVENLABS_VOICE_DEFAULT, and if that's unset too, the call uses
//      whatever voice is set as the assistant's own dashboard default.

const ACCENT_ENV_VAR_BY_COUNTRY = {
  AU: "ELEVENLABS_VOICE_AU",
  NZ: "ELEVENLABS_VOICE_NZ",
  US: "ELEVENLABS_VOICE_US",
  CA: "ELEVENLABS_VOICE_CA",
  GB: "ELEVENLABS_VOICE_GB",
  IE: "ELEVENLABS_VOICE_IE",
  ZA: "ELEVENLABS_VOICE_ZA",
  IN: "ELEVENLABS_VOICE_IN",
  SG: "ELEVENLABS_VOICE_SG",
  PH: "ELEVENLABS_VOICE_PH",
  AE: "ELEVENLABS_VOICE_AE",
};

const DEFAULT_ENV_VAR = "ELEVENLABS_VOICE_DEFAULT";

// Vapi's provider key for ElevenLabs voices. Written from Vapi's
// documented pattern, not confirmed against a live account - check this
// against Vapi's current docs when Cat sets the Voice Provider link up
// (same caveat as the rest of this build, see trigger-call.js).
const VAPI_ELEVENLABS_PROVIDER_KEY = "11labs";

// Given an ISO 3166-1 alpha-2 country code (case-insensitive, can be
// empty, "OTHER", or anything else unrecognised), returns
// { voiceId, provider, matched, countryCode }. Never throws - always
// resolves to *some* answer, falling back through the chain: exact
// country match -> ELEVENLABS_VOICE_DEFAULT -> "" (meaning "leave the
// assistant's own dashboard-configured voice alone").
function resolveVoiceForCountry(countryCode) {
  const normalised = String(countryCode || "")
    .trim()
    .toUpperCase();
  const envVarName = ACCENT_ENV_VAR_BY_COUNTRY[normalised];
  const specificVoiceId = envVarName ? process.env[envVarName] || "" : "";

  if (specificVoiceId) {
    return {
      voiceId: specificVoiceId,
      provider: VAPI_ELEVENLABS_PROVIDER_KEY,
      matched: true,
      countryCode: normalised,
    };
  }

  const defaultVoiceId = process.env[DEFAULT_ENV_VAR] || "";
  return {
    voiceId: defaultVoiceId,
    provider: VAPI_ELEVENLABS_PROVIDER_KEY,
    matched: false,
    countryCode: normalised,
  };
}

module.exports = {
  resolveVoiceForCountry,
  ACCENT_ENV_VAR_BY_COUNTRY,
  DEFAULT_ENV_VAR,
};
