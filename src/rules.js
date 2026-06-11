const RULE_SAFE = /^[A-Za-z0-9_]{1,15}$/;

export function normalizeUsername(username) {
  const value = String(username || "").trim().replace(/^@/, "");
  if (!RULE_SAFE.test(value)) {
    throw new Error(`Invalid X username: ${username}`);
  }
  return value;
}

export function buildRuleValue(watchItem, defaults = {}) {
  const username = normalizeUsername(watchItem.username);
  const parts = [`from:${username}`];

  const excludeReplies = watchItem.excludeReplies ?? defaults.excludeReplies;
  const excludeRetweets = watchItem.excludeRetweets ?? defaults.excludeRetweets;
  const excludeQuotes = watchItem.excludeQuotes ?? defaults.excludeQuotes;

  if (excludeReplies) {
    parts.push("-is:reply");
  }
  if (excludeRetweets) {
    parts.push("-is:retweet");
  }
  if (excludeQuotes) {
    parts.push("-is:quote");
  }

  const anyKeywords = watchItem.keywordsAny || [];
  if (anyKeywords.length === 1) {
    parts.push(quoteRuleTerm(anyKeywords[0]));
  } else if (anyKeywords.length > 1) {
    parts.push(`(${anyKeywords.map(quoteRuleTerm).join(" OR ")})`);
  }

  for (const keyword of watchItem.keywordsAll || []) {
    parts.push(quoteRuleTerm(keyword));
  }
  for (const keyword of watchItem.keywordsNone || []) {
    parts.push(`-${quoteRuleTerm(keyword)}`);
  }

  return parts.join(" ");
}

export function buildRules(config) {
  const prefix = config.x.ruleTagPrefix || "x-watch";
  const seen = new Map();

  for (const item of config.watch) {
    const username = normalizeUsername(item.username);
    const value = buildRuleValue(item, config.x);
    const tag = `${prefix}:${username}:${stableHash(value)}`;
    seen.set(tag, { value, tag, username, label: item.label || `@${username}` });
  }

  return [...seen.values()];
}

function quoteRuleTerm(term) {
  const value = String(term || "").trim();
  if (!value) {
    throw new Error("Empty keyword in rule");
  }
  if (/^[A-Za-z0-9_#$@.-]+$/.test(value)) {
    return value;
  }
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function stableHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
