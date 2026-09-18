// api/aeo/lib/scoring.test.js
//
// Basic, dependency-free tests proving the scoring layer is deterministic:
// the same evidence in always produces the same score out. Run directly
// with `node api/aeo/lib/scoring.test.js` (no test framework required so
// this can be run in CI with zero extra setup, or wired into Jest/Vitest
// later by wrapping these same assertions in `test()` blocks).

'use strict';

const assert = require('assert');
const {
  computeAIDiscoverabilitySubscore,
  computeEntityAuthoritySubscore,
  computeCompetitivePositionSubscore,
  computeOverallScore,
  computePartialScore,
} = require('./scoring');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// 1. Determinism: identical evidence in -> identical score out, every time.
check('computeOverallScore is deterministic across repeated calls', () => {
  const subscores = {
    aiDiscoverability: 72,
    entityAuthority: 55,
    technicalReadiness: 88,
    contentCoverage: 61,
    thirdPartyAuthority: 40,
    searchVisibility: 30,
    competitivePosition: 65,
  };
  const first = computeOverallScore(subscores);
  const second = computeOverallScore(subscores);
  const third = computeOverallScore({ ...subscores }); // fresh object, same values
  assert.strictEqual(first, second);
  assert.strictEqual(first, third);
});

// 2. Sanity check on the weighted formula with a hand-computed expectation.
check('computeOverallScore matches a hand-calculated weighted sum', () => {
  // All subscores = 100 must yield overall = 100 regardless of weights.
  const allMax = {
    aiDiscoverability: 100,
    entityAuthority: 100,
    technicalReadiness: 100,
    contentCoverage: 100,
    thirdPartyAuthority: 100,
    searchVisibility: 100,
    competitivePosition: 100,
  };
  assert.strictEqual(computeOverallScore(allMax), 100);

  const allZero = {
    aiDiscoverability: 0,
    entityAuthority: 0,
    technicalReadiness: 0,
    contentCoverage: 0,
    thirdPartyAuthority: 0,
    searchVisibility: 0,
    competitivePosition: 0,
  };
  assert.strictEqual(computeOverallScore(allZero), 0);

  // Only AI Discoverability at 100, everything else 0 -> should equal its weight (25%).
  const onlyAI = { ...allZero, aiDiscoverability: 100 };
  assert.strictEqual(computeOverallScore(onlyAI), 25);
});

// 3. AI discoverability: being recommended must score higher than merely mentioned.
check('recommendation counts for more than a bare mention', () => {
  const merelyMentioned = computeAIDiscoverabilitySubscore({
    promptsRun: 5,
    mentions: 5,
    recommendedCount: 0,
  });
  const activelyRecommended = computeAIDiscoverabilitySubscore({
    promptsRun: 5,
    mentions: 5,
    recommendedCount: 5,
  });
  assert.ok(activelyRecommended > merelyMentioned);
  assert.strictEqual(activelyRecommended, 100);
});

// 4. Entity authority: invalid schema must score below absent schema.
check('present-but-invalid schema scores worse than no schema at all', () => {
  const noSchema = computeEntityAuthoritySubscore({ schemas: [] }, null);
  const invalidSchema = computeEntityAuthoritySubscore(
    { schemas: [{ type: 'LocalBusiness', valid: false }] },
    null
  );
  const validSchema = computeEntityAuthoritySubscore(
    { schemas: [{ type: 'LocalBusiness', valid: true }] },
    null
  );
  assert.ok(invalidSchema < noSchema, `expected invalid (${invalidSchema}) < absent (${noSchema})`);
  assert.ok(validSchema > noSchema, `expected valid (${validSchema}) > absent (${noSchema})`);
});

// 5. Competitive position is a pure, deterministic percentile.
check('competitive position percentile is deterministic and monotonic', () => {
  const competitorScores = [40, 55, 60, 70, 90];
  const low = computeCompetitivePositionSubscore(30, competitorScores);
  const mid = computeCompetitivePositionSubscore(65, competitorScores);
  const high = computeCompetitivePositionSubscore(95, competitorScores);
  assert.ok(low < mid && mid < high);
  assert.strictEqual(computeCompetitivePositionSubscore(65, competitorScores), mid); // repeat call, same result
  assert.strictEqual(computeCompetitivePositionSubscore(999, []), 50); // no competitor data -> neutral
});

// 6. Free-tier partial score renormalises weights and is still deterministic.
check('computePartialScore renormalises included weights to sum to 1', () => {
  const subscores = { technicalReadiness: 80, contentCoverage: 60, entityAuthority: 40 };
  const result1 = computePartialScore(subscores, ['technicalReadiness', 'contentCoverage', 'entityAuthority']);
  const result2 = computePartialScore(subscores, ['technicalReadiness', 'contentCoverage', 'entityAuthority']);
  const weightSum = Object.values(result1.renormalisedWeights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(weightSum - 1) < 1e-9);
  assert.strictEqual(result1.score, result2.score);
  assert.deepStrictEqual(result1.excludedCategories.sort(), [
    'aiDiscoverability',
    'competitivePosition',
    'searchVisibility',
    'thirdPartyAuthority',
  ].sort());
});

console.log(`\n${passed} scoring tests passed.`);
