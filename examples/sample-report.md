# Statsig hygiene report: Acme Pantry (fictional)

Snapshot taken 2026-10-14 09:00 UTC from a fictional test fixture. 25 checks ran.

## Summary

**46 findings:** 13 high, 24 medium, 9 low.
1 more is suppressed by the ignore list in the config file.

**Hygiene score: 42 / 100.** 19 of 45 audited entities have no high or medium finding.

| Inventory | Count | Notes |
| --- | ---: | --- |
| Gates | 20 | 1 archived, 3 marked stale, 2 permanent |
| Experiments | 9 | 5 active, 1 setup, 1 decision made, 1 abandoned, 1 archived |
| Dynamic configs | 3 | 1 marked stale |
| Segments | 4 |  |
| Metrics | 9 | 2 built in, 6 verified, 1 hidden |
| Layers | 4 | 1 implicit |
| Holdouts | 1 | 1 enabled |
| Tags | 7 |  |
| Audit log entries | 15 |  |
| Project members | 5 |  |

| Check | High | Medium | Low |
| --- | ---: | ---: | ---: |
| G01 Gates Statsig marked stale |  | 3 |  |
| G02 Launched or disabled gates past their cleanup window |  | 2 |  |
| G03 In-progress gates that serve everyone the same value |  | 1 |  |
| G04 Partial rollouts left alone |  | 1 |  |
| G06 Gates with no traffic |  | 1 |  |
| G08 Conditions with no values | 1 |  |  |
| G09 Targeting values that will not match | 1 |  |  |
| G10 The same ID list pasted into several entities |  | 1 |  |
| G11 Rules that can never run |  | 1 |  |
| G12 References to missing, archived or disabled entities | 5 |  |  |
| G13 Missing description, owner or tags |  |  | 2 |
| G14 Owners who are no longer project members |  | 3 |  |
| D01 Dynamic configs Statsig marked stale |  | 1 |  |
| E02 Decided or abandoned experiments not cleaned up |  | 2 |  |
| E03 Experiments running past their plan |  | 3 |  |
| E04 Experiments without a hypothesis or the right metrics | 2 | 1 |  |
| E05 Several comparisons with no correction |  | 1 |  |
| E06 Running experiments with failing health checks | 1 |  |  |
| E09 Experiments whose targeting gate lets nobody in | 2 |  |  |
| X01 Layers no experiment uses |  |  | 1 |
| X02 Segments nothing uses, and empty ID lists |  |  | 2 |
| X03 Running experiments decided by metrics nobody vouched for |  | 2 |  |
| A01 Gates and configs whose rules keep changing | 1 |  |  |
| A02 No required review for changes |  | 1 |  |
| N01 Names off convention, scratch entities and tag drift |  |  | 4 |

## High (13)

_Act now: these change what users get today, or hide that they do._

### G08 Conditions with no values (1)

**Why it matters.** A condition with an empty value list does not fail loudly. An "any of" condition with no values matches nobody, and a "none of" condition with no values matches everybody. The rule looks like targeting in the console and does something else.

**What to do.** Add the values the rule was meant to target, or delete the condition.

| Entity | Finding | Owner |
| --- | --- | --- |
| [gift_cards](https://console.statsig.com/acme-pantry-example/gates/gift_cards) gate | In rule "Pilot stores", the custom field store_id condition (any) has no values, so it matches no user. | Riley Santos |

### G09 Targeting values that will not match (1)

**Why it matters.** Targeting values are compared as exact strings. A value with a stray space, quotes from a pasted list, or several IDs pasted into one entry never matches, and nothing in the console says so. Duplicates are harmless but show a list nobody maintains.

**What to do.** Fix the listed values in the rule. For long lists, move them into an ID list segment.

| Entity | Finding | Owner |
| --- | --- | --- |
| [new_checkout_flow](https://console.statsig.com/acme-pantry-example/gates/new_checkout_flow) gate | In rule "Staff", the email condition (any) has leading or trailing spaces in "n…@acme-pantry.example "; a domain one letter away from acme-pantry.example in "t…@acme-pantry.exmple". | Avery Chen |

### G12 References to missing, archived or disabled entities (5)

**Why it matters.** A rule that requires another gate or a segment depends on it staying alive. An archived gate returns false, a disabled segment matches nobody, and a deleted one matches nothing. The rule keeps its old meaning in the console and quietly changes behavior in production.

**What to do.** Point the rule at the right gate or segment, or remove the condition. Restore the target if it was archived by mistake.

| Entity | Finding | Owner |
| --- | --- | --- |
| [cart_reminder_timing](https://console.statsig.com/acme-pantry-example/experiments/cart_reminder_timing) experiment | It is assigned to layer growth_layer_v0, which does not exist. | Jordan Blake |
| [loyalty_points](https://console.statsig.com/acme-pantry-example/gates/loyalty_points) gate | In rule "Loyalty members", passes_segment points at segment loyalty_members_v1, which does not exist. | Morgan Ellis |
| [wine_delivery](https://console.statsig.com/acme-pantry-example/gates/wine_delivery) gate | In rule "Legacy beta", passes_segment points at segment legacy_beta_users, which is disabled, so it matches nobody. | Avery Chen |
| [wine_delivery](https://console.statsig.com/acme-pantry-example/gates/wine_delivery) gate | In rule "Verified adults", passes_gate points at gate age_verification_beta, which is archived, so it returns false. | Avery Chen |
| [q4_global_holdout](https://console.statsig.com/acme-pantry-example/holdouts/q4_global_holdout) holdout | It holds out gate age_verification_beta, which is archived. | Avery Chen |

By owner: Avery Chen (3), Jordan Blake (1), Morgan Ellis (1).

### E04 Experiments without a hypothesis or the right metrics (2)

**Why it matters.** Without a written hypothesis and one or a few primary metrics chosen up front, any result can be read as a win. Without secondary or guardrail metrics, a change that hurts something else ships unnoticed. High when the experiment is running, medium while it is still in setup.

**What to do.** Write the hypothesis (what changes, for whom, which metric moves and by how much), pick the primary metrics, and add guardrail metrics.

| Entity | Finding | Owner |
| --- | --- | --- |
| [checkout_button_copy](https://console.statsig.com/acme-pantry-example/experiments/checkout_button_copy) experiment | Running with no secondary or guardrail metrics. | Avery Chen |
| [substitution_suggestions](https://console.statsig.com/acme-pantry-example/experiments/substitution_suggestions) experiment | Running with a 19-character hypothesis. | Morgan Ellis |

### E06 Running experiments with failing health checks (1)

**Why it matters.** Statsig's health checks catch setups whose results cannot be trusted: no exposures, unbalanced groups (sample ratio mismatch), users crossing between groups, missing metric data. Results from such an experiment can point the wrong way. A failed check is high, a warning is medium.

**What to do.** Open the experiment's diagnostics, fix the cause, and restart the experiment if the assignment itself was broken.

| Entity | Finding | Owner |
| --- | --- | --- |
| [delivery_eta_display](https://console.statsig.com/acme-pantry-example/experiments/delivery_eta_display) experiment | Health checks failed: Exposures are balanced (failed). | Jordan Blake |

### E09 Experiments whose targeting gate lets nobody in (2)

**Why it matters.** An experiment only enrolls users who pass its targeting gate. When that gate is missing, archived, disabled or passes nobody, the experiment collects no exposures, or none from the users it was meant for, while it looks like it is running.

**What to do.** Point the experiment at a working targeting gate, or fix the gate's rules.

| Entity | Finding | Owner |
| --- | --- | --- |
| [substitution_suggestions](https://console.statsig.com/acme-pantry-example/experiments/substitution_suggestions) experiment | Its targeting gate old_search_ranking returned false on every check for 30 days. | Morgan Ellis |
| [survey_incentive_test](https://console.statsig.com/acme-pantry-example/experiments/survey_incentive_test) experiment | Its targeting gate churn_survey is disabled, so it returns false. | Riley Santos |

### A01 Gates and configs whose rules keep changing (1)

**Why it matters.** Many rule changes in a few days usually means the gate is being used to steer a live incident or tuned by hand. Each change is a production change, and without review one wrong edit reaches every user. High when neither the entity nor the project requires a review.

**What to do.** Find out why it keeps changing. Turn on required reviews for it, and move values that are tuned often into a dynamic config.

| Entity | Finding | Owner |
| --- | --- | --- |
| [delivery_fee_override](https://console.statsig.com/acme-pantry-example/gates/delivery_fee_override) gate | 8 rule or state changes in the last 7 days, by 3 people. Its own review setting is off and the project does not require reviews. | Jordan Blake |

## Medium (24)

_Plan this quarter: cleanup and process gaps that grow if left alone._

### G01 Gates Statsig marked stale (3)

**Why it matters.** Statsig marks a gate stale when it looks ready to remove. Each one is a branch in code that nobody needs but everyone still has to read, test and keep working. The console shows them one gate at a time. This lists them together, with their reason, owner and age.

**What to do.** Follow the action for each reason, or mark the gate permanent if it must stay.

| Entity | Finding | Owner |
| --- | --- | --- |
| [holiday_banner_2025](https://console.statsig.com/acme-pantry-example/gates/holiday_banner_2025) gate | Marked stale: no checks in the last 30 days. Last changed 120 days ago.<br>**Do:** Confirm no code still checks it, then archive it. | Morgan Ellis |
| [old_search_ranking](https://console.statsig.com/acme-pantry-example/gates/old_search_ranking) gate | Marked stale: returned false on every check for 30 days. Last changed 63 days ago.<br>**Do:** Remove the check from code and keep the false path, then archive the gate. | Casey Novak |
| [saved_carts](https://console.statsig.com/acme-pantry-example/gates/saved_carts) gate | Marked stale: launched, or an everyone rule passes 100%. Last changed 75 days ago. Statsig marked it stale on 2026-10-02.<br>**Do:** Remove the check from code and keep the launched path, then archive the gate. | Avery Chen |

### G02 Launched or disabled gates past their cleanup window (2)

**Why it matters.** A launched gate always returns true and a disabled gate always returns false. The check left in code is dead weight, and the losing branch is untested code that still ships.

**What to do.** Remove the gate check from code, keeping the path users get today, then archive the gate.

| Entity | Finding | Owner |
| --- | --- | --- |
| [churn_survey](https://console.statsig.com/acme-pantry-example/gates/churn_survey) gate | Disabled and unchanged for 70 days, so every check returns false.<br>**Do:** Remove the check from code and keep the default path, then archive the gate. | Morgan Ellis |
| [express_delivery_enabled](https://console.statsig.com/acme-pantry-example/gates/express_delivery_enabled) gate | Launched and unchanged for 94 days, so every check returns true.<br>**Do:** Remove the check from code and keep the launched path, then archive the gate. | Jordan Blake |

### G03 In-progress gates that serve everyone the same value (1)

**Why it matters.** A gate that gives every user the same answer is no longer a rollout. While it stays In Progress it still logs exposures, still looks like work in flight, and nobody is prompted to remove it.

**What to do.** Launch the gate if it serves true, disable it if it serves false, then remove the check from code.

| Entity | Finding | Owner |
| --- | --- | --- |
| [substitutions_v2](https://console.statsig.com/acme-pantry-example/gates/substitutions_v2) gate | In Progress, but it serves true to everyone (rule "Everyone" passes 100%). Unchanged for 52 days.<br>**Do:** Launch the gate (or mark it permanent if it is a kill switch), then remove the check from code. | Riley Santos |

### G04 Partial rollouts left alone (1)

**Why it matters.** A rule that passes between 0% and 100% with no scheduled next step usually means a rollout someone meant to finish. Some users get the new path and some do not, for no reason anyone remembers.

**What to do.** Finish the rollout to 100% or roll it back to 0%, then launch or disable the gate. If the split is on purpose, mark the gate permanent or add it to the ignore list.

| Entity | Finding | Owner |
| --- | --- | --- |
| [new_checkout_flow](https://console.statsig.com/acme-pantry-example/gates/new_checkout_flow) gate | Still partial: rule "Beta 25%" at 25%. Unchanged for 41 days with no scheduled rollout step. | Avery Chen |

### G06 Gates with no traffic (1)

**Why it matters.** A gate nobody checks is either dead code waiting to be removed or a gate the code checks under a different name. Both are worth knowing before someone edits its rules and expects an effect.

**What to do.** Search the code for the gate name. If nothing checks it, archive it. If something should, fix the name in code.

| Entity | Finding | Owner |
| --- | --- | --- |
| [driver_tips_v2](https://console.statsig.com/acme-pantry-example/gates/driver_tips_v2) gate | No production checks in the last 7 days, confirmed by Statsig. Created 40 days ago. | Jordan Blake |

### G10 The same ID list pasted into several entities (1)

**Why it matters.** When the same list of users is pasted into several rules, the copies drift: someone is added to one and not the others. A segment keeps one list that every rule references.

**What to do.** Create an ID list segment with these values and replace each inline list with a passes_segment condition.

| Entity | Finding | Owner |
| --- | --- | --- |
| [beta_feedback_widget](https://console.statsig.com/acme-pantry-example/dynamic_configs/beta_feedback_widget) dynamic config | The same 6 email values also appear in gate test_gate_copy. | Riley Santos |

### G11 Rules that can never run (1)

**Why it matters.** Statsig evaluates rules top to bottom and applies the first match. A rule that matches everyone, at any pass percentage, ends the list for every user, so the rules below it never run. Someone reading the console will believe they do.

**What to do.** Move the everyone rule to the bottom, or delete the rules below it.

| Entity | Finding | Owner |
| --- | --- | --- |
| [smart_reorder](https://console.statsig.com/acme-pantry-example/gates/smart_reorder) gate | Rule "Everyone" matches everyone, so the rule after it never runs: rule "Staff". | Jordan Blake |

### G14 Owners who are no longer project members (3)

**Why it matters.** Statsig sends cleanup nudges to the owner. When the owner has left, nobody gets them, and nobody knows the history behind the entity.

**What to do.** Assign a current team member as owner.

| Entity | Finding | Owner |
| --- | --- | --- |
| [free_delivery_threshold](https://console.statsig.com/acme-pantry-example/experiments/free_delivery_threshold) experiment | Casey Novak is not in the project member list. | Casey Novak |
| [old_search_ranking](https://console.statsig.com/acme-pantry-example/gates/old_search_ranking) gate | Casey Novak is not in the project member list. | Casey Novak |
| [legacy_beta_users](https://console.statsig.com/acme-pantry-example/segments/legacy_beta_users) segment | Casey Novak is not in the project member list. | Casey Novak |

### D01 Dynamic configs Statsig marked stale (1)

**Why it matters.** Statsig marks a dynamic config stale when it looks unused or settled. A settled config is a remote switch nobody flips, read on every call.

**What to do.** Follow the action for each reason, or mark the config permanent if it must stay.

| Entity | Finding | Owner |
| --- | --- | --- |
| [checkout_copy](https://console.statsig.com/acme-pantry-example/dynamic_configs/checkout_copy) dynamic config | Marked stale: probably launched. Last changed 88 days ago. Statsig marked it stale on 2026-09-19.<br>**Do:** Make the value everyone gets the default, remove the rules, and archive the config once code no longer reads it. | Avery Chen |

### E02 Decided or abandoned experiments not cleaned up (2)

**Why it matters.** Once an experiment is decided, every group but the shipped one is dead code. It stays in the codebase, and the experiment stays in the console, until someone removes them. Until then the decision is only half done.

**What to do.** Remove the losing branches from code, keeping the shipped one, then archive the experiment.

| Entity | Finding | Owner |
| --- | --- | --- |
| [free_delivery_threshold](https://console.statsig.com/acme-pantry-example/experiments/free_delivery_threshold) experiment | Abandoned 45 days ago and not archived.<br>**Do:** Remove the test branches from code, then archive the experiment. | Casey Novak |
| [homepage_hero_test](https://console.statsig.com/acme-pantry-example/experiments/homepage_hero_test) experiment | Decision made 58 days ago (shipped "Seasonal hero") and not archived. | Avery Chen |

### E03 Experiments running past their plan (3)

**Why it matters.** An experiment that runs past its planned duration keeps part of your users on a losing variant and invites peeking until something looks significant. One with no plan at all can run for months with nobody deciding.

**What to do.** Read the results and make a decision, or write down why it needs more time and set a new duration.

| Entity | Finding | Owner |
| --- | --- | --- |
| [cart_reminder_timing](https://console.statsig.com/acme-pantry-example/experiments/cart_reminder_timing) experiment | No planned duration and running for 75 days. | Jordan Blake |
| [checkout_button_copy](https://console.statsig.com/acme-pantry-example/experiments/checkout_button_copy) experiment | Planned for 14 days and running for 40, 26 days over. | Avery Chen |
| [delivery_eta_display](https://console.statsig.com/acme-pantry-example/experiments/delivery_eta_display) experiment | Reached its target of 20,000 exposures (24,310 so far). | Jordan Blake |

### E04 Experiments without a hypothesis or the right metrics (1)

**Why it matters.** Without a written hypothesis and one or a few primary metrics chosen up front, any result can be read as a win. Without secondary or guardrail metrics, a change that hurts something else ships unnoticed. High when the experiment is running, medium while it is still in setup.

**What to do.** Write the hypothesis (what changes, for whom, which metric moves and by how much), pick the primary metrics, and add guardrail metrics.

| Entity | Finding | Owner |
| --- | --- | --- |
| [survey_incentive_test](https://console.statsig.com/acme-pantry-example/experiments/survey_incentive_test) experiment | In setup with no hypothesis, no primary metric and no secondary or guardrail metrics. | Riley Santos |

### E05 Several comparisons with no correction (1)

**Why it matters.** Each extra primary metric or test group is one more chance of a false positive. With three groups and two primary metrics there are four comparisons against control, and at a 5% significance level the chance that at least one looks significant by luck alone rises to about 19%. Bonferroni or Benjamini-Hochberg correction keeps the error rate where you set it.

**What to do.** Turn on Bonferroni or Benjamini-Hochberg correction in the experiment's advanced settings, or cut it to one primary metric and one test group.

| Entity | Finding | Owner |
| --- | --- | --- |
| [delivery_eta_display](https://console.statsig.com/acme-pantry-example/experiments/delivery_eta_display) experiment | 3 primary metrics and 3 groups, with no Bonferroni or Benjamini-Hochberg correction. | Jordan Blake |

### X03 Running experiments decided by metrics nobody vouched for (2)

**Why it matters.** A primary metric decides whether a change ships. If its definition was never verified, or it has been hidden from the catalog, the decision rests on numbers nobody checked.

**What to do.** Have the metric owner review and verify the definition, or switch the experiment to a verified metric before reading results.

| Entity | Finding | Owner |
| --- | --- | --- |
| [basket_size::mean](https://console.statsig.com/acme-pantry-example/metrics/metrics_catalog/basket_size/mean) metric | Hidden from the catalog, and it is a primary metric of running experiment delivery_eta_display. | Jordan Blake |
| [checkout_conversion::ratio](https://console.statsig.com/acme-pantry-example/metrics/metrics_catalog/checkout_conversion/ratio) metric | Not verified, and it is a primary metric of running experiment checkout_button_copy. | Avery Chen |

### A02 No required review for changes (1)

**Why it matters.** A gate or config change goes to production the moment it is saved. Without a required review, one person can change what every user sees, and a typo in a rule has no second pair of eyes.

**What to do.** Turn on required reviews for config changes in the project settings. Metric reviews matter once metrics decide launches.

| Entity | Finding | Owner |
| --- | --- | --- |
| project settings | Project settings do not require a review for config changes. A team-level setting may still require one for some teams. |  |

## Low (9)

_Hygiene: cheap fixes that keep the project easy to read._

### G13 Missing description, owner or tags (2)

**Why it matters.** When an entity has no description and no owner, nobody can say whether it is safe to change or remove, so it stays forever. Tags are what make a large catalog searchable.

**What to do.** Add a one-line description of what the entity controls, assign an owner, and tag it with the team or area.

| Entity | Finding | Owner |
| --- | --- | --- |
| [test_gate_copy](https://console.statsig.com/acme-pantry-example/gates/test_gate_copy) gate | Has no description, an API key as owner instead of a person and no tags. | CONSOLE API (API key) |
| [support_tickets::event_count_custom](https://console.statsig.com/acme-pantry-example/metrics/metrics_catalog/support_tickets/event_count_custom) metric | Has no description. | Morgan Ellis |

### X01 Layers no experiment uses (1)

**Why it matters.** A layer exists to keep experiments in it mutually exclusive. With no live experiment in it, it still carries parameters that code may read, and it makes the layer list harder to trust.

**What to do.** Archive or delete the layer if code no longer reads its parameters. Keep it if a new experiment is about to use it.

| Entity | Finding | Owner |
| --- | --- | --- |
| [search_layer](https://console.statsig.com/acme-pantry-example/layers/search_layer) layer | No experiment uses this layer, apart from archived ones. Last changed 95 days ago. | Casey Novak |

### X02 Segments nothing uses, and empty ID lists (2)

**Why it matters.** A segment no rule references still looks like a maintained audience, and someone will keep updating it. An ID list with no IDs matches nobody, so any rule that later points at it does nothing.

**What to do.** Delete the segment if nothing outside Statsig's rules needs it. Fill the ID list or remove it.

| Entity | Finding | Owner |
| --- | --- | --- |
| [loyalty_members](https://console.statsig.com/acme-pantry-example/segments/loyalty_members) segment | No gate, dynamic config, experiment or segment rule references it. | Morgan Ellis |
| [qa_devices](https://console.statsig.com/acme-pantry-example/segments/qa_devices) segment | Its ID list is empty. No gate, dynamic config, experiment or segment rule references it. | Riley Santos |

### N01 Names off convention, scratch entities and tag drift (4)

**Why it matters.** Consistent ids make code search and cleanup reliable. Ids that start with test\_ or tmp\_, or end in \_copy2, usually mark scratch entities nobody removed. Tags used on entities but missing from the tag list, or listed and never used, mean the taxonomy has drifted.

**What to do.** Rename or archive scratch entities, and agree on one naming pattern. Add missing tags to the tag list or retag the entities.

| Entity | Finding | Owner |
| --- | --- | --- |
| [Pantry-Scanner](https://console.statsig.com/acme-pantry-example/gates/Pantry-Scanner) gate | Its id does not match the naming pattern. | Riley Santos |
| [test_gate_copy](https://console.statsig.com/acme-pantry-example/gates/test_gate_copy) gate | Its id looks like a scratch or copied entity. | CONSOLE API (API key) |
| tag list | Tags in the tag list that no entity uses: partnerships. |  |
| tag list | Tags used on entities but not in the tag list: pricing. |  |

## Suppressed by the config file

| Check | Entity | Reason |
| --- | --- | --- |
| X01 | pricing_layer layer | Reserved for next quarter's pricing tests. |

---

Generated by [statsig-audit](https://github.com/ardaasaroglu/statsig-audit) 0.2.1, an unofficial read-only tool. This run read a saved snapshot and made no requests. Ages are counted to 2026-10-14 09:00 UTC. Check details: [docs/checks.md](https://github.com/ardaasaroglu/statsig-audit/blob/main/docs/checks.md).
