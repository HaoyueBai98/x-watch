import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { compareTweetIds, StateStore } from "../src/state.js";

test("compares large tweet ids as integers", () => {
  assert.equal(compareTweetIds("1000000000000000001", "1000000000000000000"), 1);
  assert.equal(compareTweetIds("1000000000000000000", "1000000000000000001"), -1);
  assert.equal(compareTweetIds("1000000000000000000", "1000000000000000000"), 0);
});

test("persists notified tweet ids and last seen ids", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "x-watch-"));
  const file = path.join(dir, "state.json");

  const store = new StateStore(file, { maxNotifiedIds: 2 });
  await store.load();
  await store.markNotified("SomeUser", "100", ["rule:a"]);
  await store.markNotified("SomeUser", "101", ["rule:a"]);
  await store.markNotified("SomeUser", "102", ["rule:b"]);

  const reloaded = new StateStore(file, { maxNotifiedIds: 2 });
  await reloaded.load();

  assert.equal(reloaded.hasTweet("100"), false);
  assert.equal(reloaded.hasTweet("101"), true);
  assert.equal(reloaded.hasTweet("102"), true);
  assert.equal(reloaded.getLastSeenId("someuser"), "102");
  assert.equal(reloaded.getLastSeenId("rule:a"), "101");
  assert.equal(reloaded.getLastSeenId("rule:b"), "102");
});
