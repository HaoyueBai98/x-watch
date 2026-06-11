import { compareTweetIds } from "./state.js";

const API_BASE = "https://api.x.com/2";
const TWEET_FIELDS = [
  "attachments",
  "author_id",
  "created_at",
  "entities",
  "in_reply_to_user_id",
  "lang",
  "possibly_sensitive",
  "referenced_tweets",
  "text",
];
const USER_FIELDS = ["name", "username", "profile_image_url", "verified"];
const MEDIA_FIELDS = ["preview_image_url", "type", "url"];

export class XClient {
  constructor({ bearerToken, apiBase = API_BASE }) {
    this.bearerToken = bearerToken;
    this.apiBase = apiBase.replace(/\/$/, "");
  }

  async getRules() {
    const response = await this.request("/tweets/search/stream/rules");
    return response.data || [];
  }

  async syncRules(desiredRules, tagPrefix) {
    const existingRules = await this.getRules();
    const managed = existingRules.filter((rule) => String(rule.tag || "").startsWith(`${tagPrefix}:`));
    const desiredByTag = new Map(desiredRules.map((rule) => [rule.tag, rule]));

    const deleteIds = managed
      .filter((rule) => desiredByTag.get(rule.tag)?.value !== rule.value)
      .map((rule) => rule.id);

    if (deleteIds.length > 0) {
      await this.request("/tweets/search/stream/rules", {
        method: "POST",
        body: { delete: { ids: deleteIds } },
      });
    }

    const refreshedRules = deleteIds.length > 0 ? await this.getRules() : existingRules;
    const existingKeys = new Set(refreshedRules.map((rule) => `${rule.tag}\n${rule.value}`));
    const add = desiredRules
      .filter((rule) => !existingKeys.has(`${rule.tag}\n${rule.value}`))
      .map(({ value, tag }) => ({ value, tag }));

    if (add.length > 0) {
      await this.request("/tweets/search/stream/rules", {
        method: "POST",
        body: { add },
      });
    }

    return { deleted: deleteIds.length, added: add.length, kept: desiredRules.length - add.length };
  }

  async stream({ signal, onTweet, onKeepAlive }) {
    const search = new URLSearchParams({
      "tweet.fields": TWEET_FIELDS.join(","),
      "user.fields": USER_FIELDS.join(","),
      "media.fields": MEDIA_FIELDS.join(","),
      expansions: "author_id,attachments.media_keys",
    });
    const response = await this.fetchRaw(`/tweets/search/stream?${search}`, { signal });

    if (!response.body) {
      throw new Error("X stream response did not include a readable body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          onKeepAlive?.();
          continue;
        }
        const payload = JSON.parse(trimmed);
        if (payload.data) {
          await onTweet(payload);
        }
      }
    }
  }

  async recentSearch(rule, { sinceId, maxResults = 25 } = {}) {
    if (!sinceId) {
      return [];
    }

    const params = new URLSearchParams({
      query: rule.value,
      max_results: String(Math.max(10, Math.min(maxResults, 100))),
      since_id: String(sinceId),
      "tweet.fields": TWEET_FIELDS.join(","),
      "user.fields": USER_FIELDS.join(","),
      "media.fields": MEDIA_FIELDS.join(","),
      expansions: "author_id,attachments.media_keys",
    });

    const payload = await this.request(`/tweets/search/recent?${params}`);
    const users = new Map((payload.includes?.users || []).map((user) => [user.id, user]));
    return (payload.data || [])
      .sort((a, b) => compareTweetIds(a.id, b.id))
      .map((tweet) => ({
        data: tweet,
        includes: payload.includes || {},
        matching_rules: [{ id: rule.id, tag: rule.tag }],
        author: users.get(tweet.author_id),
      }));
  }

  async request(endpoint, options = {}) {
    const response = await this.fetchRaw(endpoint, options);
    if (response.status === 204) {
      return {};
    }
    return response.json();
  }

  async fetchRaw(endpoint, options = {}) {
    const url = endpoint.startsWith("http") ? endpoint : `${this.apiBase}${endpoint}`;
    const response = await fetch(url, {
      method: options.method || "GET",
      signal: options.signal,
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
        "Content-Type": "application/json",
        "User-Agent": "x-finance-watch/0.1",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const body = await response.text();
      const error = new Error(`X API request failed (${response.status}): ${body}`);
      error.status = response.status;
      error.retryAfterMs = retryAfterMs(response.headers);
      throw error;
    }

    return response;
  }
}

function retryAfterMs(headers) {
  const retryAfter = headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) {
    return Number(retryAfter) * 1000;
  }

  const reset = headers.get("x-rate-limit-reset");
  if (reset && /^\d+$/.test(reset)) {
    return Math.max(0, Number(reset) * 1000 - Date.now());
  }

  return undefined;
}
