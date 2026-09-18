// api/aeo/places.js — PAID TIER, STUBBED (needs a Google Places API key)
//
// Checks review count/rating and NAP (Name, Address, Phone) consistency via
// the Google Places API. Stubbed because no GOOGLE_PLACES_API_KEY is
// available in this environment, but the request/response shape is a real
// integration contract — wire in fetchPlaceDetails() and this works with no
// changes anywhere else in the pipeline.
//
// TODO: needs GOOGLE_PLACES_API_KEY env var before this returns real data.
// Uses the Places API (New) `places:searchText` + `places/{place_id}`
// endpoints, called directly over fetch (no @googlemaps/google-maps-services-js
// dependency needed).
//
// Gated the same way as every other paid check: refuses to run without a
// verified Stripe payment.

'use strict';

const { makeEvidence } = require('./lib/evidence-utils');
const { requirePaidAccess, PaymentRequiredError } = require('./lib/payment-gate');

const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';

/**
 * TODO: real implementation once GOOGLE_PLACES_API_KEY exists, e.g.:
 *   const res = await fetch(PLACES_SEARCH_URL, {
 *     method: 'POST',
 *     headers: {
 *       'Content-Type': 'application/json',
 *       'X-Goog-Api-Key': apiKey,
 *       'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.nationalPhoneNumber,places.id',
 *     },
 *     body: JSON.stringify({ textQuery: `${businessName} ${location}` }),
 *   });
 *   return res.json();
 */
async function fetchPlaceDetails(businessName, location, apiKey) {
  if (!apiKey) return null;
  throw new Error('places.js fetchPlaceDetails() is not yet implemented — GOOGLE_PLACES_API_KEY was provided but no provider call exists yet.');
}

/** Compares the Places-listed NAP against the NAP the business itself supplied (from its own site/schema). */
function checkNapConsistency(placesResult, expectedNap) {
  if (!placesResult || !expectedNap) return null;
  const normalise = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const nameMatch = normalise(placesResult.name) === normalise(expectedNap.name);
  const phoneMatch = expectedNap.phone
    ? normalise(placesResult.phone).slice(-9) === normalise(expectedNap.phone).slice(-9) // compare last 9 digits, tolerant of formatting/country code
    : true;
  const addressMatch = expectedNap.address
    ? normalise(placesResult.address).includes(normalise(expectedNap.address).slice(0, 20))
    : true;
  return nameMatch && phoneMatch && addressMatch;
}

async function checkPlaces({ businessName, location, expectedNap, paymentVerified }) {
  if (paymentVerified !== true) {
    throw new PaymentRequiredError('checkPlaces called without a verified payment.');
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return makeEvidence(
      'places',
      'Google Places API',
      {
        available: false,
        reason: 'GOOGLE_PLACES_API_KEY not configured', // TODO: needs GOOGLE_PLACES_API_KEY env var
        businessName,
        location,
      },
      { reviewCount: null, rating: null, napConsistent: null }
    );
  }

  try {
    const raw = await fetchPlaceDetails(businessName, location, apiKey);
    const place = raw && raw.places && raw.places[0];
    const placesResult = place
      ? {
          name: place.displayName && place.displayName.text,
          rating: place.rating,
          reviewCount: place.userRatingCount,
          address: place.formattedAddress,
          phone: place.nationalPhoneNumber,
          placeId: place.id,
        }
      : null;
    const napConsistent = checkNapConsistency(placesResult, expectedNap);
    return makeEvidence(
      'places',
      'Google Places API (New) — places:searchText',
      { available: true, businessName, location, place: placesResult },
      { reviewCount: placesResult ? placesResult.reviewCount : null, rating: placesResult ? placesResult.rating : null, napConsistent }
    );
  } catch (err) {
    return makeEvidence(
      'places',
      'Google Places API',
      { available: false, reason: err.message, businessName, location },
      { reviewCount: null, rating: null, napConsistent: null }
    );
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST required' });
    return;
  }
  const { businessName, location, expectedNap, assessmentId, stripeSessionId } = req.body || {};
  if (!businessName) {
    res.status(400).json({ error: 'businessName is required' });
    return;
  }
  try {
    await requirePaidAccess(stripeSessionId, assessmentId);
    const evidence = await checkPlaces({ businessName, location, expectedNap, paymentVerified: true });
    res.status(200).json(evidence);
  } catch (err) {
    const status = err instanceof PaymentRequiredError ? err.statusCode : 500;
    res.status(status).json({ error: err.message });
  }
};

module.exports.checkPlaces = checkPlaces;
module.exports.checkNapConsistency = checkNapConsistency;
module.exports.fetchPlaceDetails = fetchPlaceDetails;
