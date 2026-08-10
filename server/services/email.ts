import { Resend } from "resend";

let connectionSettings: any;

async function getResendCredentials(): Promise<{ apiKey: string; fromEmail: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!hostname || !xReplitToken) {
    throw new Error("Resend connector environment not available");
  }

  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=resend",
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    }
  )
    .then((res) => res.json())
    .then((data) => data.items?.[0]);

  if (!connectionSettings?.settings?.api_key) {
    throw new Error("Resend not connected");
  }

  return {
    apiKey: connectionSettings.settings.api_key,
    fromEmail: connectionSettings.settings.from_email || "invites@parlayconch.com",
  };
}

// WARNING: Never cache this client — tokens expire.
async function getUncachableResendClient() {
  const { apiKey, fromEmail } = await getResendCredentials();
  return { client: new Resend(apiKey), fromEmail };
}

// ─── Email templates ────────────────────────────────────────────────────────

function baseHtml(body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; padding: 0; background: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #fafafa; }
    .container { max-width: 560px; margin: 40px auto; background: #18181b; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }
    .header { background: #09090b; padding: 28px 32px 24px; border-bottom: 1px solid rgba(255,255,255,0.08); }
    .logo { font-size: 22px; font-weight: 800; color: #22c55e; letter-spacing: -0.5px; }
    .logo span { color: #fafafa; }
    .body { padding: 32px; }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px; color: #fafafa; }
    p { font-size: 15px; line-height: 1.6; color: #a1a1aa; margin: 0 0 16px; }
    .cta { display: inline-block; background: #22c55e; color: #09090b; font-weight: 700; font-size: 15px; text-decoration: none; padding: 13px 28px; border-radius: 10px; margin: 8px 0 24px; }
    .code-block { background: #09090b; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 16px 20px; margin: 12px 0 24px; }
    .code { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 24px; font-weight: 700; color: #22c55e; letter-spacing: 4px; }
    .divider { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 24px 0; }
    .footer { padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.08); }
    .footer p { font-size: 12px; color: #52525b; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">PARLAY<span>.CONCH</span></div>
    </div>
    <div class="body">${body}</div>
    <div class="footer">
      <p>Parlay.Conch · <a href="https://parlayconch.com" style="color:#52525b;">parlayconch.com</a></p>
      <p style="margin-top:6px;">You received this because someone invited you to their league. If you weren't expecting this, you can safely ignore it.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Sending functions ───────────────────────────────────────────────────────

/**
 * Send a "you've been added" email to an existing Parlay.Conch user.
 */
export async function sendMemberAddedEmail(opts: {
  toEmail: string;
  toName: string | null;
  leagueName: string;
  inviterName: string;
  leagueId: number;
}): Promise<void> {
  const { client, fromEmail } = await getUncachableResendClient();

  const greeting = opts.toName ? `Hi ${opts.toName},` : "Hey there,";
  const appUrl = `https://parlayconch.com/leagues/${opts.leagueId}`;

  const html = baseHtml(`
    <h1>You've been added to ${opts.leagueName}!</h1>
    <p>${greeting}</p>
    <p><strong>${opts.inviterName}</strong> added you to their Parlay.Conch league <strong>${opts.leagueName}</strong>. You can head straight to the league and start submitting picks.</p>
    <a class="cta" href="${appUrl}">View Your League →</a>
    <hr class="divider" />
    <p style="font-size:13px;">Or copy this link into your browser:<br/><span style="color:#71717a;">${appUrl}</span></p>
  `);

  await client.emails.send({
    from: `Parlay.Conch <${fromEmail}>`,
    to: opts.toEmail,
    subject: `You've been added to ${opts.leagueName} on Parlay.Conch`,
    html,
  });
}

/**
 * Sent during the Replit-auth -> email/password migration: asks an existing
 * Replit-only user to set a password so they can keep signing in once
 * Replit login is removed.
 */
export async function sendSetPasswordEmail(opts: {
  toEmail: string;
  toName: string | null;
  setPasswordUrl: string;
}): Promise<void> {
  const { client, fromEmail } = await getUncachableResendClient();

  const greeting = opts.toName ? `Hi ${opts.toName},` : "Hey there,";

  const html = baseHtml(`
    <h1>Set a password for your account</h1>
    <p>${greeting}</p>
    <p>We're retiring "Sign in with Replit." To keep using Parlay.Conch without interruption, set a password for your account — you'll then sign in with your email and that password.</p>
    <a class="cta" href="${opts.setPasswordUrl}">Set Your Password →</a>
    <hr class="divider" />
    <p style="font-size:13px;">Or copy this link into your browser:<br/><span style="color:#71717a;">${opts.setPasswordUrl}</span></p>
    <p style="font-size:13px;">This link expires in 14 days. If you don't set a password before then, just request a new link from the sign-in page.</p>
  `);

  await client.emails.send({
    from: `Parlay.Conch <${fromEmail}>`,
    to: opts.toEmail,
    subject: "Action needed: set a password for your Parlay.Conch account",
    html,
  });
}

/**
 * Send an invitation email to someone who doesn't have an account yet.
 */
export async function sendLeagueInviteEmail(opts: {
  toEmail: string;
  leagueName: string;
  inviterName: string;
  inviteCode: string;
}): Promise<void> {
  const { client, fromEmail } = await getUncachableResendClient();

  const joinUrl = `https://parlayconch.com`;

  const html = baseHtml(`
    <h1>You're invited to ${opts.leagueName}!</h1>
    <p><strong>${opts.inviterName}</strong> has invited you to join their NFL parlay league <strong>${opts.leagueName}</strong> on Parlay.Conch.</p>
    <p>Parlay.Conch is where friend groups track their NFL parlay picks head-to-head. Create an account and use the invite code below to join the league.</p>
    <a class="cta" href="${joinUrl}">Create Your Account →</a>
    <p style="margin-top:8px;font-size:14px;color:#a1a1aa;">Once you're in, enter this invite code to join ${opts.leagueName}:</p>
    <div class="code-block">
      <div class="code">${opts.inviteCode}</div>
    </div>
    <p style="font-size:13px;color:#71717a;">Your invite code is: <strong style="color:#fafafa;">${opts.inviteCode}</strong></p>
  `);

  await client.emails.send({
    from: `Parlay.Conch <${fromEmail}>`,
    to: opts.toEmail,
    subject: `${opts.inviterName} invited you to ${opts.leagueName} on Parlay.Conch`,
    html,
  });
}
