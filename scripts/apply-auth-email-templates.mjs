// Branded Supabase auth email templates (round-2 tester feedback: the
// confirmation email was bare grey text — no name, no logo — and failed
// LIVE-TEST-PLAN step 1.6's "does it look like a real company sent it").
//
// Auth emails (confirm / reset / magic link / email change / invite / reauth
// code) are sent by Supabase Auth over the Resend SMTP bridge, NOT by
// src/services/email.ts — their bodies live in project config, not code.
// This script is the source of truth for those bodies: it PATCHes the
// Management API and verifies the write, so the templates are reviewable and
// re-appliable instead of hand-edits in the dashboard.
//
//   node scripts/apply-auth-email-templates.mjs          # DEV
//   node scripts/apply-auth-email-templates.mjs --prod   # prod
//
// Keep the visual style in lockstep with src/services/email.ts (logo, ink
// heading, muted body, terra button). Template vars like {{ .ConfirmationURL }}
// are Go-template placeholders Supabase fills in — leave them verbatim.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(repo, '.env.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')])
);

const PROD = process.argv.includes('--prod');
const REF = (PROD ? env.PROD_SUPABASE_URL : env.NEXT_PUBLIC_SUPABASE_URL)
  .match(/https:\/\/([a-z]+)\.supabase\.co/)[1];
const TOKEN = env.SUPABASE_ACCESS_TOKEN;

// The logo is a public prod asset; using the prod URL everywhere means DEV
// emails render the brand too (DEV has no stable public domain of its own).
const LOGO = '<img src="https://customcanvas.shop/email-logo.png" width="180" height="32" alt="Custom Canvas" style="display:block;margin:0 0 20px" />';

const layout = (heading, bodyHtml) => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px 0">${LOGO}
  <h2 style="color:#111">${heading}</h2>
${bodyHtml}
  <p style="color:#999;font-size:12px;line-height:1.5;margin-top:32px">Custom Canvas — original art from your local community. Questions? Reply to this email or write to support@customcanvas.shop.</p>
</div>`;

const p = (text) => `  <p style="color:#666;font-size:16px;line-height:1.5">${text}</p>`;
const button = (href, label) =>
  `  <p><a href="${href}" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">${label}</a></p>`;
const ignore = (text) => `  <p style="color:#666;font-size:14px;line-height:1.5;margin-top:16px">${text}</p>`;

const config = {
  mailer_subjects_confirmation: 'Confirm your email address',
  mailer_templates_confirmation_content: layout(
    'Confirm your email address',
    [
      p('Welcome to Custom Canvas! Click the button below to confirm this email address and finish creating your account.'),
      button('{{ .ConfirmationURL }}', 'Confirm email address'),
      ignore("If you didn't create a Custom Canvas account, you can safely ignore this email."),
    ].join('\n')
  ),
  // Matches the admin-started reset's subject in src/services/email.ts, so
  // both reset paths read the same in an inbox.
  mailer_subjects_recovery: 'Reset your Custom Canvas password',
  mailer_templates_recovery_content: layout(
    'Reset your password',
    [
      p('We received a request to reset your Custom Canvas password. Click the button below to choose a new one.'),
      button('{{ .ConfirmationURL }}', 'Choose a new password'),
      ignore("Didn't request this? You can safely ignore it — your current password keeps working."),
    ].join('\n')
  ),
  mailer_subjects_magic_link: 'Your Custom Canvas sign-in link',
  mailer_templates_magic_link_content: layout(
    'Your sign-in link',
    [
      p('Click the button below to sign in to Custom Canvas. The link expires shortly and can only be used once.'),
      button('{{ .ConfirmationURL }}', 'Sign in'),
      ignore("If you didn't request this link, you can safely ignore this email."),
    ].join('\n')
  ),
  mailer_subjects_email_change: 'Confirm your new email address',
  mailer_templates_email_change_content: layout(
    'Confirm your new email address',
    [
      p('Click the button below to confirm {{ .NewEmail }} as the new email address for your Custom Canvas account.'),
      button('{{ .ConfirmationURL }}', 'Confirm new email address'),
      ignore("If you didn't request this change, you can safely ignore this email."),
    ].join('\n')
  ),
  mailer_subjects_invite: "You're invited to Custom Canvas",
  mailer_templates_invite_content: layout(
    "You're invited",
    [
      p("You've been invited to create a Custom Canvas account. Click the button below to accept."),
      button('{{ .ConfirmationURL }}', 'Accept invitation'),
    ].join('\n')
  ),
  mailer_subjects_reauthentication: '{{ .Token }} is your verification code',
  mailer_templates_reauthentication_content: layout(
    'Your verification code',
    [
      p('Use the code below to verify your identity. It expires shortly.'),
      `  <p style="font-size:28px;font-weight:bold;letter-spacing:4px;color:#111;padding:12px 16px;background:#faf3ef;border-radius:6px;display:inline-block">{{ .Token }}</p>`,
      ignore("If you didn't request a code, you can safely ignore this email."),
    ].join('\n')
  ),
};

const api = `https://api.supabase.com/v1/projects/${REF}/config/auth`;
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

console.error(`Applying ${Object.keys(config).length} auth mailer settings to ${PROD ? 'PROD' : 'DEV'} (${REF})…`);
const res = await fetch(api, { method: 'PATCH', headers, body: JSON.stringify(config) });
if (!res.ok) {
  console.error(`PATCH failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

// Verify: read back and diff every key we set.
const applied = await (await fetch(api, { headers })).json();
const bad = Object.keys(config).filter((k) => applied[k] !== config[k]);
if (bad.length) {
  console.error('MISMATCH after apply:', bad.join(', '));
  process.exit(1);
}
console.error('All templates applied and verified.');
