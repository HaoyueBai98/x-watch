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
        username: "elerianm",
        keywordsAny: ["fed", "market stress"],
        keywordsAll: ["rates"],
        keywordsNone: ["podcast"],
      },
      { excludeReplies: false, excludeRetweets: true },
    ),
    'from:elerianm -is:retweet (fed OR "market stress") rates -podcast',
  );
});

test("deduplicates identical generated rules", () => {
  const rules = buildRules({
    x: { ruleTagPrefix: "finance", excludeReplies: true, excludeRetweets: true },
    watch: [{ username: "elerianm" }, { username: "@elerianm" }],
  });
  assert.equal(rules.length, 1);
});
