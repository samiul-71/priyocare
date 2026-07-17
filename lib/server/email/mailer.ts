import "server-only";

import nodemailer from "nodemailer";

/**
 * Email delivery behind a seam (§19), mirroring the SMS sender in
 * `lib/server/auth/otp.ts`. One `EmailSender` interface, a real SMTP
 * implementation, a dev console fallback, and an `isEmailConfigured()` the UI
 * asks before it offers a flow that needs mail.
 *
 * WHY A SEAM: staff self-service forgot-password is the one thing in the
 * credential story that needs email. Everything is built and tested against the
 * seam; the provider (Mailtrap SMTP for now) is swapped in via env with no code
 * change. If it is not configured, the flow degrades honestly to "ask an admin
 * to reset it" — which already works — rather than a form that silently drops
 * mail into the void.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSender {
  send(msg: EmailMessage): Promise<void>;
}

interface SmtpConfig {
  host?: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  secure: boolean;
}

function smtpConfig(): SmtpConfig {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || "PriyoCare <no-reply@priyocare.app>",
    // Only port 465 speaks TLS from the first byte; 587/2525 (Mailtrap) start
    // plaintext and upgrade with STARTTLS, which nodemailer does automatically.
    secure: process.env.SMTP_SECURE === "true",
  };
}

// A non-pooled transport holds no idle socket, so unlike the DB pool it needs no
// globalThis anchor to survive HMR — a reload just rebuilds a cheap object.
let transporter: nodemailer.Transporter | undefined;
function getTransport(c: SmtpConfig): nodemailer.Transporter {
  if (transporter) return transporter;
  if (!c.host || !c.user || !c.pass) {
    throw new Error(
      "SMTP is not fully configured — need SMTP_HOST, SMTP_USER and SMTP_PASS. " +
        "Set EMAIL_PROVIDER_CONFIGURED=1 only once they are present.",
    );
  }
  transporter = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: { user: c.user, pass: c.pass },
  });
  return transporter;
}

/** Real SMTP delivery (Mailtrap for now, any SMTP host in future). */
export const smtpEmail: EmailSender = {
  async send(msg) {
    const c = smtpConfig();
    await getTransport(c).sendMail({
      from: c.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      ...(msg.html ? { html: msg.html } : {}),
    });
  },
};

/**
 * Dev sender: prints the mail so the flow is testable with no provider. In
 * production it THROWS rather than silently doing nothing — the same rule as the
 * console SMS sender. A "we've emailed you a link" screen over a mail that was
 * never sent strands the user at exactly the moment they are locked out.
 */
export const consoleEmail: EmailSender = {
  async send(msg) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "No email provider configured — refusing to pretend a mail was sent. " +
          "Set EMAIL_PROVIDER_CONFIGURED=1 with SMTP_* before enabling email in production (§19).",
      );
    }
    console.log(`[EMAIL →${msg.to}] ${msg.subject}\n${msg.text}`);
  },
};

/**
 * True when email can actually be delivered. The forgot-password screen asks
 * this and, when false, points at the admin-reset route instead of a form that
 * cannot work — an honest dead end beats a broken flow (§19).
 */
export function isEmailConfigured(): boolean {
  return process.env.EMAIL_PROVIDER_CONFIGURED === "1";
}

/** The active sender. SMTP when configured, the console placeholder otherwise. */
export const email: EmailSender = isEmailConfigured() ? smtpEmail : consoleEmail;
