// The check catalog, in report order. Every check is a module with metadata and a pure
// run(snapshot, config, now) function. docs/checks.md describes each one.

import G01 from "./g01-stale-gates.js";
import G02 from "./g02-launched-not-cleaned.js";
import G03 from "./g03-single-outcome.js";
import G04 from "./g04-partial-rollout.js";
import G06 from "./g06-zero-traffic.js";
import G08 from "./g08-empty-condition.js";
import G09 from "./g09-suspicious-values.js";
import G10 from "./g10-duplicated-allowlists.js";
import G11 from "./g11-unreachable-rules.js";
import G12 from "./g12-dangling-references.js";
import G13 from "./g13-missing-metadata.js";
import G14 from "./g14-owner-not-member.js";
import D01 from "./d01-stale-configs.js";
import E02 from "./e02-decided-not-cleaned.js";
import E03 from "./e03-past-plan.js";
import E04 from "./e04-setup-defects.js";
import E05 from "./e05-no-correction.js";
import E06 from "./e06-health-checks.js";
import E09 from "./e09-targeting-gate.js";
import X01 from "./x01-empty-layers.js";
import X02 from "./x02-unused-segments.js";
import X03 from "./x03-metric-trust.js";
import A01 from "./a01-rule-churn.js";
import A02 from "./a02-no-review.js";
import N01 from "./n01-naming.js";

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
