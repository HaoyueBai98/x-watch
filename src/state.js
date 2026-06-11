import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_STATE = {
  lastSeenIdByRuleTag: {},
  lastSeenIdByUsername: {},
  notifiedTweetIds: [],
};

export class StateStore {
  constructor(filePath, options = {}) {
    this.filePath = path.resolve(filePath);
    this.maxNotifiedIds = options.maxNotifiedIds || 5000;
    this.state = structuredClone(DEFAULT_STATE);
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      this.state = {
        ...structuredClone(DEFAULT_STATE),
        ...parsed,
        lastSeenIdByRuleTag: parsed.lastSeenIdByRuleTag || {},
        lastSeenIdByUsername: parsed.lastSeenIdByUsername || {},
        notifiedTweetIds: parsed.notifiedTweetIds || [],
      };
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      this.state = structuredClone(DEFAULT_STATE);
    }
  }

  hasTweet(tweetId) {
    return this.state.notifiedTweetIds.includes(String(tweetId));
  }

  getLastSeenId(key) {
    const normalized = String(key).toLowerCase();
    return this.state.lastSeenIdByRuleTag[normalized] || this.state.lastSeenIdByUsername[normalized];
  }

  async markNotified(username, tweetId, ruleTags = []) {
    const id = String(tweetId);
    const key = username.toLowerCase();
    if (!this.hasTweet(id)) {
      this.state.notifiedTweetIds.push(id);
      if (this.state.notifiedTweetIds.length > this.maxNotifiedIds) {
        this.state.notifiedTweetIds = this.state.notifiedTweetIds.slice(
          -this.maxNotifiedIds,
        );
      }
    }
    if (!this.state.lastSeenIdByUsername[key] || compareTweetIds(id, this.state.lastSeenIdByUsername[key]) > 0) {
      this.state.lastSeenIdByUsername[key] = id;
    }
    for (const tag of ruleTags) {
      const tagKey = String(tag).toLowerCase();
      if (!this.state.lastSeenIdByRuleTag[tagKey] || compareTweetIds(id, this.state.lastSeenIdByRuleTag[tagKey]) > 0) {
        this.state.lastSeenIdByRuleTag[tagKey] = id;
      }
    }
    await this.save();
  }

  async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, `${JSON.stringify(this.state, null, 2)}\n`);
    await fs.rename(tmpPath, this.filePath);
  }
}

export function compareTweetIds(a, b) {
  const left = BigInt(String(a));
  const right = BigInt(String(b));
  if (left === right) {
    return 0;
  }
  return left > right ? 1 : -1;
}
