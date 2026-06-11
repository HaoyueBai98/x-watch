# X Watch

Watch selected X accounts in near real time and email new posts to you.

X Watch uses the official X API v2 filtered stream to listen for posts from accounts you care about. When a watched account publishes a new matching post, the service deduplicates it and sends the post text, author, timestamp, matched rule, and X link to your configured email inbox.

## What It Does

- Watches your configured X users through a long-lived stream connection
- Emails you when a watched user posts something new
- Supports filters for replies, reposts, quote posts, required keywords, and excluded keywords
- Stores notified post IDs in `data/state.json` so the same post is not emailed repeatedly
- Can run a recent-search catch-up after startup or reconnect to reduce missed posts
- Supports Resend, SMTP, or console preview delivery

Example uses:

- Track market or finance accounts and receive new posts by email
- Watch product, company, creator, policy, research, or incident-update accounts
- Build a private notification feed without keeping X open all day

## How It Works

```text
configured X users
  -> X filtered stream rules
  -> new matching post
  -> local duplicate check
  -> email notification
```

## Setup

Requirements:

- Node.js 20 or newer
- X API bearer token with access to filtered stream and recent search
- Resend API key or SMTP credentials

Install dependencies:

```bash
npm install
```

Create local config files:

```bash
cp .env.example .env
cp config.example.json config.json
```

Edit `.env`:

```bash
X_BEARER_TOKEN=...
RESEND_API_KEY=...
```

Edit `config.json`:

```json
{
  "watch": [
    { "username": "xdevelopers", "label": "X Developers" },
    {
      "username": "OpenAI",
      "label": "OpenAI",
      "keywordsAny": ["api", "model", "release"]
    }
  ],
  "email": {
    "provider": "resend",
    "from": "X Watch <alerts@yourdomain.com>",
    "to": ["you@example.com"]
  }
}
```

Check config without connecting to the stream:

```bash
npm run check
```

Start the monitor:

```bash
npm start
```

If your VPN app exposes a local HTTP/SOCKS proxy on `127.0.0.1:7897`, use:

```bash
npm run start:proxy
```

This enables Node's environment-proxy support and sends X API HTTPS requests through the local proxy.

Send a one-off test email:

```bash
npm run send:test-email
```

With the same local proxy:

```bash
npm run send:test-email:proxy
```

When the stream is connected, the process prints `Connected to X filtered stream. Waiting for matching posts...` and then occasional keep-alive messages. New emails are sent only when a watched account posts something matching your rules.

## Watch Rules

Each `watch` item becomes one X filtered-stream rule.

Default rule:

```text
from:username -is:reply -is:retweet
```

Supported per-account options:

- `excludeReplies`: default `true`
- `excludeRetweets`: default `true`
- `excludeQuotes`: default `false`
- `keywordsAny`: matches when any listed word or phrase appears
- `keywordsAll`: requires every listed word or phrase
- `keywordsNone`: excludes words or phrases

Market and finance example:

```json
{
  "username": "elerianm",
  "keywordsAny": ["fed", "inflation", "market stress"],
  "keywordsAll": ["rates"],
  "keywordsNone": ["podcast"],
  "excludeReplies": true,
  "excludeRetweets": true
}
```

Generated rule:

```text
from:elerianm -is:reply -is:retweet (fed OR inflation OR "market stress") rates -podcast
```

The same structure works for other use cases, such as product releases, policy monitoring, public company accounts, creator updates, incident alerts, or any curated X watchlist.

## Email Providers

Use Resend:

```json
{
  "email": {
    "provider": "resend",
    "from": "X Watch <alerts@yourdomain.com>",
    "to": ["you@example.com"],
    "resendApiKeyEnv": "RESEND_API_KEY"
  }
}
```

Use SMTP:

```json
{
  "email": {
    "provider": "smtp",
    "from": "X Watch <alerts@yourdomain.com>",
    "to": ["you@example.com"]
  }
}
```

For a local smoke test without sending email:

```json
{
  "email": {
    "provider": "console"
  }
}
```

## Catch-Up Behavior

The stream should deliver posts in near real time while connected. To reduce missed posts during restarts or network breaks, the service can run a recent-search catch-up using each rule's last notified post ID.

Relevant config:

```json
{
  "x": {
    "catchupOnStartup": true,
    "catchupOnReconnect": true,
    "catchupMaxResults": 25
  }
}
```

Catch-up calls use the X recent search endpoint and can add read cost when posts are returned. Set either option to `false` if you want to avoid that fallback.

## Files

- `src/index.js`: main stream loop
- `src/x-client.js`: X API client
- `src/email.js`: email delivery
- `src/rules.js`: stream rule builder
- `src/state.js`: duplicate prevention and last-seen state
- `config.example.json`: editable configuration template
- `.env.example`: environment variable template

## Tests

```bash
npm test
```
