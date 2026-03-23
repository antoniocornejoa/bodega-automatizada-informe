import { Agent } from "@mastra/core/agent";
import { createOpenAI } from "@ai-sdk/openai";
import { scrapeIConstruyeTool } from "../tools/scrapeIConstruyeTool";
import { fetchExcessTool } from "../tools/fetchExcessTool";
import { generateReportTool } from "../tools/generateReportTool";
import { sendReportTool } from "../tools/sendReportTool";

const openai = createOpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

export const automationAgent = new Agent({
  name: "Bodega Report Agent",
  id: "bodegaReportAgent",
  instructions: `
    Eres un agente especializado en generar informes de bodega.
    Tu trabajo es coordinar la extracción de datos de inventario de iConstruye,
    obtener los excedentes de inventario de Google Sheets,
    generar un informe consolidado en Excel con tablas dinámicas por Centro de Gestión,
    y enviar el resultado por correo electrónico.
    
    Siempre ejecuta las herramientas en el orden correcto:
    1. Extraer inventario de iConstruye
    2. Obtener excedentes de Google Sheets
    3. Generar el reporte consolidado
    4. Enviar por email
  `,
  model: openai("gpt-4o"),
  tools: {
    scrapeIConstruyeTool,
    fetchExcessTool,
    generateReportTool,
    sendReportTool,
  },
});
