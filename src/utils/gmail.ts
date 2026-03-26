// Gmail via nodemailer + SMTP (Gmail App Password) - GitHub Actions compatible
// Reemplaza la integracion con Replit Connectors por SMTP directo
import nodemailer from "nodemailer";

interface GmailMessage {
    to: string;
    cc?: string;
    subject: string;
    text?: string;
    html?: string;
    attachments?: {
      filename: string;
      content: string;
      contentType?: string;
      encoding?: string;
    }[];
}

export async function sendGmail(
    message: GmailMessage
  ): Promise<{ messageId: string }> {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
        throw new Error(
                "Se requieren las variables de entorno GMAIL_USER y GMAIL_APP_PASSWORD"
              );
  }

  const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user, pass },
  });

  const attachments = (message.attachments || []).map((att) => ({
        filename: att.filename,
        content: Buffer.from(att.content, "base64"),
        contentType: att.contentType || "application/octet-stream",
  }));

  const info = await transporter.sendMail({
        from: user,
        to: message.to,
        cc: message.cc,
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments,
  });

  return { messageId: info.messageId || "" };
}
