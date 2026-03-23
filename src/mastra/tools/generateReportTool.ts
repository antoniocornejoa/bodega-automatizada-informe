import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import ExcelJS from "exceljs";

export const generateReportTool = createTool({
  id: "generate-bodega-report",
  description:
    "Genera el reporte consolidado de bodega en Excel con tablas dinámicas, detalle de materiales por centro de gestión y hoja de inventario general.",
  inputSchema: z.object({
    inventoryRecords: z.array(
      z.object({
        centroGestion: z.string(),
        stockValorizado: z.number(),
      })
    ),
    excessRecords: z.array(
      z.object({
        obraOrigen: z.string(),
        valorExcedente: z.number(),
      })
    ),
    detailItems: z.array(
      z.object({
        bodega: z.string(),
        codigo: z.string(),
        descripcion: z.string(),
        centroGestion: z.string(),
        unidad: z.string(),
        stock: z.number(),
        ppp: z.number(),
        stockValorizado: z.number(),
      })
    ),
    classifications: z.array(
      z.object({
        codigo: z.string(),
        descripcion: z.string(),
        unidad: z.string(),
        inventariable: z.string(),
        valorTotal: z.number(),
      })
    ),
  }),
  outputSchema: z.object({
    excelBase64: z.string(),
    fileName: z.string(),
    inventoryPivotCount: z.number(),
    excessPivotCount: z.number(),
  }),
  execute: async (inputData, context) => {
    const mastra = context?.mastra;
    const logger = mastra?.getLogger();
    logger?.info("📊 [generateReport] Iniciando generación de reporte...");

    const { inventoryRecords, excessRecords, detailItems, classifications } = inputData;

    logger?.info(
      `📋 [generateReport] Procesando ${inventoryRecords.length} registros inventario, ${excessRecords.length} excedentes, ${detailItems.length} ítems detallados`
    );

    const inventoryPivot = new Map<string, number>();
    for (const record of inventoryRecords) {
      const current = inventoryPivot.get(record.centroGestion) || 0;
      inventoryPivot.set(record.centroGestion, current + record.stockValorizado);
    }

    const excessPivot = new Map<string, number>();
    for (const record of excessRecords) {
      const current = excessPivot.get(record.obraOrigen) || 0;
      excessPivot.set(record.obraOrigen, current + record.valorExcedente);
    }

    const allCentros = new Set<string>();
    inventoryPivot.forEach((_, key) => allCentros.add(key));
    excessPivot.forEach((_, key) => allCentros.add(key));
    const sortedCentros = Array.from(allCentros).sort();

    const workbook = new ExcelJS.Workbook();

    const headerStyle = {
      font: { bold: true, color: { argb: "FFFFFFFF" } } as Partial<ExcelJS.Font>,
      fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF2E75B6" } },
      alignment: { horizontal: "center" as const, vertical: "middle" as const },
    };

    const applyHeaderStyle = (row: ExcelJS.Row) => {
      row.font = headerStyle.font as ExcelJS.Font;
      row.fill = headerStyle.fill;
      row.alignment = headerStyle.alignment;
      row.height = 25;
    };

    const applyBorders = (sheet: ExcelJS.Worksheet) => {
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
      });
    };

    const consolidatedSheet = workbook.addWorksheet("Informe Consolidado");
    consolidatedSheet.columns = [
      { header: "Centro de Gestión", key: "centroGestion", width: 45 },
      { header: "Stock Valorizado", key: "stockValorizado", width: 22 },
      { header: "Excedentes Valorizados", key: "excedentesValorizados", width: 22 },
    ];
    applyHeaderStyle(consolidatedSheet.getRow(1));

    for (const centro of sortedCentros) {
      const row = consolidatedSheet.addRow({
        centroGestion: centro,
        stockValorizado: inventoryPivot.get(centro) || 0,
        excedentesValorizados: excessPivot.get(centro) || 0,
      });
      row.getCell("stockValorizado").numFmt = "#,##0";
      row.getCell("excedentesValorizados").numFmt = "#,##0";
      row.getCell("stockValorizado").alignment = { horizontal: "right" };
      row.getCell("excedentesValorizados").alignment = { horizontal: "right" };
    }

    const totalRow = consolidatedSheet.addRow({
      centroGestion: "TOTAL",
      stockValorizado: Array.from(inventoryPivot.values()).reduce((a, b) => a + b, 0),
      excedentesValorizados: Array.from(excessPivot.values()).reduce((a, b) => a + b, 0),
    });
    totalRow.font = { bold: true };
    totalRow.getCell("stockValorizado").numFmt = "#,##0";
    totalRow.getCell("excedentesValorizados").numFmt = "#,##0";
    totalRow.getCell("stockValorizado").alignment = { horizontal: "right" };
    totalRow.getCell("excedentesValorizados").alignment = { horizontal: "right" };
    applyBorders(consolidatedSheet);

    const inventorySheet = workbook.addWorksheet("Inventario por Centro");
    inventorySheet.columns = [
      { header: "Centro de Gestión", key: "centroGestion", width: 45 },
      { header: "Stock Valorizado", key: "stockValorizado", width: 22 },
    ];
    applyHeaderStyle(inventorySheet.getRow(1));

    for (const [centro, stock] of Array.from(inventoryPivot.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const row = inventorySheet.addRow({ centroGestion: centro, stockValorizado: stock });
      row.getCell("stockValorizado").numFmt = "#,##0";
      row.getCell("stockValorizado").alignment = { horizontal: "right" };
    }

    const invTotalRow = inventorySheet.addRow({
      centroGestion: "TOTAL",
      stockValorizado: Array.from(inventoryPivot.values()).reduce((a, b) => a + b, 0),
    });
    invTotalRow.font = { bold: true };
    invTotalRow.getCell("stockValorizado").numFmt = "#,##0";
    applyBorders(inventorySheet);

    const excessSheet = workbook.addWorksheet("Excedentes por Obra");
    excessSheet.columns = [
      { header: "Obra Origen", key: "obraOrigen", width: 45 },
      { header: "Valor Excedentes", key: "valorExcedente", width: 22 },
    ];
    applyHeaderStyle(excessSheet.getRow(1));

    for (const [obra, valor] of Array.from(excessPivot.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const row = excessSheet.addRow({ obraOrigen: obra, valorExcedente: valor });
      row.getCell("valorExcedente").numFmt = "#,##0";
      row.getCell("valorExcedente").alignment = { horizontal: "right" };
    }

    const exTotalRow = excessSheet.addRow({
      obraOrigen: "TOTAL",
      valorExcedente: Array.from(excessPivot.values()).reduce((a, b) => a + b, 0),
    });
    exTotalRow.font = { bold: true };
    exTotalRow.getCell("valorExcedente").numFmt = "#,##0";
    applyBorders(excessSheet);

    if (detailItems.length > 0) {
      const detailSheet = workbook.addWorksheet("Detalle por Centro");
      detailSheet.columns = [
        { header: "Centro de Gestión", key: "centroGestion", width: 45 },
        { header: "Código", key: "codigo", width: 20 },
        { header: "Descripción", key: "descripcion", width: 40 },
        { header: "Bodega", key: "bodega", width: 30 },
        { header: "Unidad", key: "unidad", width: 12 },
        { header: "Stock", key: "stock", width: 12 },
        { header: "PPP", key: "ppp", width: 15 },
        { header: "Stock Valorizado", key: "stockValorizado", width: 20 },
      ];
      applyHeaderStyle(detailSheet.getRow(1));

      const itemsByCentro = new Map<string, typeof detailItems>();
      for (const item of detailItems) {
        const key = item.centroGestion;
        if (!itemsByCentro.has(key)) itemsByCentro.set(key, []);
        itemsByCentro.get(key)!.push(item);
      }

      const sortedCentroKeys = Array.from(itemsByCentro.keys()).sort();

      for (const centro of sortedCentroKeys) {
        const items = itemsByCentro.get(centro)!;
        items.sort((a, b) => a.codigo.localeCompare(b.codigo));

        for (const item of items) {
          const row = detailSheet.addRow({
            centroGestion: item.centroGestion,
            codigo: item.codigo,
            descripcion: item.descripcion,
            bodega: item.bodega,
            unidad: item.unidad,
            stock: item.stock,
            ppp: item.ppp,
            stockValorizado: item.stockValorizado,
          });
          row.getCell("stock").numFmt = "#,##0.00";
          row.getCell("ppp").numFmt = "#,##0.00";
          row.getCell("stockValorizado").numFmt = "#,##0";
          row.getCell("stock").alignment = { horizontal: "right" };
          row.getCell("ppp").alignment = { horizontal: "right" };
          row.getCell("stockValorizado").alignment = { horizontal: "right" };
        }

        const subtotalRow = detailSheet.addRow({
          centroGestion: `Subtotal ${centro}`,
          codigo: "",
          descripcion: "",
          bodega: "",
          unidad: "",
          stock: items.reduce((a, b) => a + b.stock, 0),
          ppp: "",
          stockValorizado: items.reduce((a, b) => a + b.stockValorizado, 0),
        });
        subtotalRow.font = { bold: true };
        subtotalRow.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE8F0FE" },
        };
        subtotalRow.getCell("stock").numFmt = "#,##0.00";
        subtotalRow.getCell("stockValorizado").numFmt = "#,##0";
      }

      const grandTotalRow = detailSheet.addRow({
        centroGestion: "TOTAL GENERAL",
        codigo: "",
        descripcion: "",
        bodega: "",
        unidad: "",
        stock: detailItems.reduce((a, b) => a + b.stock, 0),
        ppp: "",
        stockValorizado: detailItems.reduce((a, b) => a + b.stockValorizado, 0),
      });
      grandTotalRow.font = { bold: true };
      grandTotalRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2E75B6" },
      };
      grandTotalRow.getCell("centroGestion").font = { bold: true, color: { argb: "FFFFFFFF" } };
      grandTotalRow.getCell("stock").numFmt = "#,##0.00";
      grandTotalRow.getCell("stockValorizado").numFmt = "#,##0";
      applyBorders(detailSheet);

      detailSheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: 8 },
      };

      logger?.info(
        `📊 [generateReport] Hoja 'Detalle por Centro' creada con ${detailItems.length} ítems en ${sortedCentroKeys.length} centros`
      );

      const generalSheet = workbook.addWorksheet("Inventario General");
      generalSheet.columns = [
        { header: "Código", key: "codigo", width: 20 },
        { header: "Descripción", key: "descripcion", width: 40 },
        { header: "Unidad", key: "unidad", width: 12 },
        { header: "Stock Total", key: "stockTotal", width: 15 },
        { header: "Valor Total", key: "valorTotal", width: 20 },
        { header: "Centros", key: "centros", width: 15 },
      ];
      applyHeaderStyle(generalSheet.getRow(1));

      const byCode = new Map<string, { descripcion: string; unidad: string; stockTotal: number; valorTotal: number; centros: Set<string> }>();

      for (const item of detailItems) {
        const existing = byCode.get(item.codigo);
        if (existing) {
          existing.stockTotal += item.stock;
          existing.valorTotal += item.stockValorizado;
          existing.centros.add(item.centroGestion);
        } else {
          byCode.set(item.codigo, {
            descripcion: item.descripcion,
            unidad: item.unidad,
            stockTotal: item.stock,
            valorTotal: item.stockValorizado,
            centros: new Set([item.centroGestion]),
          });
        }
      }

      const sortedCodes = Array.from(byCode.entries()).sort((a, b) => b[1].valorTotal - a[1].valorTotal);

      for (const [codigo, data] of sortedCodes) {
        const row = generalSheet.addRow({
          codigo,
          descripcion: data.descripcion,
          unidad: data.unidad,
          stockTotal: data.stockTotal,
          valorTotal: data.valorTotal,
          centros: data.centros.size,
        });
        row.getCell("stockTotal").numFmt = "#,##0.00";
        row.getCell("valorTotal").numFmt = "#,##0";
        row.getCell("stockTotal").alignment = { horizontal: "right" };
        row.getCell("valorTotal").alignment = { horizontal: "right" };
        row.getCell("centros").alignment = { horizontal: "center" };
      }

      const genTotalRow = generalSheet.addRow({
        codigo: "TOTAL",
        descripcion: `${sortedCodes.length} materiales únicos`,
        unidad: "",
        stockTotal: Array.from(byCode.values()).reduce((a, b) => a + b.stockTotal, 0),
        valorTotal: Array.from(byCode.values()).reduce((a, b) => a + b.valorTotal, 0),
        centros: "",
      });
      genTotalRow.font = { bold: true };
      genTotalRow.getCell("stockTotal").numFmt = "#,##0.00";
      genTotalRow.getCell("valorTotal").numFmt = "#,##0";
      applyBorders(generalSheet);

      generalSheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: 6 },
      };

      logger?.info(
        `📊 [generateReport] Hoja 'Inventario General' creada con ${sortedCodes.length} materiales únicos`
      );
    }

    if (classifications && classifications.length > 0) {
      const classSheet = workbook.addWorksheet("Clasificación Recursos");
      classSheet.columns = [
        { header: "Código", key: "codigo", width: 20 },
        { header: "Descripción", key: "descripcion", width: 40 },
        { header: "Unidad", key: "unidad", width: 12 },
        { header: "Inventariable", key: "inventariable", width: 18 },
        { header: "Valor Total", key: "valorTotal", width: 20 },
      ];
      applyHeaderStyle(classSheet.getRow(1));

      for (const item of classifications) {
        const row = classSheet.addRow({
          codigo: item.codigo,
          descripcion: item.descripcion,
          unidad: item.unidad,
          inventariable: item.inventariable,
          valorTotal: item.valorTotal,
        });
        row.getCell("valorTotal").numFmt = "#,##0";
        row.getCell("valorTotal").alignment = { horizontal: "right" };
        row.getCell("inventariable").alignment = { horizontal: "center" };

        if (item.inventariable === "NO") {
          row.getCell("inventariable").font = { bold: true, color: { argb: "FFE65100" } };
          row.getCell("inventariable").fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFF3E0" },
          };
        } else if (item.inventariable === "SI") {
          row.getCell("inventariable").font = { bold: true, color: { argb: "FF2E7D32" } };
        } else {
          row.getCell("inventariable").font = { color: { argb: "FF9E9E9E" } };
        }
      }

      const noInvTotal = classifications.filter(c => c.inventariable === "NO").reduce((a, b) => a + b.valorTotal, 0);
      const siInvTotal = classifications.filter(c => c.inventariable === "SI").reduce((a, b) => a + b.valorTotal, 0);
      const sinClasTotal = classifications.filter(c => c.inventariable === "SIN CLASIFICAR").reduce((a, b) => a + b.valorTotal, 0);

      classSheet.addRow({});
      const summaryHeader = classSheet.addRow({ codigo: "RESUMEN", descripcion: "", unidad: "", inventariable: "", valorTotal: "" });
      summaryHeader.font = { bold: true };

      const siRow = classSheet.addRow({ codigo: "", descripcion: "Inventariable (SI)", unidad: "", inventariable: "SI", valorTotal: siInvTotal });
      siRow.getCell("valorTotal").numFmt = "#,##0";

      const noRow = classSheet.addRow({ codigo: "", descripcion: "No Inventariable (NO)", unidad: "", inventariable: "NO", valorTotal: noInvTotal });
      noRow.font = { bold: true, color: { argb: "FFE65100" } };
      noRow.getCell("valorTotal").numFmt = "#,##0";

      const sinRow = classSheet.addRow({ codigo: "", descripcion: "Sin Clasificar", unidad: "", inventariable: "", valorTotal: sinClasTotal });
      sinRow.getCell("valorTotal").numFmt = "#,##0";
      sinRow.font = { color: { argb: "FF9E9E9E" } };

      applyBorders(classSheet);
      classSheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: 5 },
      };

      logger?.info(
        `📊 [generateReport] Hoja 'Clasificación Recursos' creada con ${classifications.length} materiales`
      );
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const excelBase64 = Buffer.from(buffer).toString("base64");

    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const fileName = `Informe_Bodega_${dateStr}.xlsx`;

    logger?.info(
      `✅ [generateReport] Reporte generado: ${fileName}`
    );

    return {
      excelBase64,
      fileName,
      inventoryPivotCount: inventoryPivot.size,
      excessPivotCount: excessPivot.size,
    };
  },
});
