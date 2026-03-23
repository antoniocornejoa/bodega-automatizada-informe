import { getUncachableGoogleSheetClient } from "../src/utils/googleSheets";
import { sendEmail } from "../src/utils/replitmail";
import ExcelJS from "exceljs";

const SPREADSHEET_ID = "19-LRlC1MWFRxtpjfhSX0KbJPCOO1fu4ebzzh_ZVb1kE";

async function testFlow() {
  console.log("=== Testing Google Sheets Fetch ===");
  const sheets = await getUncachableGoogleSheetClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "Solicitudes!A:K",
  });

  const rows = response.data.values;
  console.log("Total rows:", rows?.length);

  const obraOrigenIdx = 6;
  const colJIdx = 9;
  const colKIdx = 10;

  const excessRecords: { obraOrigen: string; valorExcedente: number }[] = [];
  for (let i = 1; i < (rows?.length || 0); i++) {
    const row = rows![i];
    const obraOrigen = String(row[obraOrigenIdx] || "").trim();
    if (!obraOrigen) continue;

    const valJ = parseFloat(
      String(row[colJIdx] || "0").replace(/[$\s]/g, "").replace(/\./g, "").replace(",", ".")
    ) || 0;
    const valK = parseFloat(
      String(row[colKIdx] || "0").replace(/[$\s]/g, "").replace(/\./g, "").replace(",", ".")
    ) || 0;

    excessRecords.push({ obraOrigen, valorExcedente: valJ * valK });
  }

  console.log("Excess records parsed:", excessRecords.length);

  const pivot = new Map<string, number>();
  for (const rec of excessRecords) {
    pivot.set(rec.obraOrigen, (pivot.get(rec.obraOrigen) || 0) + rec.valorExcedente);
  }

  console.log(`\nExcess Pivot Table (${pivot.size} entries, top 5):`);
  const sorted = Array.from(pivot.entries()).sort((a, b) => b[1] - a[1]);
  for (const [obra, valor] of sorted.slice(0, 5)) {
    console.log(`  ${obra}: $${Math.round(valor).toLocaleString("es-CL")}`);
  }

  console.log("\n=== Testing Excel Generation ===");
  const mockInventory = [
    { centroGestion: sorted[0]?.[0] || "Obra Test", stockValorizado: 1500000 },
    { centroGestion: sorted[1]?.[0] || "Obra Test 2", stockValorizado: 2300000 },
  ];

  const inventoryPivot = new Map<string, number>();
  mockInventory.forEach((r) =>
    inventoryPivot.set(r.centroGestion, (inventoryPivot.get(r.centroGestion) || 0) + r.stockValorizado)
  );

  const allCentros = new Set<string>();
  inventoryPivot.forEach((_, k) => allCentros.add(k));
  pivot.forEach((_, k) => allCentros.add(k));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Informe Consolidado");
  sheet.columns = [
    { header: "Centro de Gestión", key: "centroGestion", width: 35 },
    { header: "Stock Valorizado", key: "stockValorizado", width: 25 },
    { header: "Excedentes Valorizados", key: "excedentesValorizados", width: 25 },
  ];
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E75B6" } };

  for (const centro of Array.from(allCentros).sort()) {
    const row = sheet.addRow({
      centroGestion: centro,
      stockValorizado: inventoryPivot.get(centro) || 0,
      excedentesValorizados: pivot.get(centro) || 0,
    });
    row.getCell("stockValorizado").numFmt = "#.##0";
    row.getCell("excedentesValorizados").numFmt = "#.##0";
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  console.log("Excel generated:", base64.length, "chars (base64)");

  console.log("\n=== Testing Email Send ===");
  const result = await sendEmail({
    subject: "Test - Informe de Bodega",
    text: `Test de informe de bodega con ${pivot.size} obras origen.`,
    attachments: [
      {
        filename: "test_informe_bodega.xlsx",
        content: base64,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        encoding: "base64",
      },
    ],
  });
  console.log("Email sent! MessageId:", result.messageId);
  console.log("Accepted:", result.accepted);

  console.log("\n=== ALL TESTS PASSED ===");
}

testFlow().catch((e) => console.error("Error:", e.message));
