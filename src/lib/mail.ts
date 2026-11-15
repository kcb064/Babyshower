/** Outgoing email over SMTP. Off unless SMTP_HOST (and a sender address) is configured. */
import nodemailer from "nodemailer";

export interface MailConfig {
  host: string;
  port: number;
  /** Implicit TLS (port 465). Other ports upgrade with STARTTLS when the server offers it. */
  secure: boolean;
  user: string | undefined;
  pass: string | undefined;
  from: string;
}

export function mailConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MailConfig | null {
  const host = env.SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(env.SMTP_PORT?.trim() || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const user = env.SMTP_USER?.trim() || undefined;
  const from = env.MAIL_FROM?.trim() || user;
  if (!from) return null;
  return { host, port, secure: port === 465, user, pass: env.SMTP_PASS?.trim() || undefined, from };
}

export function mailEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return mailConfigFromEnv(env) !== null;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export type SendMail = (mail: Mail) => Promise<void>;

/** A sender for the configured SMTP server, or null when email is not set up. */
export function mailer(env: NodeJS.ProcessEnv = process.env): SendMail | null {
  const cfg = mailConfigFromEnv(env);
  if (!cfg) return null;
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? "" } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return async (mail) => {
    await transport.sendMail({ from: cfg.from, to: mail.to, subject: mail.subject, text: mail.text });
  };
}
