import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export function loadDotEnv(filePath = ".env") {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) {
      continue;
    }
    process.env[key] = stripQuotes(rawValue.trim());
  }
}

export function loadConfig(configPath = "config.json") {
  const absolutePath = path.resolve(configPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`);
  }

  const config = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  validateConfig(config);
  config.__path = absolutePath;
  return config;
}

export function getBearerToken(config) {
  const envName = config.x.bearerTokenEnv || "X_BEARER_TOKEN";
  const token = process.env[envName];
  if (!token) {
    throw new Error(`Missing X bearer token env var: ${envName}`);
  }
  return token;
}

export function validateConfig(config) {
  if (!config || typeof config !== "object") {
    throw new Error("Config must be a JSON object");
  }
  if (!Array.isArray(config.watch) || config.watch.length === 0) {
    throw new Error("Config must include at least one watch item");
  }
  for (const item of config.watch) {
    if (!item.username) {
      throw new Error("Every watch item must include username");
    }
  }
  if (!config.email || typeof config.email !== "object") {
    throw new Error("Config must include email settings");
  }
  if (!config.email.provider) {
    throw new Error("email.provider is required: resend, smtp, or console");
  }
  if (config.email.provider !== "console") {
    if (!config.email.from) {
      throw new Error("email.from is required");
    }
    if (!Array.isArray(config.email.to) || config.email.to.length === 0) {
      throw new Error("email.to must be a non-empty array");
    }
  }
  config.stateFile ||= "./data/state.json";
  config.x ||= {};
  config.x.ruleTagPrefix ||= "x-watch";
  config.x.syncRules ??= true;
  config.x.catchupOnStartup ??= true;
  config.x.catchupOnReconnect ??= true;
  config.x.catchupMaxResults ??= 25;
  config.x.excludeReplies ??= true;
  config.x.excludeRetweets ??= true;
  config.x.excludeQuotes ??= false;
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
