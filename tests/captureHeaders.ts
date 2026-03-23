import puppeteer from "puppeteer";
import { execSync } from "child_process";
import fs from "fs";

const LOGIN_URL = "https://cl.iconstruye.com/loginsso.aspx";
const REPORT_URL = "https://cl.iconstruye.com/bodega/reportes/RptInventarioPorFecha.aspx";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function ensureChrome() {
  const cachePath = "/home/runner/.cache/puppeteer/chrome-headless-shell";
  if (!fs.existsSync(cachePath) || fs.readdirSync(cachePath).length === 0) {
    execSync("npx puppeteer browsers install chrome-headless-shell", { stdio: "pipe", timeout: 120000 });
  }
}

function extractVzipstate(html: string): string {
  const match = html.match(/name="__VZIPSTATE"\s+value="([^"]*)"/);
  return match ? match[1] : "";
}

async function main() {
  await ensureChrome();
  const browser = await puppeteer.launch({
    headless: "shell",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60000);
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(UA);

  await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 60000 });
  await page.evaluate(() => document.getElementById("liTabLoginSso")?.click());
  await new Promise(r => setTimeout(r, 500));
  await page.waitForSelector("#txtUsuarioSso", { visible: true, timeout: 10000 });
  await page.type("#txtUsuarioSso", process.env.ICONSTRUYE_USERNAME!, { delay: 10 });
  await page.type("#txtPasswordSso", process.env.ICONSTRUYE_PASSWORD!, { delay: 10 });
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => document.getElementById("btnIniciaSessionSso")?.click());
  try { await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }); } catch {}

  console.log("Post-login URL:", page.url());
  await page.goto(REPORT_URL, { waitUntil: "networkidle2", timeout: 60000 });
  await page.click("#chkValorizado");
  await page.select("#lstStock", "1");
  await new Promise(r => setTimeout(r, 500));

  const cookies = await page.cookies();
  const cookieStr = cookies.map(c => c.name + "=" + c.value).join("; ");
  const hiddenFields = await page.evaluate(() => {
    const inputs = document.querySelectorAll("input[type=hidden]");
    const result: Record<string, string> = {};
    inputs.forEach(i => { const inp = i as HTMLInputElement; result[inp.name] = inp.value; });
    return result;
  });

  const centroOptions = await page.evaluate(() => {
    const sel = document.getElementById("lstCentroGestion") as HTMLSelectElement;
    return Array.from(sel.options)
      .filter(o => o.value !== "-1" && o.value !== "0" && !o.text.trim().toUpperCase().includes("DOCUMENTOS EXCLUIDOS"))
      .map(o => ({ value: o.value, text: o.text.trim() }));
  });

  await browser.close();

  const firstCentro = centroOptions.find(c => c.text.includes("BODEGA CONTROL DE EXCEDENTES")) || centroOptions.find(c => c.text.includes("VENTA MATERIALES")) || centroOptions[0];
  console.log("Testing with centro:", firstCentro.text);

  const vzipstate = hiddenFields["__VZIPSTATE"] || "";
  const params = new URLSearchParams();
  params.append("__EVENTTARGET", "btnBuscarDoc");
  params.append("__EVENTARGUMENT", "");
  params.append("__LASTFOCUS", "");
  params.append("__VZIPSTATE", vzipstate);
  params.append("__VIEWSTATE", "");
  params.append("lstCentroGestion", firstCentro.value);
  params.append("lstBodega", "0");
  params.append("lstStock", "1");
  params.append("chkValorizado", "on");
  params.append("hidPagina", "1");
  params.append("hidIdMstrItem", "");
  params.append("hidIdBodega", "");

  const resp = await fetch(REPORT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieStr,
      "User-Agent": UA,
      Referer: REPORT_URL,
    },
    body: params.toString(),
  });
  const html = await resp.text();

  const tableMatch = html.match(/<table[^>]*id=["']TblResultados["'][^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    console.log("No table found");
    process.exit(1);
  }

  const tableHtml = tableMatch[0];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  const allRows: string[] = [];
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    allRows.push(rowMatch[1]);
  }

  console.log(`\nTotal rows: ${allRows.length}`);

  for (let i = 0; i < Math.min(3, allRows.length); i++) {
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    const cells: string[] = [];
    while ((cellMatch = cellRegex.exec(allRows[i])) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]*>/g, "").trim());
    }
    console.log(`\nRow ${i} (${cells.length} cells):`);
    cells.forEach((cell, idx) => console.log(`  [${idx}] ${cell.substring(0, 80)}`));
  }
}

main().catch(console.error);
