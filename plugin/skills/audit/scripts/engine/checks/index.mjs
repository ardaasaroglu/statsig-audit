// Generated from src/checks/index.js by scripts/build-plugin.mjs. Edit the source, then run npm run build:plugin.
// The check catalog, in report order. Every check is a module with metadata and a pure
// run(snapshot, config, now) function. docs/checks.md describes each one.

import G01 from "./g01-stale-gates.mjs";
import G02 from "./g02-launched-not-cleaned.mjs";
import G03 from "./g03-single-outcome.mjs";
import G04 from "./g04-partial-rollout.mjs";
import G06 from "./g06-zero-traffic.mjs";
import G08 from "./g08-empty-condition.mjs";
import G09 from "./g09-suspicious-values.mjs";
import G10 from "./g10-duplicated-allowlists.mjs";
import G11 from "./g11-unreachable-rules.mjs";
import G12 from "./g12-dangling-references.mjs";
import G13 from "./g13-missing-metadata.mjs";
import G14 from "./g14-owner-not-member.mjs";
import D01 from "./d01-stale-configs.mjs";
import E02 from "./e02-decided-not-cleaned.mjs";
import E03 from "./e03-past-plan.mjs";
import E04 from "./e04-setup-defects.mjs";
import E05 from "./e05-no-correction.mjs";
import E06 from "./e06-health-checks.mjs";
import E09 from "./e09-targeting-gate.mjs";
import X01 from "./x01-empty-layers.mjs";
import X02 from "./x02-unused-segments.mjs";
import X03 from "./x03-metric-trust.mjs";
import A01 from "./a01-rule-churn.mjs";
import A02 from "./a02-no-review.mjs";
import N01 from "./n01-naming.mjs";

export const CHECKS = Object.freeze([
  G01, G02, G03, G04, G06, G08, G09, G10, G11, G12, G13, G14,
  D01,
  E02, E03, E04, E05, E06, E09,
  X01, X02, X03,
  A01, A02,
  N01,
]);

export const CHECK_IDS = CHECKS.map((c) => c.id);

export function getCheck(id) {
  return CHECKS.find((c) => c.id === id) || null;
}
