import nodemailer, { type Transporter } from 'nodemailer';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Captures mails in memory – used by tests to read verification/reset links. */
export class MemoryMailer implements Mailer {
  readonly outbox: Mail[] = [];
  async send(mail: Mail): Promise<void> {
    this.outbox.push(mail);
  }
}

class SmtpMailer implements Mailer {
  constructor(
    private readonly transport: Transporter,
    private readonly from: string,
  ) {}
  async send(mail: Mail): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...mail });
  }
}

/** Development fallback: e-mails are written to the log instead of being sent. */
class LogMailer implements Mailer {
  constructor(private readonly log: FastifyBaseLogger) {}
  async send(mail: Mail): Promise<void> {
    this.log.info({ mail }, `✉️  [dev mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
  }
}

export function createMailer(config: Config, log: FastifyBaseLogger): Mailer {
  if (!config.SMTP_HOST) return new LogMailer(log);
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
  });
  return new SmtpMailer(transport, config.MAIL_FROM);
}
