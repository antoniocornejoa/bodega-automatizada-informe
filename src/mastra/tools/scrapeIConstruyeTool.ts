import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import puppeteer from "puppeteer";
import { execSync } from "child_process";
import fs from "fs";

async function ensureChrome() {
  const cachePath = "/home/runner/.cache/puppeteer/chrome-headless-shell";
  if (!fs.existsSync(cachePath) || fs.readdirSync(cachePath).length === 0) {
    execSync("npx puppeteer browsers install chrome-headless-shell", {
      stdio: "pipe",
      timeout: 120000,
    });
  }
}

const LOGIN_URL = "https://cl.iconstruye.com/loginsso.aspx";
const REPORT_URL =
  "https://cl.iconstruye.com/bodega/reportes/RptInventarioPorFecha.aspx";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface DetailItem {
  bodega: string;
  codigo: string;
  descripcion: string;
  centroGestion: string;
  unidad: string;
  stock: number;
  ppp: number;
  stockValorizado: number;
}

function parseNum(text: string): number {
  return parseFloat(text.replace(/\./g, "").replace(",", ".")) || 0;
}

function parseStockFromHtml(html: string): {
  total: number;
  rows: number;
  maxPage: number;
  items: DetailItem[];
} {
  const tableMatch = html.match(
    /<table[^>]*id=["']TblResultados["'][^>]*>([\s\S]*?)<\/table>/i
  );
  if (!tableMatch) return { total: 0, rows: 0, maxPage: 1, items: [] };

  const tableHtml = tableMatch[0];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  const allRows: string[] = [];
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    allRows.push(rowMatch[1]);
  }

  let total = 0;
  let dataRows = 0;
  const items: DetailItem[] = [];

  for (let i = 1; i < allRows.length; i++) {
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    const cells: string[] = [];
    while ((cellMatch = cellRegex.exec(allRows[i])) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]*>/g, "").trim());
    }
    if (cells.length >= 14) {
      const stockVal = parseNum(cells[13]);
      total += stockVal;
      dataRows++;

      items.push({
        bodega: cells[0],
        codigo: cells[1],
        descripcion: cells[2],
        centroGestion: cells[3],
        unidad: cells[4],
        stock: parseNum(cells[11]),
        ppp: parseNum(cells[12]),
        stockValorizado: stockVal,
      });
    }
  }

  const pageLinks = html.match(/javascript:void\(IrA\((\d+)\)\)/g) || [];
  const maxPage =
    pageLinks.length > 0
      ? Math.max(
          ...pageLinks.map((l) => parseInt(l.match(/(\d+)/)?.[1] || "1"))
        )
      : 1;

  return { total, rows: dataRows, maxPage, items };
}

async function fetchPage(
  url: string,
  cookieStr: string,
  params: URLSearchParams
): Promise<string> {
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieStr,
      "User-Agent": UA,
      Referer: url,
    },
    body: params.toString(),
  });
  return resp.text();
}

function extractVzipstate(html: string): string {
  const match = html.match(/name="__VZIPSTATE"\s+value="([^"]*)"/);
  return match ? match[1] : "";
}

function buildSearchParams(
  vzipstate: string,
  centroValue: string,
  page: number = 1
): URLSearchParams {
  const params = new URLSearchParams();
  params.append("__EVENTTARGET", page === 1 ? "btnBuscarDoc" : "btnBuscar");
  params.append("__EVENTARGUMENT", "");
  params.append("__LASTFOCUS", "");
  params.append("__VZIPSTATE", vzipstate);
  params.append("__VIEWSTATE", "");
  params.append("lstCentroGestion", centroValue);
  params.append("lstBodega", "0");
  params.append("lstStock", "1");
  params.append("chkValorizado", "on");
  params.append("hidPagina", String(page));
  params.append("hidIdMstrItem", "");
  params.append("hidIdBodega", "");
  return params;
}

export const scrapeIConstruyeTool = createTool({
  id: "scrape-iconstruye-inventory",
  description:
    "Ingresa a iConstruye vía SSO, navega a Bodega > Reportes > Inventario por Fecha, recorre todos los Centros de Gestión con tipo Valorizado y extrae el detalle de cada ítem de inventario",
  inputSchema: z.object({}),
  outputSchema: z.object({
    inventoryRecords: z.array(
      z.object({
        centroGestion: z.string(),
        stockValorizado: z.number(),
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
    recordCount: z.number(),
    detailCount: z.number(),
  }),
  execute: async (_inputData, context) => {
    const mastra = context?.mastra;
    const logger = mastra?.getLogger();
    logger?.info("🌐 [scrapeIConstruye] Iniciando scraping de iConstruye...");

    const username = process.env.ICONSTRUYE_USERNAME;
    const password = process.env.ICONSTRUYE_PASSWORD;

    if (!username || !password) {
      throw new Error(
        "Se requieren las variables ICONSTRUYE_USERNAME e ICONSTRUYE_PASSWORD"
      );
    }

    let browser;
    try {
      logger?.info(
        "🚀 [scrapeIConstruye] Abriendo navegador para login SSO..."
      );
      await ensureChrome();
      browser = await puppeteer.launch({
        headless: "shell",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-blink-features=AutomationControlled",
        ],
      });

      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(60000);
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(UA);
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
      });

      logger?.info(
        `🔑 [scrapeIConstruye] Navegando al login: ${LOGIN_URL}`
      );
      await page.goto(LOGIN_URL, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      logger?.info("🔑 [scrapeIConstruye] Haciendo clic en pestaña SSO...");
      await page.evaluate(() =>
        document.getElementById("liTabLoginSso")?.click()
      );
      await new Promise((r) => setTimeout(r, 500));

      logger?.info("🔑 [scrapeIConstruye] Ingresando credenciales SSO...");
      await page.waitForSelector("#txtUsuarioSso", {
        visible: true,
        timeout: 10000,
      });
      await page.type("#txtUsuarioSso", username, { delay: 10 });
      await page.type("#txtPasswordSso", password, { delay: 10 });
      await new Promise((r) => setTimeout(r, 300));

      logger?.info("🔘 [scrapeIConstruye] Haciendo clic en botón de login...");
      await page.evaluate(() =>
        document.getElementById("btnIniciaSessionSso")?.click()
      );

      try {
        await page.waitForNavigation({
          waitUntil: "networkidle2",
          timeout: 30000,
        });
      } catch {
        logger?.info(
          "⚠️ [scrapeIConstruye] Tiempo de espera de navegación agotado, verificando estado..."
        );
      }

      const postLoginUrl = page.url();
      logger?.info(
        `📍 [scrapeIConstruye] URL post-login: ${postLoginUrl}`
      );

      if (postLoginUrl.includes("loginsso.aspx")) {
        throw new Error(
          "Falló el login - sigue en la página de login después de enviar las credenciales"
        );
      }

      logger?.info("✅ [scrapeIConstruye] Login exitoso");

      logger?.info(
        `📂 [scrapeIConstruye] Navegando al reporte: ${REPORT_URL}`
      );
      await page.goto(REPORT_URL, {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      await page.click("#chkValorizado");
      await page.select("#lstStock", "1");
      await new Promise((r) => setTimeout(r, 500));

      const cookies = await page.cookies();
      const cookieStr = cookies
        .map((c) => c.name + "=" + c.value)
        .join("; ");

      const hiddenFields = await page.evaluate(() => {
        const inputs = document.querySelectorAll("input[type=hidden]");
        const result: Record<string, string> = {};
        inputs.forEach((i) => {
          const inp = i as HTMLInputElement;
          result[inp.name] = inp.value;
        });
        return result;
      });

      const centroOptions = await page.evaluate(() => {
        const sel = document.getElementById(
          "lstCentroGestion"
        ) as HTMLSelectElement;
        return Array.from(sel.options)
          .filter(
            (o) =>
              o.value !== "-1" &&
              o.value !== "0" &&
              !o.text.trim().toUpperCase().includes("DOCUMENTOS EXCLUIDOS") &&
              !o.text.trim().toUpperCase().includes("PRUEBAS Y CAPACITACION")
          )
          .map((o) => ({
            value: o.value,
            text: o.text.trim(),
          }));
      });

      logger?.info(
        `📋 [scrapeIConstruye] Encontrados ${centroOptions.length} Centros de Gestión`
      );

      await browser.close();
      browser = null;
      logger?.info(
        "🔒 [scrapeIConstruye] Navegador cerrado, cambiando a HTTP..."
      );

      let currentVzipstate = hiddenFields["__VZIPSTATE"] || "";
      const records: { centroGestion: string; stockValorizado: number }[] = [];
      const allDetailItems: DetailItem[] = [];
      const startTime = Date.now();
      const MAX_TIME_MS = 10 * 60 * 1000;

      for (let c = 0; c < centroOptions.length; c++) {
        if (Date.now() - startTime > MAX_TIME_MS) {
          logger?.warn(
            `⏰ [scrapeIConstruye] Tiempo límite alcanzado en ${c}/${centroOptions.length}. Retornando resultados parciales.`
          );
          break;
        }

        const centro = centroOptions[c];
        const iterStart = Date.now();

        try {
          const searchParams = buildSearchParams(
            currentVzipstate,
            centro.value,
            1
          );
          const searchHtml = await fetchPage(
            REPORT_URL,
            cookieStr,
            searchParams
          );

          const newVzip = extractVzipstate(searchHtml);
          if (newVzip) currentVzipstate = newVzip;

          if (!searchHtml.includes("TblResultados")) {
            continue;
          }

          const result = parseStockFromHtml(searchHtml);

          if (result.rows === 0) {
            continue;
          }

          let totalStock = result.total;
          const centroItems: DetailItem[] = [...result.items];

          if (result.maxPage > 1) {
            for (let p = 2; p <= result.maxPage; p++) {
              const pageParams = buildSearchParams(
                currentVzipstate,
                centro.value,
                p
              );
              const pageHtml = await fetchPage(
                REPORT_URL,
                cookieStr,
                pageParams
              );
              const pVzip = extractVzipstate(pageHtml);
              if (pVzip) currentVzipstate = pVzip;
              const pageResult = parseStockFromHtml(pageHtml);
              totalStock += pageResult.total;
              centroItems.push(...pageResult.items);
            }
          }

          if (totalStock > 0) {
            records.push({
              centroGestion: centro.text,
              stockValorizado: totalStock,
            });
            allDetailItems.push(...centroItems);
          }

          logger?.info(
            `📊 [scrapeIConstruye] ${c + 1}/${centroOptions.length} ${centro.text}: $${totalStock.toLocaleString("es-CL")} (${centroItems.length} ítems, ${result.maxPage} págs, ${Date.now() - iterStart}ms)`
          );
        } catch (err) {
          logger?.warn(
            `⚠️ [scrapeIConstruye] ${c + 1}/${centroOptions.length} ${centro.text}: Error - ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      logger?.info(
        `✅ [scrapeIConstruye] Scraping completado. ${records.length} centros con stock, ${allDetailItems.length} ítems detallados en ${elapsed}s`
      );

      return {
        inventoryRecords: records,
        detailItems: allDetailItems,
        recordCount: records.length,
        detailCount: allDetailItems.length,
      };
    } catch (error) {
      logger?.error(
        `❌ [scrapeIConstruye] Error: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    } finally {
      if (browser) {
        await browser.close();
        logger?.info("🔒 [scrapeIConstruye] Navegador cerrado");
      }
    }
  },
});
