// Email sending via the Replit Gmail connector (integration: google-mail).
// Uses the connectors SDK proxy which injects OAuth2 tokens + refresh automatically.
import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export async function sendEmail(opts: { to: string; subject: string; html: string }) {
  const { to, subject, html } = opts;
  const message =
    `To: ${to}\r\n` +
    `Subject: ${subject}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: text/html; charset="UTF-8"\r\n\r\n` +
    html;
  const raw = Buffer.from(message).toString("base64url");

  const response = await connectors.proxy("google-mail", "/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gmail send failed (${response.status}): ${body}`);
  }
  return response.json();
}
