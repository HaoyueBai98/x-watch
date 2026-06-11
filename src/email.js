import process from "node:process";

export class Emailer {
  constructor(config) {
    this.config = config;
  }

  async sendPost({ tweet, author, matchingRules }) {
    const subject = buildSubject(this.config, tweet, author);
    const text = buildTextBody(tweet, author, matchingRules);
    const html = buildHtmlBody(tweet, author, matchingRules);

    if (this.config.provider === "console") {
      console.log(`\n--- EMAIL PREVIEW ---\nSubject: ${subject}\n${text}\n`);
      return;
    }
    if (this.config.provider === "resend") {
      await this.sendViaResend({ subject, text, html });
      return;
    }
    if (this.config.provider === "smtp") {
      await this.sendViaSmtp({ subject, text, html });
      return;
    }
    throw new Error(`Unsupported email provider: ${this.config.provider}`);
  }

  async sendViaResend(message) {
    const envName = this.config.resendApiKeyEnv || "RESEND_API_KEY";
    const apiKey = process.env[envName];
    if (!apiKey) {
      throw new Error(`Missing Resend API key env var: ${envName}`);
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.config.from,
        to: this.config.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend failed (${response.status}): ${body}`);
    }
  }

  async sendViaSmtp(message) {
    const nodemailer = await import("nodemailer");
    const smtp = this.config.smtp || {};
    const transporter = nodemailer.createTransport({
      host: envRequired(smtp.hostEnv || "SMTP_HOST"),
      port: Number(envRequired(smtp.portEnv || "SMTP_PORT")),
      secure: parseBoolean(process.env[smtp.secureEnv || "SMTP_SECURE"]),
      auth: {
        user: envRequired(smtp.userEnv || "SMTP_USER"),
        pass: envRequired(smtp.passEnv || "SMTP_PASS"),
      },
    });

    await transporter.sendMail({
      from: this.config.from,
      to: this.config.to.join(", "),
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

function buildSubject(config, tweet, author) {
  const prefix = config.subjectPrefix || "[X Watch]";
  const username = author?.username ? `@${author.username}` : "X";
  const compactText = (tweet.text || "").replace(/\s+/g, " ").slice(0, 90);
  return `${prefix} ${username}: ${compactText}`;
}

function buildTextBody(tweet, author, matchingRules) {
  const username = author?.username || tweet.author_id || "unknown";
  const url = postUrl(tweet, author);
  return [
    `${author?.name || username} (@${username}) posted on X`,
    tweet.created_at ? `Time: ${tweet.created_at}` : null,
    `URL: ${url}`,
    matchingRules?.length ? `Matched: ${matchingRules.map((rule) => rule.tag || rule.id).join(", ")}` : null,
    "",
    tweet.text || "",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function buildHtmlBody(tweet, author, matchingRules) {
  const username = author?.username || tweet.author_id || "unknown";
  const url = postUrl(tweet, author);
  const matched = matchingRules?.length
    ? `<p><strong>Matched:</strong> ${escapeHtml(matchingRules.map((rule) => rule.tag || rule.id).join(", "))}</p>`
    : "";

  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; line-height: 1.5;">
    <p><strong>${escapeHtml(author?.name || username)}</strong> (@${escapeHtml(username)}) posted on X.</p>
    ${tweet.created_at ? `<p><strong>Time:</strong> ${escapeHtml(tweet.created_at)}</p>` : ""}
    ${matched}
    <blockquote style="border-left: 4px solid #222; margin: 16px 0; padding-left: 12px; white-space: pre-wrap;">${escapeHtml(tweet.text || "")}</blockquote>
    <p><a href="${escapeHtml(url)}">Open post on X</a></p>
  </body>
</html>`;
}

function postUrl(tweet, author) {
  const username = author?.username;
  if (username) {
    return `https://x.com/${username}/status/${tweet.id}`;
  }
  return `https://x.com/i/web/status/${tweet.id}`;
}

function envRequired(name) {
  if (!process.env[name]) {
    throw new Error(`Missing SMTP env var: ${name}`);
  }
  return process.env[name];
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
