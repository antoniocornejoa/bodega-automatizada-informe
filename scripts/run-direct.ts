/**
 * run-direct.ts
 *
 * Ejecuta el pipeline de bodega directamente desde TypeScript,
 * invocando cada herramienta (tool) en secuencia sin Mastra ni Inngest.
 *
 * Ventajas vs compilar con Mastra:
 *  - No depende del bundle minificado (esbuild mangling)
 *  - Funciona con `npx tsx scripts/run-direct.ts`
 *  - No requiere paso de build
 *
 * Uso: npx tsx scripts/run-direct.ts
 *
 * Lógica de ejecución:
 *  - Scraping + dashboard: TODOS los días (actualiza la web)
 *  - Email con Excel:      Solo los LUNES (o si FORCE_EMAIL=true)
 */

// IMPORTANTE: dotenv debe ser el primer import para cargar .env antes que todo
import 'dotenv/config';

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { scrapeIConstruyeTool }  from '../src/mastra/tools/scrapeIConstruyeTool.js';
import { fetchExcessTool }       from '../src/mastra/tools/fetchExcessTool.js';
import { fetchAssignmentsTool }  from '../src/mastra/tools/fetchAssignmentsTool.js';
import { classifyResourcesTool } from '../src/mastra/tools/classifyResourcesTool.js';
import { generateReportTool }    from '../src/mastra/tools/generateReportTool.js';
import { sendReportTool }        from '../src/mastra/tools/sendReportTool.js';
import { generateDashboardHTML } from '../src/utils/generateDashboard.js';

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------
const isDryRun   = process.env.DRY_RUN === 'true';
const forceEmail = process.env.FORCE_EMAIL === 'true';

// Email solo los lunes (getDay() === 1) salvo que se fuerce con FORCE_EMAIL=true
const todayIsMonday   = new Date().getDay() === 1;
const shouldSendEmail = !isDryRun && (todayIsMonday || forceEmail);

console.log('🚀 Iniciando Reporte de Bodega (ejecución directa)...');
console.log(`📅 Fecha: ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}`);
console.log(`🔧 Modo: ${isDryRun ? 'PRUEBA (no envía email)' : 'PRODUCCIÓN'}`);
console.log(`📧 Email: ${shouldSendEmail ? 'SÍ se enviará (es lunes o FORCE_EMAIL=true)' : 'NO se enviará (no es lunes)'}`);

// ---------------------------------------------------------------------------
// Contexto mínimo de Mastra — solo necesitamos el logger
// Las herramientas solo usan mastra?.getLogger(), nada más.
// ---------------------------------------------------------------------------
const mockMastra = {
  getLogger: () => ({
    info:  (msg: string, args?: Record<string, unknown>) => console.log(`[INFO]  ${msg}`, args ?? ''),
    warn:  (msg: string, args?: Record<string, unknown>) => console.warn(`[WARN]  ${msg}`, args ?? ''),
    error: (msg: string, args?: Record<string, unknown>) => console.error(`[ERROR] ${msg}`, args ?? ''),
    debug: (msg: string, args?: Record<string, unknown>) => console.log(`[DEBUG] ${msg}`, args ?? ''),
  }),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { mastra: mockMastra as any };

// ---------------------------------------------------------------------------
// Paso 1: Scraping de inventario iConstruye
// ---------------------------------------------------------------------------
console.log('\n═══ Paso 1/5: Scraping iConstruye ═══');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const step1 = await (scrapeIConstruyeTool as any).execute({}, ctx) as {
  inventoryRecords: { centroGestion: string; stockValorizado: number }[];
  detailItems: {
    bodega: string; codigo: string; descripcion: string;
    centroGestion: string; unidad: string; stock: number;
    ppp: number; stockValorizado: number;
  }[];
  recordCount: number;
  detailCount: number;
  error?: boolean;
  message?: string;
};

if (step1.error) {
  throw new Error(`Falló el scraping de iConstruye: ${step1.message}`);
}
console.log(`✅ [Paso 1] ${step1.recordCount} centros, ${step1.detailCount} ítems detallados`);

// ---------------------------------------------------------------------------
// Paso 2: Excedentes desde Google Sheets
// ---------------------------------------------------------------------------
console.log('\n═══ Paso 2/5: Excedentes Google Sheets ═══');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const step2 = await (fetchExcessTool as any).execute({}, ctx) as {
  excessRecords: { obraOrigen: string; valorExcedente: number }[];
  recordCount: number;
  error?: boolean;
  message?: string;
};

if (step2.error) {
  throw new Error(`Falló obtención de excedentes: ${step2.message}`);
}
console.log(`✅ [Paso 2] ${step2.recordCount} registros de excedentes`);

// ---------------------------------------------------------------------------
// Paso 2.5: Asignaciones semanales
// ---------------------------------------------------------------------------
console.log('\n═══ Paso 2.5/5: Asignaciones semanales ═══');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const step3 = await (fetchAssignmentsTool as any).execute({}, ctx) as {
  totalAssignments: number;
  totalValorizado: number;
  weekStart: string;
  weekEnd: string;
  byDestino: { destino: string; count: number; valor: number }[];
  error?: boolean;
  message?: string;
};

if (step3.error) {
  throw new Error(`Falló obtención de asignaciones: ${step3.message}`);
}
console.log(`✅ [Paso 2.5] ${step3.totalAssignments} asignaciones, valor: $${Math.round(step3.totalValorizado).toLocaleString('es-CL')}`);

// ---------------------------------------------------------------------------
// Paso 2.7: Clasificación de recursos
// ---------------------------------------------------------------------------
console.log('\n═══ Paso 2.7/5: Clasificación de recursos ═══');

const classifyInput = step1.detailItems.map(item => ({
  codigo: item.codigo,
  descripcion: item.descripcion,
  unidad: item.unidad,
  stockValorizado: item.stockValorizado,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const step4 = await (classifyResourcesTool as any).execute({ detailItems: classifyInput }, ctx) as {
  classifications: {
    codigo: string; descripcion: string; unidad: string;
    inventariable: string; valorTotal: number;
  }[];
  totalResources: number;
  classifiedCount: number;
  unclassifiedCount: number;
  inventariableCount: number;
  noInventariableCount: number;
  valorNoInventariable: number;
  valorInventariable: number;
  valorSinClasificar: number;
  error?: boolean;
  message?: string;
};

if (step4.error) {
  throw new Error(`Falló clasificación de recursos: ${step4.message}`);
}
console.log(`✅ [Paso 2.7] SI: ${step4.inventariableCount}, NO: ${step4.noInventariableCount}, Sin clasificar: ${step4.unclassifiedCount}`);

// ---------------------------------------------------------------------------
// Paso 3: Generar reporte Excel
// ---------------------------------------------------------------------------
console.log('\n═══ Paso 3/5: Generando reporte Excel ═══');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const step5 = await (generateReportTool as any).execute({
  inventoryRecords: step1.inventoryRecords,
  excessRecords:    step2.excessRecords,
  detailItems:      step1.detailItems,
  classifications:  step4.classifications,
}, ctx) as {
  excelBase64: string;
  fileName: string;
  inventoryPivotCount: number;
  excessPivotCount: number;
  error?: boolean;
  message?: string;
};

if (step5.error) {
  throw new Error(`Falló generación del reporte: ${step5.message}`);
}
console.log(`✅ [Paso 3] Reporte generado: ${step5.fileName}`);

// ---------------------------------------------------------------------------
// Paso 3.5: Generar dashboard web (dist/index.html) — se ejecuta SIEMPRE
// ---------------------------------------------------------------------------
console.log('\n═══ Paso 3.5/5: Generando dashboard web ═══');

const dashboardHTML = generateDashboardHTML({
  inventoryRecords:     step1.inventoryRecords,
  excessRecords:        step2.excessRecords,
  detailItems:          step1.detailItems,
  classifications:      step4.classifications,
  weeklyAssignments:    step3.totalAssignments,
  weeklyValorizado:     step3.totalValorizado,
  weekStart:            step3.weekStart,
  weekEnd:              step3.weekEnd,
  assignmentsByDestino: step3.byDestino,
  valorNoInventariable: step4.valorNoInventariable,
  valorInventariable:   step4.valorInventariable,
  valorSinClasificar:   step4.valorSinClasificar,
  noInventariableCount: step4.noInventariableCount,
  inventariableCount:   step4.inventariableCount,
  unclassifiedCount:    step4.unclassifiedCount,
  totalResources:       step4.totalResources,
  inventoryPivotCount:  step5.inventoryPivotCount,
  excessPivotCount:     step5.excessPivotCount,
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir   = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

const dashboardPath = path.join(distDir, 'index.html');
fs.writeFileSync(dashboardPath, dashboardHTML, 'utf-8');
console.log(`✅ [Paso 3.5] Dashboard generado: dist/index.html (${Math.round(dashboardHTML.length / 1024)} KB)`);

// ---------------------------------------------------------------------------
// Paso 4: Enviar email — SOLO los lunes (o si FORCE_EMAIL=true)
// ---------------------------------------------------------------------------
if (!shouldSendEmail) {
  const reason = isDryRun ? 'DRY_RUN=true' : 'no es lunes';
  console.log(`\n═══ Paso 4/5: Email (OMITIDO — ${reason}) ═══`);
  console.log('📧 Se habría enviado el archivo:', step5.fileName);
  console.log('   Inventario por centros:', step5.inventoryPivotCount);
  console.log('   Excedentes por obra:   ', step5.excessPivotCount);
  console.log('   Asignaciones semana:   ', step3.totalAssignments);
} else {
  console.log('\n═══ Paso 4/5: Enviando reporte por correo (es lunes) ═══');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const step6 = await (sendReportTool as any).execute({
    excelBase64:          step5.excelBase64,
    fileName:             step5.fileName,
    inventoryPivotCount:  step5.inventoryPivotCount,
    excessPivotCount:     step5.excessPivotCount,
    weeklyAssignments:    step3.totalAssignments,
    weeklyValorizado:     step3.totalValorizado,
    weekStart:            step3.weekStart,
    weekEnd:              step3.weekEnd,
    assignmentsByDestino: step3.byDestino,
    valorNoInventariable: step4.valorNoInventariable,
    valorInventariable:   step4.valorInventariable,
    valorSinClasificar:   step4.valorSinClasificar,
    noInventariableCount: step4.noInventariableCount,
    inventariableCount:   step4.inventariableCount,
    unclassifiedCount:    step4.unclassifiedCount,
    totalResources:       step4.totalResources,
  }, ctx) as { success: boolean; messageId: string; error?: boolean; message?: string };

  if (step6.error) {
    throw new Error(`Falló el envío de correo: ${step6.message}`);
  }
  console.log(`✅ [Paso 4] Email enviado exitosamente. MessageId: ${step6.messageId}`);
}

console.log('\n✅ ¡Reporte de bodega completado exitosamente!');
console.log(`📅 Finalizado: ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}`);
