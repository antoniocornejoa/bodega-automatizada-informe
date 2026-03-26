// Google Sheets client - Service Account authentication (GitHub Actions compatible)
// Reemplaza la integración con Replit Connectors por credenciales de Service Account
import { google } from "googleapis";

function getAuthClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!email || !key) {
    throw new Error(
      "Se requieren las variables de entorno GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_PRIVATE_KEY"
    );
  }

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: key,
    },
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });
}

export async function getUncachableGoogleSheetClient() {
  const auth = getAuthClient();
  return google.sheets({ version: "v4", auth });
}
