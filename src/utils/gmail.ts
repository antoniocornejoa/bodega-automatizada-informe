// Gmail integration via Google OAuth
import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

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

function buildMimeMessage(message: GmailMessage): string {
  const boundary = 'boundary_' + Date.now().toString(36);
  const headerLines = [`To: ${message.to}`];
  if (message.cc) headerLines.push(`Cc: ${message.cc}`);
  headerLines.push(
    `Subject: =?UTF-8?B?${Buffer.from(message.subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  );
  let body = headerLines.join('\r\n') + '\r\n\r\n';

  if (message.html) {
    body += `--${boundary}\r\n`;
    body += 'Content-Type: text/html; charset=UTF-8\r\n';
    body += 'Content-Transfer-Encoding: base64\r\n\r\n';
    body += Buffer.from(message.html).toString('base64') + '\r\n';
  } else if (message.text) {
    body += `--${boundary}\r\n`;
    body += 'Content-Type: text/plain; charset=UTF-8\r\n';
    body += 'Content-Transfer-Encoding: base64\r\n\r\n';
    body += Buffer.from(message.text).toString('base64') + '\r\n';
  }

  if (message.attachments) {
    for (const att of message.attachments) {
      body += `--${boundary}\r\n`;
      body += `Content-Type: ${att.contentType || 'application/octet-stream'}; name="${att.filename}"\r\n`;
      body += `Content-Disposition: attachment; filename="${att.filename}"\r\n`;
      body += 'Content-Transfer-Encoding: base64\r\n\r\n';
      body += att.content + '\r\n';
    }
  }
  body += `--${boundary}--`;
  return body;
}

export async function sendGmail(message: GmailMessage): Promise<{ messageId: string }> {
  const gmail = await getUncachableGmailClient();
  const raw = buildMimeMessage(message);
  const encodedMessage = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });
  return { messageId: result.data.id || '' };
}
