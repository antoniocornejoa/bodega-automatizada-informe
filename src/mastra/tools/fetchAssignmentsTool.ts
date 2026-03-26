import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getUncachableGoogleSheetClient } from "../../utils/googleSheets";

const SPREADSHEET_ID = "19-LRlC1MWFRxtpjfhSX0KbJPCOO1fu4ebzzh_ZVb1kE";
const SHEET_NAME = "ASIGNACIONES HISTORICO";

function parseDate(dateStr: string): Date | null {
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return new Date(year, month, day);
}

function getWeekRange(referenceDate: Date): { start: Date; end: Date } {
  const d = new Date(referenceDate);
  d.setHours(0, 0, 0, 0);
  const dayOfWeek = d.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const start = new Date(d);
  start.setDate(d.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export const fetchAssignmentsTool = createTool({
  id: "fetch-weekly-assignments",
  description:
    "Obtiene las asignaciones de excedentes de la semana actual desde la hoja ASIGNACIONES HISTORICO, filtrando por FECHA ASIGNACIÓN (columna X) y valorizando con cantidad final × costo unitario.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    totalAssignments: z.number(),
    totalValorizado: z.number(),
    weekStart: z.string(),
    weekEnd: z.string(),
    byDestino: z.array(
      z.object({
        destino: z.string(),
        count: z.number(),
        valor: z.number(),
      })
    ),
  }),
  execute: async (_inputData, context) => {
    const mastra = context?.mastra;
    const logger = mastra?.getLogger();
    logger?.info("📊 [fetchAssignments] Starting weekly assignments fetch...");

    try {
      const sheets = await getUncachableGoogleSheetClient();

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${SHEET_NAME}'!A1:AC`,
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        logger?.warn("⚠️ [fetchAssignments] No data found");
        return {
          totalAssignments: 0,
          totalValorizado: 0,
          weekStart: "",
          weekEnd: "",
          byDestino: [],
        };
      }

      logger?.info(
        `📋 [fetchAssignments] Total rows in sheet: ${rows.length}`
      );

      const now = new Date();
      const { start, end } = getWeekRange(now);

      const fmt = (d: Date) =>
        `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      const weekStartStr = fmt(start);
      const weekEndStr = fmt(end);

      logger?.info(
        `📅 [fetchAssignments] Filtering week: ${weekStartStr} - ${weekEndStr}`
      );

      const destinoMap = new Map();
      let totalAssignments = 0;
      let totalValorizado = 0;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const fechaStr = String(row?.[23] || "").trim();
        if (!fechaStr) continue;

        const fecha = parseDate(fechaStr);
        if (!fecha) continue;

        if (fecha < start || fecha > end) continue;

        const cantidadFinal =
          parseFloat(
            String(row[16] || row[9] || "0")
              .replace(/[$\s]/g, "")
              .replace(/\./g, "")
              .replace(",", ".")
          ) || 0;

        const costoUnit =
          parseFloat(
            String(row[10] || "0")
              .replace(/[$\s]/g, "")
              .replace(/\./g, "")
              .replace(",", ".")
          ) || 0;

        const valor = cantidadFinal * costoUnit;
        const destino = String(row[2] || "Sin destino").trim();

        totalAssignments++;
        totalValorizado += valor;

        const entry = destinoMap.get(destino) || { count: 0, valor: 0 };
        entry.count++;
        entry.valor += valor;
        destinoMap.set(destino, entry);
      }

      const byDestino = Array.from(destinoMap.entries())
        .map(([destino, data]) => ({
          destino,
          count: data.count,
          valor: data.valor,
        }))
        .sort((a, b) => b.valor - a.valor);

      logger?.info(
        `✅ [fetchAssignments] Found ${totalAssignments} assignments this week, total valor: $${Math.round(totalValorizado).toLocaleString("es-CL")}`
      );

      return {
        totalAssignments,
        totalValorizado,
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
        byDestino,
      };
    } catch (error) {
      logger?.error(
        `❌ [fetchAssignments] Error: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  },
});
