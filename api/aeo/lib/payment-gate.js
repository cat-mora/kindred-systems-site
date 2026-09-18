// api/aeo/lib/payment-gate.js
//
// Enforces "paid checks only run after Stripe payment succeeds" IN CODE, not
// as a comment or a front-end-only gate. Every paid check (ai-panel.js,
// serp-visibility.js, places.js) and the paid orchestrator (run-paid.js)
// must call requirePaidAccess() before doing any paid-cost work, and must
// bail out if it throws.
//
// Uses the Stripe REST API directly over fetch (no `stripe` npm package),
// so this file has zero new dependencies to install. Needs STRIPE_SECRET_KEY.

'use strict';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

class PaymentRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PaymentRequiredError';
    this.statusCode = 402;
  }
}

/**
 * Retrieves a Stripe Checkout Session and confirms it is actually paid, and
 * (when assessmentId is supplied) that it was paid for THIS assessment —
 * checked via session.client_reference_id or session.metadata.assessmentId,
 * whichever the checkout-session-creation code (lead form / front end) sets.
 *
 * @param {string} stripeSessionId - Stripe Checkout Session id, e.g. "cs_..."
 * @param {string} [assessmentId] - our own id for the scorecard run being unlocked
 * @returns {Promise<{ paid: true, sessionId: string, amountTotal: number, currency: string }>}
 * @throws {PaymentRequiredError} if payment cannot be verified
 */
async function requirePaidAccess(stripeSessionId, assessmentId) {
  if (!stripeSessionId) {
    throw new PaymentRequiredError('No Stripe session id supplied — payment not verified.');
  }
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    // Fail closed. Never treat "we can't check" as "assume paid".
    throw new PaymentRequiredError(
      'STRIPE_SECRET_KEY is not configured — cannot verify payment, refusing to run paid checks.'
    );
  }

  let res;
  try {
    res = await fetch(`${STRIPE_API_BASE}/checkout/sessions/${encodeURIComponent(stripeSessionId)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
  } catch (err) {
    throw new PaymentRequiredError(`Stripe lookup failed: ${err.message}`);
  }

  if (!res.ok) {
    throw new PaymentRequiredError(`Stripe session lookup returned HTTP ${res.status}`);
  }

  const session = await res.json();

  if (session.payment_status !== 'paid') {
    throw new PaymentRequiredError(
      `Stripe session ${stripeSessionId} is not paid (payment_status=${session.payment_status}).`
    );
  }

  if (assessmentId) {
    const linkedId = session.client_reference_id || (session.metadata && session.metadata.assessmentId);
    if (linkedId && linkedId !== assessmentId) {
      throw new PaymentRequiredError(
        `Stripe session ${stripeSessionId} is paid but is linked to a different assessment.`
      );
    }
  }

  return {
    paid: true,
    sessionId: stripeSessionId,
    amountTotal: session.amount_total,
    currency: session.currency,
  };
}

module.exports = { requirePaidAccess, PaymentRequiredError };
