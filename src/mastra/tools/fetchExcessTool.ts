import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getUncachableGoogleSheetClient } from "../../utils/googleSheets";

const SPREADSHEET_ID = "19-LRlC1MWFRxtpjfhSX0KbJPCOO1fu4ebzzh_ZVb1kE";
const SHEET_NAME = "Solicitudes";

export const fetchExcessTool = createTool({
  id: "fetch-excess-inventory",
  description:
    "Obtiene los datos de excedentes de inventario desde Google Sheets (hoja Solicitudes). Lee columna G (OBRA ORIGEN), J y K para calcular la valorización.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    excessRecords: z.array(
      z.object({
        obraOrigen: z.string(),
        valorExcedente: z.number(),
      })
    ),
    recordCount: z.number(),
  }),
  execute: async (_inputData, context) => {
    const mastra = context?.mastra;
    const logger = mastra?.getLogger();
    logger?.info("📊 [fetchExcess] Starting Google Sheets data fetch...");

    try {
      const sheets = await getUncachableGoogleSheetClient();
      logger?.info(
        `📋 [fetchExcess] Fetching data from spreadsheet: ${SPREADSHEET_ID}, sheet: ${SHEET_NAME}`
      );

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A:K`,
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        logger?.warn("⚠️ [fetchExcess] No data found in Google Sheets");
        return { excessRecords: [], recordCount: 0 };
      }

      const headerRow = rows[0];
      logger?.info(
        `📋 [fetchExcess] Headers found: ${JSON.stringify(headerRow)}`
      );

      let obraOrigenIdx = -1;
      let colJIdx = -1;
      let colKIdx = -1;

      headerRow.forEach((header: string, idx: number) => {
        const h = String(header).trim().toLowerCase();
        if (h.includes("obra") && h.includes("origen")) {
          obraOrigenIdx = idx;
        }
      });

      colJIdx = 9;
      colKIdx = 10;

      if (obraOrigenIdx === -1) {
        obraOrigenIdx = 6;
        logger?.warn(
          `⚠️ [fetchExcess] Could not find "OBRA ORIGEN" header, defaulting to column G (index 6)`
        );
      }

      logger?.info(
        `📋 [fetchExcess] Using columns - OBRA ORIGEN: ${obraOrigenIdx}, J: ${colJIdx}, K: ${colKIdx}`
      );

      const records: { obraOrigen: string; valorExcedente: number }[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const obraOrigen = String(row[obraOrigenIdx] || "").trim();

        if (!obraOrigen) continue;

        const valJ = parseFloat(
          String(row[colJIdx] || "0")
            .replace(/[$\s]/g, "")
            .replace(/\./g, "")
            .replace(",", ".")
        ) || 0;
        const valK = parseFloat(
          String(row[colKIdx] || "0")
            .replace(/[$\s]/g, "")
            .replace(/\./g, "")
            .replace(",", ".")
        ) || 0;

        const valorExcedente = valJ * valK;

        records.push({ obraOrigen, valorExcedente });
      }

      logger?.info(
        `✅ [fetchExcess] Parsed ${records.length} excess inventory records`
      );

      return {
        excessRecords: records,
        recordCount: records.length,
      };
    } catch (error) {
      logger?.error(
        `❌ [fetchExcess] Error: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  },
});
