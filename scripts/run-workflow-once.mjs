/**
 * run-workflow-once.mjs
 *
 * Script para ejecutar el workflow de bodega una vez de forma directa,
 * sin necesidad de tener el servidor Mastra + Inngest corriendo.
 *
 * Usado por GitHub Actions para el cron semanal gratuito.
 *
 * Uso: node scripts/run-workflow-once.mjs
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🚀 Iniciando Reporte Semanal de Bodega...');
console.log(`📅 Fecha: ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}`);
console.log(`🔧 Modo: ${process.env.DRY_RUN === 'true' ? 'PRUEBA (no envía email)' : 'PRODUCCIÓN'}`);

try {
  // Importar el módulo compilado de Mastra
  const mastraModule = await import('../.mastra/output/index.mjs');
  
  // Debug: mostrar todos los exports disponibles
  const exportKeys = Object.keys(mastraModule);
  console.log('📦 Exports del módulo compilado:', exportKeys.join(', '));

  // Intentar obtener el workflow por su nombre exportado
  const { automationWorkflow } = mastraModule;
  
  if (!automationWorkflow) {
    console.error('❌ automationWorkflow no encontrado. Buscando alternativas...');
    // Buscar cualquier objeto con método execute o createRun
    for (const key of exportKeys) {
      const val = mastraModule[key];
      if (val && (typeof val.execute === 'function' || typeof val.createRun === 'function')) {
        console.log(`✅ Encontrado workflow candidato: ${key}`);
      }
    }
    process.exit(1);
  }

  console.log('✅ automationWorkflow encontrado');
  console.log('📋 Métodos disponibles:', Object.getOwnPropertyNames(Object.getPrototypeOf(automationWorkflow)).join(', '));

  // Intentar ejecutar según API de Mastra
  let result;
  if (typeof automationWorkflow.execute === 'function') {
    // API v0.x
    console.log('🔄 Usando API execute() (v0.x)...');
    result = await automationWorkflow.execute({
      triggerData: {
        scheduledAt: new Date().toISOString(),
        triggeredBy: 'github-actions-cron',
      }
    });
  } else if (typeof automationWorkflow.createRun === 'function') {
    // API v1.x
    console.log('🔄 Usando API createRun() (v1.x)...');
    const run = automationWorkflow.createRun();
    result = await run.start({
      triggerData: {
        scheduledAt: new Date().toISOString(),
        triggeredBy: 'github-actions-cron',
      }
    });
  } else {
    console.error('❌ No se encontró método execute() ni createRun() en el workflow');
    console.error('Métodos disponibles:', Object.keys(automationWorkflow));
    process.exit(1);
  }

  console.log('✅ Reporte completado exitosamente');
  console.log('📊 Resultado:', JSON.stringify(result, null, 2));
  process.exit(0);

} catch (error) {
  console.error('❌ Error al ejecutar el reporte:', error);
  process.exit(1);
}
