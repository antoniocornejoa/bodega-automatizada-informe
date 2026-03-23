import { createStep, createWorkflow } from "../inngest";
import { z } from "zod";
import { scrapeIConstruyeTool } from "../tools/scrapeIConstruyeTool";
import { fetchExcessTool } from "../tools/fetchExcessTool";
import { fetchAssignmentsTool } from "../tools/fetchAssignmentsTool";
import { classifyResourcesTool } from "../tools/classifyResourcesTool";
import { generateReportTool } from "../tools/generateReportTool";
import { sendReportTool } from "../tools/sendReportTool";

const inventoryRecordSchema = z.object({
  centroGestion: z.string(),
  stockValorizado: z.number(),
});

const detailItemSchema = z.object({
  bodega: z.string(),
  codigo: z.string(),
  descripcion: z.string(),
  centroGestion: z.string(),
  unidad: z.string(),
  stock: z.number(),
  ppp: z.number(),
  stockValorizado: z.number(),
});

const excessRecordSchema = z.object({
  obraOrigen: z.string(),
  valorExcedente: z.number(),
});

const assignmentDestinoSchema = z.object({
  destino: z.string(),
  count: z.number(),
  valor: z.number(),
});

const classificationSchema = z.object({
  codigo: z.string(),
  descripcion: z.string(),
  unidad: z.string(),
  inventariable: z.string(),
  valorTotal: z.number(),
});

const scrapeIConstruyeStep = createStep({
  id: "navigate-iconstruye-inventory",
  description:
    "Navega a iConstruye, hace login SSO con Puppeteer, luego scrapea inventario de cada Centro de Gestión vía HTTP fetch con paginación",
  inputSchema: z.object({}),
  outputSchema: z.object({
    inventoryRecords: z.array(inventoryRecordSchema),
    detailItems: z.array(detailItemSchema),
    recordCount: z.number(),
    detailCount: z.number(),
  }),
  execute: async ({ mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🌐 [Paso 1] Iniciando scraping de inventario iConstruye...");

    const result = await scrapeIConstruyeTool.execute({}, { mastra });
    if ("error" in result && result.error) {
      throw new Error(`Falló el scraping de iConstruye: ${(result as any).message}`);
    }

    logger?.info(
      `✅ [Paso 1] Scrapeados ${result.recordCount} centros, ${result.detailCount} ítems detallados`
    );
    return {
      inventoryRecords: result.inventoryRecords,
      detailItems: result.detailItems,
      recordCount: result.recordCount,
      detailCount: result.detailCount,
    };
  },
});

const fetchExcessStep = createStep({
  id: "fetch-excess-inventory-google-sheets",
  description:
    "Obtiene los excedentes de inventario desde Google Sheets y calcula la valorización (columna J × K)",
  inputSchema: z.object({
    inventoryRecords: z.array(inventoryRecordSchema),
    detailItems: z.array(detailItemSchema),
    recordCount: z.number(),
    detailCount: z.number(),
  }),
  outputSchema: z.object({
    inventoryRecords: z.array(inventoryRecordSchema),
    detailItems: z.array(detailItemSchema),
    excessRecords: z.array(excessRecordSchema),
    inventoryCount: z.number(),
    excessCount: z.number(),
    detailCount: z.number(),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📊 [Paso 2] Obteniendo excedentes desde Google Sheets...");

    const result = await fetchExcessTool.execute({}, { mastra });
    if ("error" in result && result.error) {
      throw new Error(
        `Falló la obtención de Google Sheets: ${(result as any).message}`
      );
    }

    logger?.info(`✅ [Paso 2] Obtenidos ${result.recordCount} registros de excedentes`);
    return {
      inventoryRecords: inputData.inventoryRecords,
      detailItems: inputData.detailItems,
      excessRecords: result.excessRecords,
      inventoryCount: inputData.recordCount,
      excessCount: result.recordCount,
      detailCount: inputData.detailCount,
    };
  },
});

const fetchAssignmentsStep = createStep({
  id: "fetch-weekly-assignments",
  description:
    "Obtiene las asignaciones de excedentes de la semana desde ASIGNACIONES HISTORICO",
  inputSchema: z.object({
    inventoryRecords: z.array(inventoryRecordSchema),
    detailItems: z.array(detailItemSchema),
    excessRecords: z.array(excessRecordSchema),
    inventoryCount: z.number(),
    excessCount: z.number(),
    detailCount: z.number(),
  }),
  outputSchema: z.object({
    inventoryRecords: z.array(inventoryRecordSchema),
    detailItems: z.array(detailItemSchema),
    excessRecords: z.array(excessRecordSchema),
    inventoryCount: z.number(),
    excessCount: z.number(),
    detailCount: z.number(),
    weeklyAssignments: z.number(),
    weeklyValorizado: z.number(),
    weekStart: z.string(),
    weekEnd: z.string(),
    assignmentsByDestino: z.array(assignmentDestinoSchema),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📊 [Paso 2.5] Obteniendo asignaciones semanales...");

    const result = await fetchAssignmentsTool.execute({}, { mastra });
    if ("error" in result && result.error) {
      throw new Error(`Falló la obtención de asignaciones: ${(result as any).message}`);
    }

    logger?.info(
      `✅ [Paso 2.5] Encontradas ${result.totalAssignments} asignaciones, valor: $${Math.round(result.totalValorizado).toLocaleString("es-CL")}`
    );
    return {
      inventoryRecords: inputData.inventoryRecords,
      detailItems: inputData.detailItems,
      excessRecords: inputData.excessRecords,
      inventoryCount: inputData.inventoryCount,
      excessCount: inputData.excessCount,
      detailCount: inputData.detailCount,
      weeklyAssignments: result.totalAssignments,
      weeklyValorizado: result.totalValorizado,
      weekStart: result.weekStart,
      weekEnd: result.weekEnd,
      assignmentsByDestino: result.byDestino,
    };
  },
});

const classifyResourcesStep = createStep({
  id: "classify-inventory-resources",
  description:
    "Sincroniza recursos únicos con Google Sheets y lee la clasificación inventariable/no inventariable",
  inputSchema: z.object({
    inventoryRecords: z.array(inventoryRecordSchema),
    detailItems: z.array(detailItemSchema),
    excessRecords: z.array(excessRecordSchema),
    inventoryCount: z.number(),
    excessCount: z.number(),
    detailCount: z.number(),
    weeklyAssignments: z.number(),
    weeklyValorizado: z.number(),
    weekStart: z.string(),
    weekEnd: z.string(),
    assignmentsByDestino: z.array(assignmentDestinoSchema),
  }),
  outputSchema: z.object({
    inventoryRecords: z.array(inventoryRecordSchema),
    detailItems: z.array(detailItemSchema),
    excessRecords: z.array(excessRecordSchema),
    inventoryCount: z.number(),
    excessCount: z.number(),
    detailCount: z.number(),
    weeklyAssignments: z.number(),
    weeklyValorizado: z.number(),
    weekStart: z.string(),
    weekEnd: z.string(),
    assignmentsByDestino: z.array(assignmentDestinoSchema),
    classifications: z.array(classificationSchema),
    totalResources: z.number(),
    classifiedCount: z.number(),
    unclassifiedCount: z.number(),
    inventariableCount: z.number(),
    noInventariableCount: z.number(),
    valorNoInventariable: z.number(),
    valorInventariable: z.number(),
    valorSinClasificar: z.number(),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📋 [Paso 2.7] Clasificando recursos de inventario...");

    const classifyInput = inputData.detailItems.map(item => ({
      codigo: item.codigo,
      descripcion: item.descripcion,
      unidad: item.unidad,
      stockValorizado: item.stockValorizado,
    }));

    const result = await classifyResourcesTool.execute(
      { detailItems: classifyInput },
      { mastra }
    );

    if ("error" in result && result.error) {
      throw new Error(`Falló la clasificación de recursos: ${(result as any).message}`);
    }

    logger?.info(
      `✅ [Paso 2.7] Clasificación: ${result.inventariableCount} SI, ${result.noInventariableCount} NO, ${result.unclassifiedCount} sin clasificar. NO inventariable: $${Math.round(result.valorNoInventariable).toLocaleString("es-CL")}`
    );

    return {
      ...inputData,
      classifications: result.classifications,
      totalResources: result.totalResources,
      classifiedCount: result.classifiedCount,
      unclassifiedCount: result.unclassifiedCount,
      inventariableCount: result.inventariableCount,
      noInventariableCount: result.noInventariableCount,
      valorNoInventariable: result.valorNoInventariable,
      valorInventariable: result.valorInventariable,
      valorSinClasificar: result.valorSinClasificar,
    };
  },
});

const generateReportStep = createStep({
  id: "generate-consolidated-report",
  description:
    "Genera el reporte consolidado en Excel con detalle de materiales por centro de gestión y clasificación",
  inputSchema: z.object({
    inventoryRecords: z.array(inventoryRecordSchema),
    detailItems: z.array(detailItemSchema),
    excessRecords: z.array(excessRecordSchema),
    inventoryCount: z.number(),
    excessCount: z.number(),
    detailCount: z.number(),
    weeklyAssignments: z.number(),
    weeklyValorizado: z.number(),
    weekStart: z.string(),
    weekEnd: z.string(),
    assignmentsByDestino: z.array(assignmentDestinoSchema),
    classifications: z.array(classificationSchema),
    totalResources: z.number(),
    classifiedCount: z.number(),
    unclassifiedCount: z.number(),
    inventariableCount: z.number(),
    noInventariableCount: z.number(),
    valorNoInventariable: z.number(),
    valorInventariable: z.number(),
    valorSinClasificar: z.number(),
  }),
  outputSchema: z.object({
    excelBase64: z.string(),
    fileName: z.string(),
    inventoryPivotCount: z.number(),
    excessPivotCount: z.number(),
    detailCount: z.number(),
    weeklyAssignments: z.number(),
    weeklyValorizado: z.number(),
    weekStart: z.string(),
    weekEnd: z.string(),
    assignmentsByDestino: z.array(assignmentDestinoSchema),
    valorNoInventariable: z.number(),
    valorInventariable: z.number(),
    valorSinClasificar: z.number(),
    noInventariableCount: z.number(),
    inventariableCount: z.number(),
    unclassifiedCount: z.number(),
    totalResources: z.number(),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📊 [Paso 3] Generando reporte consolidado...");

    const result = await generateReportTool.execute(
      {
        inventoryRecords: inputData.inventoryRecords,
        excessRecords: inputData.excessRecords,
        detailItems: inputData.detailItems,
        classifications: inputData.classifications,
      },
      { mastra }
    );

    if ("error" in result && result.error) {
      throw new Error(
        `Falló la generación del reporte: ${(result as any).message}`
      );
    }

    logger?.info(
      `✅ [Paso 3] Reporte generado: ${result.fileName} (${result.inventoryPivotCount} inv, ${result.excessPivotCount} exc, ${inputData.detailCount} ítems)`
    );
    return {
      excelBase64: result.excelBase64,
      fileName: result.fileName,
      inventoryPivotCount: result.inventoryPivotCount,
      excessPivotCount: result.excessPivotCount,
      detailCount: inputData.detailCount,
      weeklyAssignments: inputData.weeklyAssignments,
      weeklyValorizado: inputData.weeklyValorizado,
      weekStart: inputData.weekStart,
      weekEnd: inputData.weekEnd,
      assignmentsByDestino: inputData.assignmentsByDestino,
      valorNoInventariable: inputData.valorNoInventariable,
      valorInventariable: inputData.valorInventariable,
      valorSinClasificar: inputData.valorSinClasificar,
      noInventariableCount: inputData.noInventariableCount,
      inventariableCount: inputData.inventariableCount,
      unclassifiedCount: inputData.unclassifiedCount,
      totalResources: inputData.totalResources,
    };
  },
});

const sendEmailStep = createStep({
  id: "send-final-report-email",
  description:
    "Envía el informe consolidado de bodega por correo electrónico con el archivo Excel adjunto",
  inputSchema: z.object({
    excelBase64: z.string(),
    fileName: z.string(),
    inventoryPivotCount: z.number(),
    excessPivotCount: z.number(),
    detailCount: z.number(),
    weeklyAssignments: z.number(),
    weeklyValorizado: z.number(),
    weekStart: z.string(),
    weekEnd: z.string(),
    assignmentsByDestino: z.array(assignmentDestinoSchema),
    valorNoInventariable: z.number(),
    valorInventariable: z.number(),
    valorSinClasificar: z.number(),
    noInventariableCount: z.number(),
    inventariableCount: z.number(),
    unclassifiedCount: z.number(),
    totalResources: z.number(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📧 [Paso 4] Enviando reporte por correo...");

    const result = await sendReportTool.execute(
      {
        excelBase64: inputData.excelBase64,
        fileName: inputData.fileName,
        inventoryPivotCount: inputData.inventoryPivotCount,
        excessPivotCount: inputData.excessPivotCount,
        weeklyAssignments: inputData.weeklyAssignments,
        weeklyValorizado: inputData.weeklyValorizado,
        weekStart: inputData.weekStart,
        weekEnd: inputData.weekEnd,
        assignmentsByDestino: inputData.assignmentsByDestino,
        valorNoInventariable: inputData.valorNoInventariable,
        valorInventariable: inputData.valorInventariable,
        valorSinClasificar: inputData.valorSinClasificar,
        noInventariableCount: inputData.noInventariableCount,
        inventariableCount: inputData.inventariableCount,
        unclassifiedCount: inputData.unclassifiedCount,
        totalResources: inputData.totalResources,
      },
      { mastra }
    );

    if ("error" in result && result.error) {
      throw new Error(`Falló el envío de correo: ${(result as any).message}`);
    }

    logger?.info(
      `✅ [Paso 4] Correo enviado exitosamente. MessageId: ${result.messageId}`
    );
    return {
      success: result.success,
      messageId: result.messageId,
    };
  },
});

export const automationWorkflow = createWorkflow({
  id: "bodega-report-workflow",
  inputSchema: z.object({}) as any,
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.string(),
  }),
})
  .then(scrapeIConstruyeStep as any)
  .then(fetchExcessStep as any)
  .then(fetchAssignmentsStep as any)
  .then(classifyResourcesStep as any)
  .then(generateReportStep as any)
  .then(sendEmailStep as any)
  .commit();
