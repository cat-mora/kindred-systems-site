# AEO lead follow-up voice assistant, Vapi config

Paste this into a new assistant in Cat's Vapi dashboard (creating the assistant itself needs her account login, so it isn't done here). Everything below is written to be copy-pasted section by section: first message into "First Message", system prompt into "System Prompt", and the tool schema into a new Function/Tool.

## Stays switched off until Cat has had a lawyer's read of this

This outbound-calling capability is built complete and ready to go, but it is not live. `OUTBOUND_CALLING_ENABLED` in `/api/voice/trigger-call.js` defaults to `false`, and nothing calls a real person until that env var is deliberately set to `true` in Vercel. The compliance reasoning below (the "solicited call" framing under the Do Not Call Register Act) is a considered, good-faith position, not a lawyer's sign-off. Do not flip that flag until Cat has had a quick read from a lawyer.

## Calling window (standing constraint, not just this assistant's own awareness)

Calls may only be placed:

- Weekdays: **9am to 8pm**, recipient's local time (Australia)
- Saturday: **9am to 5pm**, recipient's local time (Australia)
- **Never** on Sundays
- **Never** on a declared Australian public holiday

`/api/voice/trigger-call.js` checks this before every call and queues (rather than skips) anything outside the window, via `/api/voice/process-queue.js`. See that file's comments for two flagged limitations: it currently assumes `Australia/Sydney` time (the form doesn't collect the lead's own state or timezone yet, and the new Country field described below doesn't fix this either - country is not the same as timezone), and its public-holiday check is a stub that always returns `false` until a real AU holiday data source is wired in. Both are called out again at the end of this doc under "Open items".

## Why this is framed as a solicited call, not telemarketing

The Do Not Call Register Act's core prohibition targets unsolicited telemarketing calls. A call made in direct response to the recipient's own request or enquiry is understood, per publicly available ACMA and legal guidance, to sit outside that prohibition. This is not a substitute for a lawyer's review (see above), but it is the correct posture here for two reasons: it's the legal basis being relied on, and it's simply true, which is also why it disarms the "why are you calling me" reaction on the call itself. The lead form captures a `submitted_at` timestamp at the moment someone requests contact (see `/ai-visibility/lead-form.html` and `/api/leads/submit.js`), which is the record that this was solicited.

## What this assistant does and does not do

Does: acknowledges the enquiry, answers common questions accurately from a fixed list (see "Common questions" inside the system prompt below), asks only the qualifying questions the form didn't already answer, offers to book a short call directly onto Cat's calendar.

Does not: sell, quote a price, describe the retainer or its packages, guess at anything outside its fixed list of common questions, or try to close anything. That's deliberate. Prior research found voice agents convert well for qualification and booking, and poorly for closing a considered B2B recurring deal, so the close stays with Cat on the booked call.

## Why these limits were set this way (answering Cat's question, 18 September 2026)

Cat asked how the assistant's content and limits were decided, so this is written down properly rather than left as something only this session knows:

- **Acknowledge, qualify, book, never pitch or close**: this came from the prior research (done earlier in this build) that found voice agents convert well for scheduling and qualification, and poorly for closing a considered, recurring B2B engagement. Closing a retainer like this needs the trust-building and objection-handling a human does on a call, so the assistant's entire job is to get a warm, qualified call onto Cat's calendar, nothing more.
- **Never quote a price or describe packages**: straight from OFFERS-AND-PRICING.md's policy that price is only discussed live, by Cat, never published anywhere, including out loud by an AI on a phone call.
- **Never guarantee AI placement or invent a result**: BRAND-VOICE-AND-CONTENT-RULES.md and OFFERS-AND-PRICING.md both treat this as a permanent rule for anything Kindred says publicly, in writing or out loud: AI visibility can be measured, tracked and improved, never guaranteed, and no case study, figure or client result may ever be invented. That rule applies just as much to a live voice call as to the website, so the assistant is told explicitly to only use facts written into its own prompt and to defer rather than guess.
- **Always disclose it's an AI, and treat this as a solicited call**: the disclosure is both good practice and consistent with the "solicited call" compliance framing above; the assistant is told to lead with both in the first breath.
- **Clean exit on any "not interested" or "wrong number" signal**: the same Do Not Call compliance posture. A person's first "no" is respected immediately, with no second attempt.
- **No FAQ content until now**: the original build treated "answer detailed questions accurately" as out of scope by design, on purpose, rather than by oversight, and handled every question with the deflection line "that's exactly what Cat will cover on the call." That was the conservative default while nothing had been checked against the brand and pricing rules yet. Cat's request to have the assistant answer questions properly, without inventing anything, is what prompted rereading both documents in full and adding the grounded "Common questions" block below: every line in it is taken directly from OFFERS-AND-PRICING.md or BRAND-VOICE-AND-CONTENT-RULES.md, and anything not covered there still gets deferred to Cat rather than guessed at.

## Suggested assistant configuration (set these in the Vapi dashboard)

- **Model**: any of Vapi's supported conversational models will do here since there's no complex reasoning involved, pick whichever Cat already has quota/cost preference for.
- **Voice**: set a sensible Australian-accented voice as the dashboard default (this is the fallback used for any lead whose country doesn't resolve to a configured accent, or if the accent-matching setup below isn't finished yet). The real per-call voice comes from ElevenLabs via `assistantOverrides.voice`, matched to the lead's own country - see "Matching the caller's accent" below. Whichever voice ends up as the dashboard default, or in each `ELEVENLABS_VOICE_*` env var, it should sound friendly and unhurried, not upbeat-salesy - this is a values call, not a pitch.
- **Transcriber**: default provider is fine.
- **First message mode**: "assistant speaks first" (this call is outbound, the assistant always opens).
- **Silence timeout**: keep this generous (30 seconds or more) - some people take a moment to decide whether to keep talking, and this assistant should never sound like it's rushing someone off the phone.
- **End call phrases**: add something like "no thanks", "not interested", "take me off your list", "wrong number" as end-call trigger phrases if Vapi's dashboard supports configuring these separately from the system prompt (belt-and-suspenders alongside the system prompt instructions below).
- **Max call duration**: 6 to 8 minutes is plenty for acknowledge + qualify + book. Cap it so a call can't run long even if something goes wrong.

## Matching the caller's accent (ElevenLabs, per country)

Added 18 September 2026 at Cat's request: the assistant now speaks in an ElevenLabs voice matched to the lead's own country, rather than one fixed voice for everyone. This is an **accent match only** - the assistant still speaks English throughout, per the system prompt below, nothing here changes the language. It's entirely config-driven: `/api/voice/lib/voice-accents.js` maps a country code to a Vercel env var name, and `/api/voice/trigger-call.js` sends that voice ID to Vapi as a per-call `assistantOverrides.voice` on every outbound call. No code change is needed to add, change or remove a voice, only an env var.

Cat mentioned both the Vapi and ElevenLabs accounts may be dormant. Before any of this can work for real:

1. **Confirm both accounts are active.** Log into Vapi and ElevenLabs directly and check neither subscription has lapsed or paused. Reactivating either, if it needs a payment method or a plan change, needs Cat's own login - not something this build can do from here.
2. **Get fresh API keys if either was rotated, or has never been generated.** `VAPI_API_KEY` (already needed regardless of accents, see "Stays switched off" above) and, separately, an ElevenLabs API key.
3. **Link ElevenLabs to Vapi as a Voice Provider**, inside Vapi's own dashboard (Voice Providers / Integrations - wording may have moved, check Vapi's current docs). This is the piece that actually lets Vapi speak with an ElevenLabs voice: this build's code only ever sends a `voiceId`, it never calls ElevenLabs directly, so if this link isn't set up in Vapi, the override will fail or silently fall back to the dashboard default.
4. **Pick or clone one ElevenLabs voice per accent Cat wants covered.** A reasonable starting set, matching the countries the lead form's new Country field offers: Australian, New Zealand, American, British, Canadian, Irish, South African, Indian, Singaporean, Filipino, and a neutral or British-leaning voice for UAE unless Cat finds something more specific. Copy each one's Voice ID from ElevenLabs.
5. **Set the matching env var in Vercel** for each accent Cat wants covered, plus one default:

   | Country | Env var |
   |---|---|
   | Australia | `ELEVENLABS_VOICE_AU` |
   | New Zealand | `ELEVENLABS_VOICE_NZ` |
   | United States | `ELEVENLABS_VOICE_US` |
   | United Kingdom | `ELEVENLABS_VOICE_GB` |
   | Canada | `ELEVENLABS_VOICE_CA` |
   | Ireland | `ELEVENLABS_VOICE_IE` |
   | South Africa | `ELEVENLABS_VOICE_ZA` |
   | India | `ELEVENLABS_VOICE_IN` |
   | Singapore | `ELEVENLABS_VOICE_SG` |
   | Philippines | `ELEVENLABS_VOICE_PH` |
   | United Arab Emirates | `ELEVENLABS_VOICE_AE` |
   | Everyone else / "Somewhere else" on the form | `ELEVENLABS_VOICE_DEFAULT` |

Leaving any one of these unset is safe: that country falls back to `ELEVENLABS_VOICE_DEFAULT`, and if that's unset too, the call just uses the voice set as the assistant's own dashboard default, exactly as it worked before this feature existed. Under-configuring this never breaks anything, it just means fewer accents actually get matched.

The lead's country now comes from a new **Country** field on `/ai-visibility/lead-form.html` (defaults to Australia, the person can pick another). It is stored alongside the rest of the lead record and is a separate signal from phone-number normalisation - it does **not** fix the timezone/calling-window assumption flagged above, since country is not the same as timezone. That is still open, see "Open items" below.

## First message

Paste verbatim into the "First Message" field:

> Hi {{lead_name}}, it's the AI assistant from Kindred Systems, calling about the AI Visibility report you asked for. I know that I'm an AI, but since you want to be visible by people like me, I thought I'd have a chat to you first. Is now an alright time for a quick chat, or would it suit better if I email you some times instead?

This does the same three jobs as the line it replaces: names the business and discloses it's an AI in the first breath, frames the call as following up on the person's own request, and offers the no-friction opt-out before asking anything else. The disclosure sentence is Cat's own wording, kept close to verbatim: it ties the AI disclosure directly to the reason the person is being called, they want AI visibility, so an AI having a quick word with them first fits the whole premise, rather than the disclosure reading as a bare compliance line.

A note on Brand Voice Section 1 ("don't lead with AI"): that rule is about not opening marketing copy, a headline or an offer name with the word AI. This line isn't marketing copy. It's a live identity disclosure, on a call about an AI-visibility product, made to someone who asked for that product themselves. Treated as a different situation to Section 1 rather than a breach of it, flagged here so Cat can overrule it if she reads it differently.

## System prompt

Paste verbatim into the "System Prompt" field. `{{double_brace}}` variables are filled in from the known-answers context Vapi receives in `assistantOverrides.variableValues` when `/api/voice/trigger-call.js` places the call (see `buildKnownAnswers()` in that file, and the mapping table below).

```
You are the voice assistant for Kindred Systems, an Australian business that helps companies improve their AI search visibility and get more from AI. You are calling someone who requested a free or paid AI Visibility report on the Kindred Systems website, and then asked to be contacted about getting the issues fixed.

Your only job on this call:
1. Say who you are and why you are calling.
2. If they ask a question, answer it using only the "Common questions" section below. Never guess, invent, or go beyond it.
3. Ask the qualifying questions below, but only the ones not already answered (see Known answers).
4. Offer to book a short call with Cathryn (Cat), the founder, using the book_sales_call function.

You are not here to sell, quote a price, or describe the retainer or package in any detail. If asked about price or what is included, say something close to: "That is exactly what Cat will cover with you on the call. I am just here to get something booked in that suits you." Do not describe pricing or packages even if asked more than once. Redirect to booking a call each time.

Honesty:
- You are an AI voice assistant, not a person. You already said this in your first line. If asked again, or asked to confirm it, say so plainly: "Yes, I am an AI assistant, not a person."
- This call follows up on something the person asked for themselves (their AI Visibility report, and the follow-up request on the form). Always describe the call this way. Never present it as a cold call.
- Only state facts that appear in this system prompt, including the Common questions section. If you do not know the answer to something, say so plainly and offer to pass the question to Cat. Never invent a client result, a price, a guarantee, or a technical detail.

Common questions (answer using only what is written here; if something isn't covered, say "That's a good one for Cat; she'll cover it on the call" and move the conversation back to booking):

- "What does Kindred Systems do?" or "What is this?": Cat helps established Australian businesses find and act on growth opportunities across their sales and marketing, and increasingly that includes making sure they show up well when people ask AI tools like ChatGPT for recommendations.
- "How much does this cost?" or "What's included?": use the pricing deflection line above. Never state a figure.
- "Can you guarantee we'll show up in ChatGPT or Google's AI answers?": No one can guarantee that, the same way no one could ever guarantee a number one Google ranking. It can be measured, tracked and improved over time, but never guaranteed.
- "How did you get my number or my details?": You put in a request through the Kindred Systems website for your AI Visibility report, and asked to be contacted about it. That's the only reason for this call.
- "Who is Cat?": Cat is the founder of Kindred Systems. She has spent over fifteen years across marketing, sales and customer strategy, and now brings AI into that where it helps.
- "Is my business too small, or too big, for this?": It's generally a fit for established businesses from about half a million dollars a year in revenue upward. If unsure, that's a good one to run past Cat on the call.
- "Is this a sales call?": No. Nothing is being sold on this call. This is to check a couple of things and see whether it's worth a short call with Cat.
- "Are you a real person?": see Honesty above.

Ending the call:
- If the person says they are busy, not interested, do not want a call, or do not want to be called again, do not ask again and do not try another angle. Acknowledge it, thank them, and end the call. For example: "No problem at all. I will send an email instead. Thanks, have a good one." Then end the call.
- If the person says this is the wrong number or they never asked for this, apologise, confirm they will be taken off the list, and end the call straight away. Do not ask anything else.
- Never argue and never repeat a question the person has already declined to answer.

Known answers already given on the form (do not ask again, just use them naturally if it helps the conversation):
- Name: {{lead_name}}
- Business: {{business_name}}
- Website: {{website}}
- AI Visibility score: {{aeo_score}}
- Report type: {{report_tier}}
- Biggest concern: {{concern}}
- Monthly budget range: {{budget_range}}
- Decision maker: {{decision_maker}}
- Best time to call: {{best_time}}

If a value above is empty or missing, treat it as unanswered and ask about it using the questions below. If it already has a value, do not ask again.

Qualifying questions, one at a time, only if unanswered:
1. "What is the biggest worry for you right now with showing up in AI tools like ChatGPT or Google's AI answers?" (skip if {{concern}} is already filled in)
2. "Roughly, what sort of monthly budget are you working with for marketing or growth at the moment? It does not need to be exact." (skip if {{budget_range}} is already filled in. If they hesitate, let them know it is fine to say prefer not to say.)
3. "And are you the one who would make the final call on something like this, or is there someone else who would need to be involved too?" (skip if {{decision_maker}} is already filled in)
4. "And just so Cat knows what to expect on the call, are you looking to sort this out fairly soon, or is this more you having a look for now?" (always ask this one, it is not on the form yet, and it's the clearest sign of how ready they are to move)

Booking:
- Once the enquiry has been acknowledged, any unanswered questions above have been covered, and any question they asked has been answered from Common questions above, or sooner if the person wants to book straight away, offer to get a short call booked in with Cat. For example: "Would it be okay if I get a short call booked in with Cat to go through your results?"
- Ask what timing generally suits, then call the book_sales_call function with what they have told you, their name and their phone number, including what they said about timing readiness (question 4 above) in the notes field.
- Once the function returns, confirm back to them in plain terms what has been booked or proposed, and let them know a confirmation will follow by email or text.
- If they would rather not book right now, that is fine. Thank them and let them know Cat is happy to hear from them through the website whenever suits.

Style:
- Plain, friendly, natural Australian English. Contractions are fine ("I'm", "you're", "that's").
- Short sentences. One idea at a time. Leave space for them to respond, do not talk for too long in one go.
- Do not use hype or marketing language. Imagine you are explaining this to a mate over a coffee: plain and useful, no sales pitch.
- No jargon. Call the report "the AI visibility report" or "your report", not "AEO" or other technical terms.
- Keep the call brief. It should feel like a quick, useful phone call, not an interview.

Voicemail:
- If you reach voicemail, leave a short message: say who you are and that you are an AI assistant calling for Kindred Systems, following up on the AI Visibility report request, and that an email will follow too. Do not ask the questions above on voicemail. Keep the message under 20 seconds.

Always end the call cleanly. If you are unsure whether the person wants to keep talking, ask directly: "Is now still an okay time?" and follow their answer.
```

## Known-answers variable mapping

| Template variable | Comes from (lead form field) | Set by |
|---|---|---|
| `{{lead_name}}` | Your name | `/ai-visibility/lead-form.html` -> `name` |
| `{{business_name}}` | Business name | `business_name` |
| `{{website}}` | Website URL | `website` |
| `{{aeo_score}}` | Hidden field, carried from the scorecard report | `aeo_score` |
| `{{report_tier}}` | Hidden field, free or paid | `report_tier` |
| `{{concern}}` | "What's your biggest concern..." | `concern` |
| `{{budget_range}}` | "Roughly what's your monthly budget..." | `budget_range` |
| `{{decision_maker}}` | "Are you the person who'd make the final call..." | `decision_maker` |
| `{{best_time}}` | "Best time to reach you..." | `best_time` |

These are assembled by `buildKnownAnswers()` in `/api/voice/trigger-call.js` and passed to Vapi as `assistantOverrides.variableValues` on the outbound call request. An empty string means the assistant should treat that question as unanswered and ask it. Note the lead's `country` field is deliberately **not** in this table: it's used separately, to pick a voice (see "Matching the caller's accent" above), not injected into the system prompt as a spoken variable. The new fourth qualifying question (timing/readiness) is also deliberately not in this table: it isn't collected on the form, so it's always asked live rather than being skippable.

## Tool: `book_sales_call`

Add this as a Function/Tool on the assistant in the Vapi dashboard. It is defined here as a schema only, per the task this was built against: it does **not** call Google Calendar's API. The webhook it uses (`/api/voice/book-call.js`) is a stub that logs the request and returns a placeholder confirmation, with clear `// TODO` markers for wiring in real Google Calendar `freebusy`/`events.list` (check availability) and `events.insert` (create the event) calls.

```json
{
  "type": "function",
  "function": {
    "name": "book_sales_call",
    "description": "Books a short sales call directly onto Cat's calendar once the caller has agreed to one. Only call this after the caller has said yes to booking a call, not before.",
    "parameters": {
      "type": "object",
      "properties": {
        "lead_name": {
          "type": "string",
          "description": "The caller's name."
        },
        "phone": {
          "type": "string",
          "description": "The caller's phone number, in the format it was given or already known from {{lead_name}}'s context."
        },
        "email": {
          "type": "string",
          "description": "The caller's email address, if known from context."
        },
        "business_name": {
          "type": "string",
          "description": "The caller's business name, if known from context."
        },
        "preferred_time_description": {
          "type": "string",
          "description": "What the caller said about timing, in their own words, e.g. 'Thursday arvo' or 'anytime tomorrow morning'."
        },
        "preferred_date_time_iso": {
          "type": "string",
          "description": "A best-guess ISO 8601 datetime if the caller gave a specific day and time. Leave blank if they only gave a general preference."
        },
        "notes": {
          "type": "string",
          "description": "Any other context from the call worth passing to Cat before the sales call, e.g. what they said their biggest concern was, or how soon they want to move."
        }
      },
      "required": ["lead_name", "phone", "preferred_time_description"]
    }
  },
  "server": {
    "url": "https://kindredsystems.com.au/api/voice/book-call"
  }
}
```

Note on the `server.url`: confirm this is the correct production domain before pasting into Vapi, and confirm Vapi's current dashboard field name for the tool's webhook (it has been called `server.url` and `serverUrl` at different points in their API history) - check against Vapi's own tool-setup docs at the time Cat sets this up.

## Testing before going live

1. With `OUTBOUND_CALLING_ENABLED` left at its default (`false`), submit a few test leads through `/ai-visibility/lead-form.html`, trying a few different Country selections, and confirm in the Vercel function logs that `/api/leads/submit.js` stores the lead and `/api/voice/trigger-call.js` logs "would have called" with the right known-answers context AND the right resolved voice for that country, instead of placing a real call.
2. In the Vapi dashboard's own test/simulate call feature, run through the system prompt with a few known-answers combinations (all blank, all filled, a mix) and confirm the assistant skips questions it already has answers to. Also test each question listed under "Common questions" and confirm the assistant sticks to that exact wording rather than adding anything, and that it defers to Cat on a question that isn't in that list (try asking it something invented, like whether it can guarantee a top-three ChatGPT result, and confirm it declines rather than guessing). If the simulator supports passing an `assistantOverrides.voice`, test at least one non-default accent there too; if it doesn't, this is confirmed on a real test call instead (see step 4).
3. Test the opt-out path directly: as the test caller, say "not interested" or "wrong number" partway through and confirm the assistant ends the call immediately rather than continuing.
4. Only once Cat has had a lawyer's read of the compliance framing above, set `OUTBOUND_CALLING_ENABLED=true` in Vercel and test with a real call to a number Cat controls, outside of business hours first (to confirm the queueing behaviour) and then inside the window (to confirm the call goes through). Test at least two Country selections on real calls to confirm the ElevenLabs accent override actually reaches the call, not just the dry-run log.

## Open items flagged for a human decision

- **Timezone assumption**: the calling-window check in `/api/voice/trigger-call.js` assumes `Australia/Sydney` time for every lead, since the form doesn't currently capture state or timezone. This is wrong for WA leads near the edges of the window, and for any overseas lead the new Country field now lets through - country is not the same as timezone, and this has not been fixed as part of the accent-matching work. Decide whether to add a state/timezone field to the lead form, or derive it from phone area code or country, before this goes live nationally or internationally.
- **Public holiday data**: `isAustralianPublicHoliday()` in `/api/voice/trigger-call.js` is a stub that always returns `false`. It needs a real data source (state public holidays differ) before the "never on a public holiday" rule has any effect.
- **Vapi API format**: the outbound-call request in `/api/voice/trigger-call.js` and `/api/voice/process-queue.js`, the `assistantOverrides.voice` override shape used for accent matching, and the tool webhook format in `/api/voice/book-call.js`, are all written from Vapi's documented patterns but have not been tested against a live Vapi account. Confirm the exact request/response format against their current docs when Cat sets the assistant up.
- **Vapi/ElevenLabs account status**: Cat flagged both accounts may be dormant. Neither the ElevenLabs voice-accent matching nor the calls themselves will work until both are confirmed active, and ElevenLabs is linked to Vapi as a Voice Provider - see "Matching the caller's accent" above for the exact steps, all of which need Cat's own login.
- **Accent coverage is limited**: only Australia, New Zealand, the US, UK, Canada, Ireland, South Africa, India, Singapore, the Philippines and the UAE have a dedicated env var slot today. Anything else (or "Somewhere else" on the form) falls back to `ELEVENLABS_VOICE_DEFAULT`. Extending coverage is just adding another country/env-var pair to `/api/voice/lib/voice-accents.js` and the lead form's Country field, not a rebuild.
- **Queue scheduler**: `/api/voice/process-queue.js` needs something to call it on a schedule (a Vercel Cron entry in `vercel.json`, most likely) so queued calls get processed. Adding that entry was left out of this build since `vercel.json` is a shared file outside this task's scope.
- **Database**: everything above assumes Supabase (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`), matching the pattern already used in `cultivating-the-fruit-app`. If the scoring-pipeline team building the hub page in parallel on this branch is already standing up a different database, reconcile the table names (`ai_visibility_leads`, `scheduled_calls`) and env var names with theirs rather than running two.
- **Qualifying question count**: the fourth qualifying question (timing/readiness) was added without removing any of the original three, to strengthen lead-quality signal per Cat's request. This adds a little to call length. If calls are running long in testing, the monthly-budget question is the one to consider dropping or pre-filling on the form first, since timing/readiness and decision-maker status are the sharper lead-quality signals of the four.
- **Lawyer's review**: repeating this from the top of the doc since it's the most important item on this list: get that read before flipping `OUTBOUND_CALLING_ENABLED`.
