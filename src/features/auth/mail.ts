import { SITE_TITLE } from "@/components/core/Header";
import { getBaseUrl } from "@/lib/get-base-url";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.mailbox.org",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendMagicLink(email: string, token: string) {
  const baseUrl = await getBaseUrl();
  const link = `${baseUrl}/verify?token=${token}`;
  const logoUrl = `${baseUrl}/images/UN_Logo_Stacked_Colour_English.svg`;

  await transporter.sendMail({
    from: `"${SITE_TITLE}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: email,
    subject: `Sign in to ${SITE_TITLE}`,
    text: `${SITE_TITLE}\n\nClick here to sign in: ${link}\n\nThis link expires in 15 minutes.\n\nIf you did not request this email, you can safely ignore it.`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:32px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;">
        <!-- Header matching website -->
        <tr><td style="padding:0 0 24px;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="vertical-align:middle;padding-right:16px;">
                <img src="${logoUrl}" alt="UN" width="120" style="display:block;" />
              </td>
              <td style="vertical-align:middle;">
                <div style="font-size:20px;font-weight:700;color:#000000;line-height:1.2;">${SITE_TITLE}</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <!-- Divider -->
        <tr><td style="border-top:1px solid #e5e7eb;padding:24px 0 0;"></td></tr>
        <!-- Content -->
        <tr><td>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">Click the button below to sign in to your account.<br><br>This link will expire in 15 minutes.</p>
          <a href="${link}" style="display:inline-block;background:#005a80;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:500;">Sign in</a>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#374151;">If the button doesn't work, copy and paste this link into your browser:<br><a href="${link}" style="color:#005a80;word-break:break-all;">${link}</a></p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:32px 0 0;">
          <p style="margin:0;font-size:12px;color:#374151;line-height:1.5;">If you did not request this email, you can safely ignore it.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}
