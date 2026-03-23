import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { sendGmail } from "../../utils/gmail";

export const sendReportTool = createTool({
  id: "send-bodega-report-email",
  description:
    "Envía el informe de bodega consolidado por correo electrónico con el archivo Excel adjunto vía Gmail, incluyendo resumen de asignaciones semanales y materiales no inventariables",
  inputSchema: z.object({
    excelBase64: z.string(),
    fileName: z.string(),
    inventoryPivotCount: z.number(),
    excessPivotCount: z.number(),
    weeklyAssignments: z.number(),
    weeklyValorizado: z.number(),
    weekStart: z.string(),
    weekEnd: z.string(),
    assignmentsByDestino: z.array(
      z.object({
        destino: z.string(),
        count: z.number(),
        valor: z.number(),
      })
    ),
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
  execute: async (inputData, context) => {
    const mastra = context?.mastra;
    const logger = mastra?.getLogger();
    logger?.info("📧 [sendReport] Preparing to send report email via Gmail...");

    const {
      excelBase64,
      fileName,
      inventoryPivotCount,
      excessPivotCount,
      weeklyAssignments,
      weeklyValorizado,
      weekStart,
      weekEnd,
      assignmentsByDestino,
      valorNoInventariable,
      valorInventariable,
      valorSinClasificar,
      noInventariableCount,
      inventariableCount,
      unclassifiedCount,
      totalResources,
    } = inputData;

    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

    const fmtNum = (n: number) =>
      Math.round(n)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ".");

    let assignmentsRows = "";
    if (assignmentsByDestino && assignmentsByDestino.length > 0) {
      assignmentsRows = assignmentsByDestino
        .map(
          (a) => `
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 6px 8px;">${a.destino}</td>
            <td style="padding: 6px 8px; text-align: center;">${a.count}</td>
            <td style="padding: 6px 8px; text-align: right;">$${fmtNum(a.valor)}</td>
          </tr>`
        )
        .join("");
    }

    const assignmentsSection =
      weeklyAssignments > 0
        ? `
        <h3 style="color: #2E75B6;">Asignaciones de Excedentes de la Semana (${weekStart} - ${weekEnd})</h3>
        <table style="border-collapse: collapse; width: 100%; margin: 10px 0;">
          <tr style="background-color: #2E75B6; color: white;">
            <th style="padding: 8px; text-align: left;">Concepto</th>
            <th style="padding: 8px; text-align: center;">Cantidad</th>
            <th style="padding: 8px; text-align: right;">Valor</th>
          </tr>
          <tr style="border-bottom: 1px solid #ddd; font-weight: bold; background-color: #E8F0FE;">
            <td style="padding: 8px;">Total Asignaciones Semana</td>
            <td style="padding: 8px; text-align: center;">${weeklyAssignments}</td>
            <td style="padding: 8px; text-align: right;">$${fmtNum(weeklyValorizado)}</td>
          </tr>
        </table>
        ${
          assignmentsByDestino.length > 0
            ? `
        <h4 style="color: #2E75B6;">Detalle por Destino</h4>
        <table style="border-collapse: collapse; width: 100%; margin: 10px 0;">
          <tr style="background-color: #2E75B6; color: white;">
            <th style="padding: 8px; text-align: left;">Destino</th>
            <th style="padding: 8px; text-align: center;">Items</th>
            <th style="padding: 8px; text-align: right;">Valor</th>
          </tr>
          ${assignmentsRows}
        </table>`
            : ""
        }`
        : `
        <h3 style="color: #2E75B6;">Asignaciones de Excedentes de la Semana (${weekStart} - ${weekEnd})</h3>
        <p>No se registraron asignaciones de excedentes esta semana.</p>`;

    const totalInventario = valorInventariable + valorNoInventariable + valorSinClasificar;

    const classificationSection = `
        <h3 style="color: #2E75B6;">Clasificación de Inventario</h3>
        <table style="border-collapse: collapse; width: 100%; margin: 10px 0;">
          <tr style="background-color: #2E75B6; color: white;">
            <th style="padding: 8px; text-align: left;">Clasificación</th>
            <th style="padding: 8px; text-align: center;">Recursos</th>
            <th style="padding: 8px; text-align: right;">Monto</th>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px;">Inventariable</td>
            <td style="padding: 8px; text-align: center;">${inventariableCount}</td>
            <td style="padding: 8px; text-align: right;">$${fmtNum(valorInventariable)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd; background-color: #FFF3E0;">
            <td style="padding: 8px; font-weight: bold; color: #E65100;">No Inventariable</td>
            <td style="padding: 8px; text-align: center; font-weight: bold; color: #E65100;">${noInventariableCount}</td>
            <td style="padding: 8px; text-align: right; font-weight: bold; color: #E65100;">$${fmtNum(valorNoInventariable)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px; color: #666;">Sin Clasificar</td>
            <td style="padding: 8px; text-align: center; color: #666;">${unclassifiedCount}</td>
            <td style="padding: 8px; text-align: right; color: #666;">$${fmtNum(valorSinClasificar)}</td>
          </tr>
          <tr style="font-weight: bold; background-color: #E8F0FE;">
            <td style="padding: 8px;">Total Inventario</td>
            <td style="padding: 8px; text-align: center;">${totalResources}</td>
            <td style="padding: 8px; text-align: right;">$${fmtNum(totalInventario)}</td>
          </tr>
        </table>
        ${valorNoInventariable > 0 ? `
        <p style="background-color: #FFF3E0; padding: 12px; border-left: 4px solid #E65100; margin: 10px 0;">
          <strong>Nota:</strong> El monto de materiales <strong>no inventariables</strong> que afecta el valor total del inventario es de 
          <strong style="color: #E65100;">$${fmtNum(valorNoInventariable)}</strong> 
          (${noInventariableCount} recursos).
        </p>` : ""}
        ${unclassifiedCount > 0 ? `
        <p style="background-color: #F5F5F5; padding: 12px; border-left: 4px solid #9E9E9E; margin: 10px 0;">
          <strong>Pendiente:</strong> Hay ${unclassifiedCount} recursos sin clasificar por un monto de $${fmtNum(valorSinClasificar)}. 
          Favor completar la clasificación en la hoja "Clasificación Recursos" del Google Sheets.
        </p>` : ""}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
        <h2 style="color: #2E75B6;">Informe Semanal de Bodega</h2>
        <p>Estimado/a,</p>
        <p>Se adjunta el informe consolidado de bodega correspondiente al <strong>${dateStr}</strong>.</p>
        
        <h3 style="color: #2E75B6;">Resumen del Informe</h3>
        <table style="border-collapse: collapse; width: 100%; margin: 10px 0;">
          <tr style="background-color: #2E75B6; color: white;">
            <th style="padding: 8px; text-align: left;">Concepto</th>
            <th style="padding: 8px; text-align: center;">Cantidad</th>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px;">Centros de Gestión con inventario</td>
            <td style="padding: 8px; text-align: center;">${inventoryPivotCount}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px;">Obras con excedentes</td>
            <td style="padding: 8px; text-align: center;">${excessPivotCount}</td>
          </tr>
        </table>
        
        ${classificationSection}
        
        ${assignmentsSection}
        
        <h3 style="color: #2E75B6;">Contenido del archivo adjunto</h3>
        <ul>
          <li><strong>Informe Consolidado:</strong> Stock valorizado + excedentes por Centro de Gestión</li>
          <li><strong>Inventario por Centro:</strong> Detalle de stock valorizado por Centro de Gestión</li>
          <li><strong>Excedentes por Obra:</strong> Detalle de excedentes valorizados por Obra Origen</li>
          <li><strong>Detalle por Centro:</strong> Todos los materiales con código, descripción, stock, PPP y valorizado, agrupados por Centro de Gestión</li>
          <li><strong>Inventario General:</strong> Materiales únicos agrupados por código, ordenados por valor descendente</li>
          <li><strong>Clasificación Recursos:</strong> Listado de materiales con su clasificación inventariable/no inventariable</li>
        </ul>
        
        <p style="color: #666; font-size: 12px; margin-top: 20px;">
          Este informe fue generado automáticamente.
        </p>
      </div>
    `;

    try {
      const result = await sendGmail({
        to: "mleivac@cindependencia.cl, claudio.contreras@cindependencia.cl",
        cc: "acornejo@cindependencia.cl",
        subject: `Informe de Bodega - ${dateStr}`,
        html: htmlContent,
        attachments: [
          {
            filename: fileName,
            content: excelBase64,
            contentType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        ],
      });

      logger?.info(
        `✅ [sendReport] Email sent via Gmail successfully. MessageId: ${result.messageId}`
      );

      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (error) {
      logger?.error(
        `❌ [sendReport] Failed to send email via Gmail: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  },
});
