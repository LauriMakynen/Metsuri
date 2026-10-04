import nodemailer from 'nodemailer';

// SMTP settings come from backend/.env. Without SMTP_HOST, development sends to Mailpit
// (docker-compose, http://localhost:8025), which catches every message locally.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: Number(process.env.SMTP_PORT || 1025),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

const FROM = process.env.MAIL_FROM || 'Metsuri <noreply@metsuri.local>';

export async function sendPasswordResetEmail(to: string, resetUrl: string, validMinutes: number) {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: 'Metsuri – salasanan vaihto',
    text: [
      'Hei,',
      '',
      'Pyysit Metsurissa salasanan vaihtoa. Voit asettaa uuden salasanan tästä linkistä:',
      resetUrl,
      '',
      `Linkki on voimassa ${validMinutes} minuuttia ja toimii kerran.`,
      'Jos et pyytänyt vaihtoa, voit jättää tämän viestin huomiotta – salasanasi ei muutu.',
      '',
      'Metsuri',
    ].join('\n'),
    html: `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; color: #1a2e1a;">
        <h2 style="color: #166534;">🌲 Metsuri – salasanan vaihto</h2>
        <p>Pyysit Metsurissa salasanan vaihtoa. Voit asettaa uuden salasanan alla olevasta painikkeesta.</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="background: #166534; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Vaihda salasana
          </a>
        </p>
        <p style="color: #6b7280; font-size: 14px;">
          Linkki on voimassa ${validMinutes} minuuttia ja toimii kerran. Jos et pyytänyt vaihtoa,
          voit jättää tämän viestin huomiotta – salasanasi ei muutu.
        </p>
      </div>`,
  });
}
