# X Finance Watch

Monitor selected X accounts through the official X API v2 filtered stream and email new posts.

The service is designed for low-latency market watching:

- uses a long-lived filtered stream connection instead of polling
- syncs `from:username` stream rules from `config.json`
- stores notified post IDs in `data/state.json` to avoid duplicate emails
- optionally runs a recent-search catch-up after startup or reconnect
- sends email through Resend, SMTP, or a console preview provider

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
    { "username": "elerianm", "label": "Mohamed El-Erian" },
    {
      "username": "federalreserve",
      "label": "Federal Reserve",
      "keywordsNone": ["speech livestream"]
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

Example:

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
