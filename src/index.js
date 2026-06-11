import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { loadConfig, loadDotEnv, getBearerToken } from "./config.js";
import { Emailer } from "./email.js";
import { buildRules } from "./rules.js";
import { StateStore } from "./state.js";
import { XClient } from "./x-client.js";

const args = new Set(process.argv.slice(2));
const configPath = valueAfter("--config") || process.env.CONFIG_PATH || "config.json";

async function main() {
  loadDotEnv();
  const config = loadConfig(configPath);
  const rules = buildRules(config);

  if (args.has("--check")) {
    getBearerToken(config);
    printConfigSummary(config, rules);
    return;
  }

  if (args.has("--send-test-email")) {
    const emailer = new Emailer(config.email);
    await emailer.sendPost({
      tweet: {
        id: "0000000000000000000",
        text: "This is a test email from X Finance Watch. If you received it, email delivery is configured correctly.",
        created_at: new Date().toISOString(),
      },
      author: {
        name: "X Finance Watch",
        username: "x_finance_watch",
      },
      matchingRules: [{ tag: "test-email" }],
    });
    console.log("Test email sent.");
    return;
  }

  const state = new StateStore(config.stateFile);
  await state.load();

  const client = new XClient({ bearerToken: getBearerToken(config), apiBase: config.x.apiBase });
  const emailer = new Emailer(config.email);

  console.log(`Loaded ${rules.length} stream rules from ${config.__path}`);
  for (const rule of rules) {
    console.log(`- ${rule.tag}: ${rule.value}`);
  }

  if (config.x.syncRules) {
    const result = await client.syncRules(rules, config.x.ruleTagPrefix);
    console.log(`Synced X stream rules: added=${result.added}, deleted=${result.deleted}, kept=${result.kept}`);
  }

  if (config.x.catchupOnStartup) {
    await catchUp({ client, emailer, state, rules, config, reason: "startup" });
  }

  await runStreamLoop({ client, emailer, state, rules, config });
}

async function runStreamLoop({ client, emailer, state, rules, config }) {
  let stopped = false;
  let reconnectDelayMs = 1000;
  let controller = new AbortController();
  let lastKeepAliveLogAt = 0;

  const stop = () => {
    stopped = true;
    controller.abort();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  while (!stopped) {
    try {
      controller = new AbortController();
      console.log("Connecting to X filtered stream...");
      await client.stream({
        signal: controller.signal,
        onConnected: () => {
          reconnectDelayMs = 1000;
          console.log("Connected to X filtered stream. Waiting for matching posts...");
        },
        onKeepAlive: () => {
          const now = Date.now();
          if (now - lastKeepAliveLogAt > 60000) {
            lastKeepAliveLogAt = now;
            console.log(`Stream keep-alive received at ${new Date(now).toISOString()}`);
          }
        },
        onTweet: async (payload) => {
          await handleTweet({ payload, emailer, state });
        },
      });
      if (!stopped) {
        throw new Error("X stream closed");
      }
    } catch (error) {
      if (stopped || error.name === "AbortError") {
        break;
      }

      console.error(`Stream error: ${error.message}`);
      if (config.x.catchupOnReconnect) {
        await catchUp({ client, emailer, state, rules, config, reason: "reconnect" });
      }

      const waitMs = error.retryAfterMs || reconnectDelayMs;
      console.log(`Reconnecting in ${Math.round(waitMs / 1000)}s...`);
      await sleep(waitMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, 60000);
      continue;
    }

    reconnectDelayMs = 1000;
  }

  console.log("Stopped X finance watch.");
}

async function handleTweet({ payload, emailer, state }) {
  const tweet = payload.data;
  const users = new Map((payload.includes?.users || []).map((user) => [user.id, user]));
  const author = payload.author || users.get(tweet.author_id);
  const username = author?.username || tweet.author_id;

  if (state.hasTweet(tweet.id)) {
    return;
  }

  await emailer.sendPost({
    tweet,
    author,
    matchingRules: payload.matching_rules || [],
  });
  await state.markNotified(
    username,
    tweet.id,
    (payload.matching_rules || []).map((rule) => rule.tag).filter(Boolean),
  );
  console.log(`Notified ${author?.username ? `@${author.username}` : username} post ${tweet.id}`);
}

async function catchUp({ client, emailer, state, rules, config, reason }) {
  console.log(`Running catch-up (${reason})...`);
  let sent = 0;

  for (const rule of rules) {
    const sinceId = state.getLastSeenId(rule.tag);
    if (!sinceId) {
      continue;
    }

    const posts = await client.recentSearch(rule, {
      sinceId,
      maxResults: config.x.catchupMaxResults,
    });

    for (const payload of posts) {
      if (state.hasTweet(payload.data.id)) {
        continue;
      }
      await handleTweet({ payload, emailer, state });
      sent += 1;
    }
  }

  console.log(`Catch-up complete: ${sent} new posts notified.`);
}

function printConfigSummary(config, rules) {
  console.log(`Config OK: ${config.__path}`);
  console.log(`Email provider: ${config.email.provider}`);
  console.log(`State file: ${config.stateFile}`);
  console.log(`Rules:`);
  for (const rule of rules) {
    console.log(`- ${rule.tag}: ${rule.value}`);
  }
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
