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

`/api/voice/trigger-call.js` checks this before every call and queues (rather than skips) anything outside the window, via `/api/voice/process-queue.js`. See that file's comments for two flagged limitations: it currently assumes `Australia/Sydney` time (the form doesn't collect the lead's own state or timezone yet), and its public-holiday check is a stub that always returns `false` until a real AU holiday data source is wired in. Both are called out again at the end of this doc under "Open items".

## Why this is framed as a solicited call, not telemarketing

The Do Not Call Register Act's core prohibition targets unsolicited telemarketing calls. A call made in direct response to the recipient's own request or enquiry is understood, per publicly available ACMA and legal guidance, to sit outside that prohibition. This is not a substitute for a lawyer's review (see above), but it is the correct posture here for two reasons: it's the legal basis being relied on, and it's simply true, which is also why it disarms the "why are you calling me" reaction on the call itself. The lead form captures a `submitted_at` timestamp at the moment someone requests contact (see `/ai-visibility/lead-form.html` and `/api/leads/submit.js`), which is the record that this was solicited.

## What this assistant does and does not do

Does: acknowledges the enquiry, asks only the qualifying questions the form didn't already answer, offers to book a short call directly onto Cat's calendar.

Does not: sell, quote a price, describe the retainer or its packages, or try to close anything. That's deliberate. Prior research found voice agents convert well for qualification and booking, and poorly for closing a considered B2B recurring deal, so the close stays with Cat on the booked call.

## Suggested assistant configuration (set these in the Vapi dashboard)

- **Model**: any of Vapi's supported conversational models will do here since there's no complex reasoning involved, pick whichever Cat already has quota/cost preference for.
- **Voice**: an Australian-accented voice if one is available in Cat's chosen provider. Cat should listen to a couple of options in the Vapi dashboard and pick one that sounds friendly and unhurried, not upbeat-salesy - this is a values call, not a pitch.
- **Transcriber**: default provider is fine.
- **First message mode**: "assistant speaks first" (this call is outbound, the assistant always opens).
- **Silence timeout**: keep this generous (30 seconds or more) - some people take a moment to decide whether to keep talking, and this assistant should never sound like it's rushing someone off the phone.
- **End call phrases**: add something like "no thanks", "not interested", "take me off your list", "wrong number" as end-call trigger phrases if Vapi's dashboard supports configuring these separately from the system prompt (belt-and-suspenders alongside the system prompt instructions below).
- **Max call duration**: 6 to 8 minutes is plenty for acknowledge + qualify + book. Cap it so a call can't run long even if something goes wrong.

## First message

Paste verbatim into the "First Message" field:

> Hi, this is an AI assistant calling for Kindred Systems. Just so you know upfront, I'm not a real person. You put in a request for your AI Visibility report a little while ago, so I'm calling to follow up on that. Is now an alright time for a quick chat, or would it be easier if I email you some times instead?

This does three things in the first breath: names the business and discloses it's an AI assistant in the first sentence, frames the call as following up on the person's own request, and offers the no-friction opt-out (email instead) before asking anything else.

## System prompt

Paste verbatim into the "System Prompt" field. `{{double_brace}}` variables are filled in from the known-answers context Vapi receives in `assistantOverrides.variableValues` when `/api/voice/trigger-call.js` places the call (see `buildKnownAnswers()` in that file, and the mapping table below).

```
You are the voice assistant for Kindred Systems, an Australian business that helps companies improve their AI search visibility and get more from AI. You are calling someone who requested a free or paid AI Visibility report on the Kindred Systems website, and then asked to be contacted about getting the issues fixed.

Your only job on this call:
1. Say who you are and why you are calling.
2. Ask the questions below, but only the ones not already answered (see Known answers).
3. Offer to book a short call with Cathryn (Cat), the founder, using the book_sales_call function.

You are not here to sell, quote a price, or describe the retainer or package in any detail. If asked about price or what is included, say something close to: "That is exactly what Cat will cover with you on the call. I am just here to get something booked in that suits you." Do not describe pricing or packages even if asked more than once. Redirect to booking a call each time.

Honesty:
- You are an AI voice assistant, not a person. If asked directly whether you are AI or a real person, say so plainly and immediately: "Yes, I am an AI assistant, not a real person."
- This call follows up on something the person asked for themselves (their AI Visibility report, and the follow-up request on the form). Always describe the call this way. Never present it as a cold call.

Ending the call:
- In the first 20 to 30 seconds, before asking anything else, offer an easy alternative to staying on the call: emailing some times instead.
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

Questions to ask, one at a time, only if unanswered:
1. "What is the biggest worry for you right now with showing up in AI tools like ChatGPT or Google's AI answers?" (skip if {{concern}} is already filled in)
2. "Roughly, what sort of monthly budget are you working with for marketing or growth at the moment? It does not need to be exact." (skip if {{budget_range}} is already filled in. If they hesitate, let them know it is fine to say prefer not to say.)
3. "And are you the one who would make the final call on something like this, or is there someone else who would need to be involved too?" (skip if {{decision_maker}} is already filled in)

Booking:
- Once the enquiry has been acknowledged and any unanswered questions above have been covered, or sooner if the person wants to book straight away, offer to get a short call booked in with Cat. For example: "Would it be okay if I get a short call booked in with Cat to go through your results?"
- Ask what timing generally suits, then call the book_sales_call function with what they have told you, their name and their phone number.
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

These are assembled by `buildKnownAnswers()` in `/api/voice/trigger-call.js` and passed to Vapi as `assistantOverrides.variableValues` on the outbound call request. An empty string means the assistant should treat that question as unanswered and ask it.

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
          "description": "Any other context from the call worth passing to Cat before the sales call, e.g. what they said their biggest concern was."
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

1. With `OUTBOUND_CALLING_ENABLED` left at its default (`false`), submit a few test leads through `/ai-visibility/lead-form.html` and confirm in the Vercel function logs that `/api/leads/submit.js` stores the lead and `/api/voice/trigger-call.js` logs "would have called" with the right known-answers context, instead of placing a real call.
2. In the Vapi dashboard's own test/simulate call feature, run through the system prompt with a few known-answers combinations (all blank, all filled, a mix) and confirm the assistant skips questions it already has answers to.
3. Test the opt-out path directly: as the test caller, say "not interested" or "wrong number" partway through and confirm the assistant ends the call immediately rather than continuing.
4. Only once Cat has had a lawyer's read of the compliance framing above, set `OUTBOUND_CALLING_ENABLED=true` in Vercel and test with a real call to a number Cat controls, outside of business hours first (to confirm the queueing behaviour) and then inside the window (to confirm the call goes through).

## Open items flagged for a human decision

- **Timezone assumption**: the calling-window check in `/api/voice/trigger-call.js` assumes `Australia/Sydney` time for every lead, since the form doesn't currently capture state or timezone. This is wrong for WA leads near the edges of the window. Decide whether to add a state/timezone field to the lead form, or derive it from phone area code, before this goes live nationally.
- **Public holiday data**: `isAustralianPublicHoliday()` in `/api/voice/trigger-call.js` is a stub that always returns `false`. It needs a real data source (state public holidays differ) before the "never on a public holiday" rule has any effect.
- **Vapi API format**: the outbound-call request in `/api/voice/trigger-call.js` and `/api/voice/process-queue.js`, and the tool webhook format in `/api/voice/book-call.js`, are written from Vapi's documented patterns but have not been tested against a live Vapi account. Confirm the exact request/response format against their current docs when Cat sets the assistant up.
- **Queue scheduler**: `/api/voice/process-queue.js` needs something to call it on a schedule (a Vercel Cron entry in `vercel.json`, most likely) so queued calls get processed. Adding that entry was left out of this build since `vercel.json` is a shared file outside this task's scope.
- **Database**: everything above assumes Supabase (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`), matching the pattern already used in `cultivating-the-fruit-app`. If the scoring-pipeline team building the hub page in parallel on this branch is already standing up a different database, reconcile the table names (`ai_visibility_leads`, `scheduled_calls`) and env var names with theirs rather than running two.
- **Lawyer's review**: repeating this from the top of the doc since it's the most important item on this list: get that read before flipping `OUTBOUND_CALLING_ENABLED`.
