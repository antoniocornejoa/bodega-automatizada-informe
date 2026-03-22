# Automatización Informe Semanal de Bodega

## Descripción
Automatización que genera y envía un informe semanal de bodega cada lunes a las 8 AM hora Chile (CLT). El flujo scrapea iConstruye, lee Google Sheets, clasifica recursos y envía un Excel consolidado por Gmail.

## Arquitectura
- **Framework**: Mastra 1.0 con Inngest para workflows
- **Scraping**: Puppeteer (login SSO) + HTTP fetch (paginación de datos)
- **Base de datos**: PostgreSQL (Replit built-in)
- **Integraciones**: Google Sheets, Gmail (Replit connectors)

## Workflow (6 pasos)
1. **Paso 1** - `scrapeIConstruyeTool`: Login SSO a iConstruye, scrapea inventario por Centro de Gestión con detalle de ítems (código, descripción, stock, PPP, valorizado)
2. **Paso 2** - `fetchExcessTool`: Lee excedentes desde hoja "Solicitudes" del Google Sheets
3. **Paso 2.5** - `fetchAssignmentsTool`: Lee asignaciones semanales desde "ASIGNACIONES HISTORICO"
4. **Paso 2.7** - `classifyResourcesTool`: Sincroniza TODOS los recursos únicos del inventario con Google Spreadsheet separado "Clasificación Inventario - Bodega" (ID: `1yYjrcBIL3Jtde4rxxtAVREz-USUPjLwAD36NPcSypeM`). Reescribe la hoja completa cada ejecución preservando clasificación SI/NO existente.
5. **Paso 3** - `generateReportTool`: Genera Excel con 6 hojas (Consolidado, Inventario por Centro, Excedentes por Obra, Detalle por Centro, Inventario General, Clasificación Recursos)
6. **Paso 4** - `sendReportTool`: Envía por Gmail con HTML resumen incluyendo montos no inventariables

## Archivos Principales
- `src/mastra/tools/scrapeIConstruyeTool.ts` - Scraper iConstruye
- `src/mastra/tools/fetchExcessTool.ts` - Lectura excedentes Google Sheets
- `src/mastra/tools/fetchAssignmentsTool.ts` - Lectura asignaciones semanales
- `src/mastra/tools/classifyResourcesTool.ts` - Clasificación inventariable/no inventariable
- `src/mastra/tools/generateReportTool.ts` - Generación Excel
- `src/mastra/tools/sendReportTool.ts` - Envío Gmail
- `src/mastra/workflows/workflow.ts` - Orquestación del workflow
- `src/mastra/index.ts` - Registro Mastra
- `src/utils/gmail.ts` - Utilidad Gmail con soporte CC
- `src/utils/googleSheets.ts` - Cliente Google Sheets
- `scripts/build.sh` - Build producción (4GB Node memory)
- `scripts/start-production.sh` - Inicio producción

## Configuración
- **Cron**: `0 12 * * 1` UTC (8 AM Chile) - variable `SCHEDULE_CRON_EXPRESSION`
- **Google Sheets ID**: `19-LRlC1MWFRxtpjfhSX0KbJPCOO1fu4ebzzh_ZVb1kE`
- **Gmail connector**: `conn_google-mail_01KJDY0ZP6H02E1JCMPDXD7WBV`
- **Destinatarios actuales (prueba)**: TO: acornejo@cindependencia.cl
- **Destinatarios finales**: TO: mleivac@cindependencia.cl, claudio.contreras@cindependencia.cl; CC: acornejo@cindependencia.cl
- **Secrets**: ICONSTRUYE_USERNAME, ICONSTRUYE_PASSWORD, SESSION_SECRET
- **Deploy**: target autoscale, health check en "/" retorna 200

## Columnas iConstruye
[0]Bodega, [1]Código, [2]Descripción, [3]Centro de Gestión, [4]Unidad, [5-10]Movimientos, [11]Stock, [12]PPP, [13]Stock Valorizado

## Clasificación de Inventario
- **Spreadsheet separado**: "Clasificación Inventario - Bodega" (ID: `1yYjrcBIL3Jtde4rxxtAVREz-USUPjLwAD36NPcSypeM`)
- **URL**: https://docs.google.com/spreadsheets/d/1yYjrcBIL3Jtde4rxxtAVREz-USUPjLwAD36NPcSypeM
- **Hoja**: "Clasificación Inventario" con columnas: CÓDIGO, DESCRIPCIÓN, UNIDAD, VALOR TOTAL, INVENTARIABLE
- La columna INVENTARIABLE acepta "SI" o "NO" (mayúsculas)
- Se reescribe completa cada ejecución preservando las clasificaciones existentes
- Se busca el spreadsheet por nombre en Google Drive; si no existe, lo crea automáticamente

## Notas
- El spreadsheet de clasificación es separado del principal para evitar problemas de protección de hojas.
