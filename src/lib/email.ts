import { Resend } from "resend";
import { env } from "../config/env";

const resend = new Resend(env.RESEND_API_KEY);

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export const sendEmail = async ({ to, subject, html }: SendEmailOptions) => {
  try {
    const { data, error } = await resend.emails.send({
      from: env.EMAIL_FROM as string,
      to,
      subject,
      html,
    });

    if (error) {
      console.error(" Email error:", error);
      throw new Error(error.message);
    }

    return data;
  } catch (err) {
    console.error("Failed to send email:", err);
    throw err;
  }
};
