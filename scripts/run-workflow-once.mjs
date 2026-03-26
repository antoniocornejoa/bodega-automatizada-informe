/**
 * run-workflow-once.mjs
 *
 * Script para ejecutar el workflow de bodega una vez de forma directa.
 * Usado por GitHub Actions para el cron semanal gratuito.
 *
 * Uso: node scripts/run-workflow-once.mjs
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🚀 Iniciando Reporte Semanal de Bodega...');
console.log(`📅 Fecha: ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}`);
console.log(`🔧 Modo: ${process.env.DRY_RUN === 'true' ? 'PRUEBA (no envía email)' : 'PRODUCCIÓN'}`);

try {
  // Importar el módulo compilado de Mastra
  const mastraModule = await import('../.mastra/output/index.mjs');
  const exportKeys = Object.keys(mastraModule);

  // Buscar la instancia Mastra en los exports (el bundle minifica los nombres)
  let mastraInstance = null;
  for (const key of exportKeys) {
    const val = mastraModule[key];
    if (!val || typeof val !== 'object') continue;
    if (
      typeof val.getWorkflow === 'function' ||
      typeof val.listWorkflows === 'function'
    ) {
      console.log(`✅ Instancia Mastra encontrada en export "${key}"`);
      mastraInstance = val;
      break;
    }
  }

  if (!mastraInstance) {
    console.error('❌ No se encontró la instancia Mastra. Exports:', exportKeys.join(', '));
    process.exit(1);
  }

  // Listar workflows disponibles
  let workflows = {};
  if (typeof mastraInstance.listWorkflows === 'function') {
    workflows = mastraInstance.listWorkflows();
  } else if (mastraInstance.workflows) {
    workflows = mastraInstance.workflows;
  }
  console.log('📋 Workflows disponibles:', Object.keys(workflows).join(', '));

  // Obtener el workflow (buscar por ID o por nombre registrado)
  let workflow = null;
  const workflowIds = ['automationWorkflow', 'bodega-report-workflow', 'automation-workflow'];

  // Intentar con getWorkflow() primero
  if (typeof mastraInstance.getWorkflow === 'function') {
    for (const id of workflowIds) {
      try {
        workflow = mastraInstance.getWorkflow(id);
        if (workflow) {
          console.log(`✅ Workflow obtenido con ID: ${id}`);
          break;
        }
      } catch (e) { /* continuar */ }
    }
    // Si no encontró por ID conocido, tomar el primero disponible
    if (!workflow && Object.keys(workflows).length > 0) {
      const firstId = Object.keys(workflows)[0];
      workflow = mastraInstance.getWorkflow(firstId);
      console.log(`✅ Usando primer workflow disponible: ${firstId}`);
    }
  } else if (workflows && Object.keys(workflows).length > 0) {
    workflow = Object.values(workflows)[0];
    console.log(`✅ Usando workflow desde listWorkflows`);
  }

  if (!workflow) {
    console.error('❌ No se encontró el workflow');
    process.exit(1);
  }

  const triggerData = {
    scheduledAt: new Date().toISOString(),
    triggeredBy: 'github-actions-cron',
  };

  // Ejecutar según API de Mastra (v1: createRun/start, v0: execute)
  let result;
  if (typeof workflow.createRun === 'function') {
    console.log('🔄 Ejecutando con API v1 (createRun/start)...');
    const { runId, start } = workflow.createRun();
    console.log(`📝 Run ID: ${runId}`);
    result = await start({ triggerData });
  } else if (typeof workflow.execute === 'function') {
    console.log('🔄 Ejecutando con API v0 (execute)...');
    result = await workflow.execute({ triggerData });
  } else {
    console.error('❌ El workflow no tiene método execute ni createRun');
    console.error('Métodos:', Object.getOwnPropertyNames(Object.getPrototypeOf(workflow)));
    process.exit(1);
  }

  console.log('✅ Reporte completado exitosamente');
  console.log('📊 Resultado:', JSON.stringify(result, null, 2));
  process.exit(0);

} catch (error) {
  console.error('❌ Error al ejecutar el reporte:', error.message || error);
  if (error.stack) console.error(error.stack);
  process.exit(1);
}
