export interface SendEmailOptions {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
}

export interface IEmailTransport {
  send(options: SendEmailOptions): Promise<void>;
}

export const EMAIL_TRANSPORT = Symbol('EMAIL_TRANSPORT');
