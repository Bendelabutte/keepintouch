import { Resend } from 'resend';

const resend = new Resend(import.meta.env.VITE_RESEND_API_KEY);

export async function sendEmail(to, subject, html) {
  try {
    const data = await resend.emails.send({
      from: import.meta.env.VITE_RESEND_FROM,
      to,
      subject,
      html,
    });
    return data;
  } catch (error) {
    console.error('Erreur envoi email:', error);
    throw error;
  }
}
