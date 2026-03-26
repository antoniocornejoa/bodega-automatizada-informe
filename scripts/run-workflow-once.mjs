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
  // Importar el workflow compilado
  const { automationWorkflow } = await import('../.mastra/output/index.mjs');

  // Ejecutar el workflow directamente
  const result = await automationWorkflow.execute({
    triggerData: {
      scheduledAt: new Date().toISOString(),
      triggeredBy: 'github-actions-cron',
    }
  });

  console.log('✅ Reporte completado exitosamente');
  console.log('📊 Resultado:', JSON.stringify(result, null, 2));
  process.exit(0);

} catch (error) {
  console.error('❌ Error al ejecutar el reporte:', error);

  // Si hay API key de Anthropic, intentar auto-diagnóstico
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('\n🤖 Iniciando diagnóstico automático con Claude...');
    try {
      await runAIDiagnosis(error);
    } catch (diagError) {
      console.error('Error en diagnóstico:', diagError.message);
    }
  }

  process.exit(1);
}

/**
 * Usa Claude para analizar el error y sugerir una corrección
 */
async function runAIDiagnosis(error) {
  const { Anthropic } = await import('@anthropic-ai/sdk');
  const { readFileSync, readdirSync } = await import('fs');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Leer archivos relevantes del proyecto
  const srcFiles = {};
  const toolsDir = join(__dirname, '../src/mastra/tools');
  try {
    const files = readdirSync(toolsDir);
    for (const file of files.slice(0, 5)) { // máximo 5 archivos
      const content = readFileSync(join(toolsDir, file), 'utf-8');
      srcFiles[`src/mastra/tools/${file}`] = content.slice(0, 2000); // primeros 2000 chars
    }
  } catch (e) {
    console.log('No se pudieron leer archivos fuente:', e.message);
  }

  const prompt = `Eres un experto en TypeScript y automatización.
El siguiente error ocurrió al ejecutar el workflow de reporte de bodega semanal.

ERROR:
${error.stack || error.message}

ARCHIVOS RELEVANTES:
${Object.entries(srcFiles).map(([name, content]) => `
=== ${name} ===
${content}
`).join('\n')}

Por favor:
1. Identifica la causa raíz del error
2. Sugiere el cambio de código exacto para corregirlo
3. Explica el fix en términos simples

Responde en español.`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  });

  const diagnosis = response.content[0].text;
  console.log('\n🤖 Diagnóstico de Claude:\n');
  console.log(diagnosis);

  // En un entorno real, aquí enviarías el diagnóstico por email o Slack
  // o abrirías automáticamente un issue en GitHub
}
