import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getUncachableGoogleSheetClient } from "../../utils/googleSheets";

const CLASSIFICATION_SPREADSHEET_NAME = "Clasificación Inventario - Bodega";

async function findOrCreateClassificationSpreadsheet(sheets: any, logger: any): Promise<string> {
  const drive = (await import("googleapis")).google.drive({
    version: "v3",
    auth: sheets.context._options.auth,
  });

  const searchRes = await drive.files.list({
    q: `name='${CLASSIFICATION_SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
  });

  const files = searchRes.data.files || [];
  if (files.length > 0) {
    logger?.info(`📋 [classifyResources] Spreadsheet encontrado: ${files[0].id}`);
    return files[0].id!;
  }

  const createRes = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: CLASSIFICATION_SPREADSHEET_NAME,
      },
      sheets: [
        {
          properties: {
            title: "Clasificación Inventario",
            index: 0,
          },
        },
      ],
    },
  });

  const newId = createRes.data.spreadsheetId!;
  logger?.info(`📋 [classifyResources] Spreadsheet nuevo creado: ${newId}`);
  return newId;
}

export const classifyResourcesTool = createTool({
  id: "classify-resources",
  description:
    "Sincroniza todos los recursos únicos del inventario actual con un Google Spreadsheet separado 'Clasificación Inventario - Bodega'. Reescribe la hoja completa preservando la clasificación existente (SI/NO) y agrega recursos nuevos como pendientes.",
  inputSchema: z.object({
    detailItems: z.array(
      z.object({
        codigo: z.string(),
        descripcion: z.string(),
        unidad: z.string(),
        stockValorizado: z.number(),
      })
    ),
  }),
  outputSchema: z.object({
    classifications: z.array(
      z.object({
        codigo: z.string(),
        descripcion: z.string(),
        unidad: z.string(),
        inventariable: z.string(),
        valorTotal: z.number(),
      })
    ),
    totalResources: z.number(),
    classifiedCount: z.number(),
    unclassifiedCount: z.number(),
    inventariableCount: z.number(),
    noInventariableCount: z.number(),
    valorNoInventariable: z.number(),
    valorInventariable: z.number(),
    valorSinClasificar: z.number(),
    spreadsheetId: z.string(),
  }),
  execute: async (inputData, context) => {
    const mastra = context?.mastra;
    const logger = mastra?.getLogger();
    logger?.info("📋 [classifyResources] Iniciando sincronización de clasificación de recursos...");

    const { detailItems } = inputData;

    const byCode = new Map<string, { descripcion: string; unidad: string; valorTotal: number }>();
    for (const item of detailItems) {
      const existing = byCode.get(item.codigo);
      if (existing) {
        existing.valorTotal += item.stockValorizado;
      } else {
        byCode.set(item.codigo, {
          descripcion: item.descripcion,
          unidad: item.unidad,
          valorTotal: item.stockValorizado,
        });
      }
    }

    logger?.info(`📋 [classifyResources] ${byCode.size} recursos únicos encontrados en inventario`);

    const sheets = await getUncachableGoogleSheetClient();
    const spreadsheetId = await findOrCreateClassificationSpreadsheet(sheets, logger);

    const existingClassifications = new Map<string, string>();

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'Clasificación Inventario'!A:E`,
      });

      const rows = response.data.values;
      if (rows && rows.length > 1) {
        for (let i = 1; i < rows.length; i++) {
          const codigo = String(rows[i][0] || "").trim();
          const inventariable = String(rows[i][4] || "").trim().toUpperCase();
          if (codigo && (inventariable === "SI" || inventariable === "NO")) {
            existingClassifications.set(codigo, inventariable);
          }
        }
        logger?.info(`📋 [classifyResources] Leídas ${existingClassifications.size} clasificaciones existentes (SI/NO)`);
      }
    } catch (err: any) {
      logger?.info("📋 [classifyResources] Hoja vacía o nueva, se llenará desde cero");
    }

    const sortedCodes = Array.from(byCode.entries()).sort((a, b) => b[1].valorTotal - a[1].valorTotal);

    const allRows: (string | number)[][] = [
      ["CÓDIGO", "DESCRIPCIÓN", "UNIDAD", "VALOR TOTAL", "INVENTARIABLE"],
    ];

    for (const [codigo, data] of sortedCodes) {
      const inv = existingClassifications.get(codigo) || "";
      allRows.push([
        codigo,
        data.descripcion,
        data.unidad,
        Math.round(data.valorTotal),
        inv,
      ]);
    }

    try {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetInfo = spreadsheet.data.sheets?.find(
        (s: any) => s.properties?.title === "Clasificación Inventario"
      );
      const sheetId = sheetInfo?.properties?.sheetId ?? 0;

      const neededRows = allRows.length + 10;
      const currentRows = sheetInfo?.properties?.gridProperties?.rowCount || 1000;

      const batchRequests: any[] = [];

      batchRequests.push({
        updateCells: {
          range: { sheetId },
          fields: "userEnteredValue",
        },
      });

      if (currentRows < neededRows) {
        batchRequests.push({
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: {
                rowCount: neededRows,
                columnCount: 5,
              },
            },
            fields: "gridProperties.rowCount,gridProperties.columnCount",
          },
        });
      }

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: batchRequests },
      });

      const batchSize = 500;
      for (let i = 0; i < allRows.length; i += batchSize) {
        const batch = allRows.slice(i, i + batchSize);
        const startRow = i + 1;
        const endRow = startRow + batch.length - 1;

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `'Clasificación Inventario'!A${startRow}:E${endRow}`,
          valueInputOption: "RAW",
          requestBody: { values: batch },
        });
      }

      logger?.info(`📋 [classifyResources] Hoja actualizada con ${sortedCodes.length} recursos en spreadsheet ${spreadsheetId}`);
    } catch (writeErr: any) {
      const msg = writeErr instanceof Error ? writeErr.message : String(writeErr);
      logger?.warn(`⚠️ [classifyResources] Error escribiendo: ${msg}`);
    }

    const classifications: {
      codigo: string;
      descripcion: string;
      unidad: string;
      inventariable: string;
      valorTotal: number;
    }[] = [];

    let classifiedCount = 0;
    let unclassifiedCount = 0;
    let inventariableCount = 0;
    let noInventariableCount = 0;
    let valorNoInventariable = 0;
    let valorInventariable = 0;
    let valorSinClasificar = 0;

    for (const [codigo, data] of byCode) {
      const inv = existingClassifications.get(codigo) || "";
      const isNo = inv === "NO";
      const isSi = inv === "SI";

      classifications.push({
        codigo,
        descripcion: data.descripcion,
        unidad: data.unidad,
        inventariable: inv || "SIN CLASIFICAR",
        valorTotal: data.valorTotal,
      });

      if (isSi) {
        classifiedCount++;
        inventariableCount++;
        valorInventariable += data.valorTotal;
      } else if (isNo) {
        classifiedCount++;
        noInventariableCount++;
        valorNoInventariable += data.valorTotal;
      } else {
        unclassifiedCount++;
        valorSinClasificar += data.valorTotal;
      }
    }

    classifications.sort((a, b) => b.valorTotal - a.valorTotal);

    logger?.info(
      `✅ [classifyResources] Clasificación completada: ${inventariableCount} SI, ${noInventariableCount} NO, ${unclassifiedCount} sin clasificar. Valor NO inventariable: $${Math.round(valorNoInventariable).toLocaleString("es-CL")}`
    );

    return {
      classifications,
      totalResources: byCode.size,
      classifiedCount,
      unclassifiedCount,
      inventariableCount,
      noInventariableCount,
      valorNoInventariable,
      valorInventariable,
      valorSinClasificar,
      spreadsheetId,
    };
  },
});
