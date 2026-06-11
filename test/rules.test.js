import assert from "node:assert/strict";
import test from "node:test";

import { buildRuleValue, buildRules, normalizeUsername } from "../src/rules.js";

test("normalizes usernames", () => {
  assert.equal(normalizeUsername("@elerianm"), "elerianm");
});

test("builds default filtered stream rule", () => {
  assert.equal(
    buildRuleValue({ username: "elerianm" }, { excludeReplies: true, excludeRetweets: true }),
    "from:elerianm -is:reply -is:retweet",
  );
});

test("adds keyword include and exclude filters", () => {
  assert.equal(
    buildRuleValue(
      {
        username: "xdevelopers",
        keywordsAny: ["api", "major update"],
        keywordsAll: ["release"],
        keywordsNone: ["podcast"],
      },
      { excludeReplies: false, excludeRetweets: true },
    ),
    'from:xdevelopers -is:retweet (api OR "major update") release -podcast',
  );
});

test("deduplicates identical generated rules", () => {
  const rules = buildRules({
    x: { ruleTagPrefix: "watch", excludeReplies: true, excludeRetweets: true },
    watch: [{ username: "xdevelopers" }, { username: "@xdevelopers" }],
  });
  assert.equal(rules.length, 1);
});
