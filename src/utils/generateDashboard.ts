/**
 * generateDashboard.ts
 *
 * Genera un HTML self-contained con diseño de Reporte Profesional
 * basado en los datos del reporte semanal de bodega.
 */

export interface DashboardData {
  inventoryRecords: { centroGestion: string; stockValorizado: number }[];
  excessRecords: { obraOrigen: string; valorExcedente: number }[];
  detailItems: {
    bodega: string;
    codigo: string;
    descripcion: string;
    centroGestion: string;
    unidad: string;
    stock: number;
    ppp: number;
    stockValorizado: number;
  }[];
  classifications: {
    codigo: string;
    descripcion: string;
    unidad: string;
    inventariable: string;
    valorTotal: number;
  }[];
  weeklyAssignments: number;
  weeklyValorizado: number;
  weekStart: string;
  weekEnd: string;
  assignmentsByDestino: { destino: string; count: number; valor: number }[];
  valorNoInventariable: number;
  valorInventariable: number;
  valorSinClasificar: number;
  noInventariableCount: number;
  inventariableCount: number;
  unclassifiedCount: number;
  totalResources: number;
  inventoryPivotCount: number;
  excessPivotCount: number;
}

function fmtCLP(n: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtShort(n: number): string {
  if (n >= 1_000_000_000) return "$" + (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(0) + "K";
  return "$" + n;
}

export function generateDashboardHTML(data: DashboardData): string {
  const totalInventario = data.inventoryRecords.reduce(
    (s, r) => s + r.stockValorizado,
    0
  );
  const centrosActivos = data.inventoryRecords.length;

  const top12 = [...data.inventoryRecords]
    .sort((a, b) => b.stockValorizado - a.stockValorizado)
    .slice(0, 12);

  const top10excess = [...data.excessRecords]
    .sort((a, b) => b.valorExcedente - a.valorExcedente)
    .slice(0, 10);

  const top15dest = [...data.assignmentsByDestino]
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  const barLabels = JSON.stringify(top12.map((r) => r.centroGestion));
  const barValues = JSON.stringify(top12.map((r) => r.stockValorizado));
  const donutValues = JSON.stringify([
    data.valorInventariable,
    data.valorNoInventariable,
    data.valorSinClasificar,
  ]);

  const now = new Date().toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // ── Rows ──────────────────────────────────────────────
  const detailRows = data.detailItems
    .map(
      (d) =>
        "<tr>" +
        "<td>" + esc(d.bodega) + "</td>" +
        "<td>" + esc(d.codigo) + "</td>" +
        "<td>" + esc(d.descripcion) + "</td>" +
        "<td>" + esc(d.centroGestion) + "</td>" +
        "<td>" + esc(d.unidad) + "</td>" +
        '<td class="num">' + d.stock.toLocaleString("es-CL") + "</td>" +
        '<td class="num">' + fmtCLP(d.ppp) + "</td>" +
        '<td class="num">' + fmtCLP(d.stockValorizado) + "</td>" +
        "</tr>"
    )
    .join("\n");

  const excessRows = top10excess
    .map(
      (e) =>
        "<tr>" +
        "<td>" + esc(e.obraOrigen) + "</td>" +
        '<td class="num">' + fmtCLP(e.valorExcedente) + "</td>" +
        "</tr>"
    )
    .join("\n");

  const destRows = top15dest
    .map(
      (d) =>
        "<tr>" +
        "<td>" + esc(d.destino) + "</td>" +
        '<td class="num">' + d.count + "</td>" +
        '<td class="num">' + fmtCLP(d.valor) + "</td>" +
        "</tr>"
    )
    .join("\n");

  return (
    "<!DOCTYPE html>\n" +
    '<html lang="es">\n' +
    "<head>\n" +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    "<title>Reporte Semanal Bodega — " + data.weekStart + " al " + data.weekEnd + "</title>\n" +
    '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><' + "/script>\n" +
    "<style>\n" +
    ":root {\n" +
    "  --blue1:#0f4c75; --blue2:#1b6ca8; --blue3:#118ab2;\n" +
    "  --accent:#06d6a0; --warn:#ef476f;\n" +
    "  --bg:#f0f4f8; --card:#ffffff; --border:#dde3ea;\n" +
    "  --text:#1a202c; --muted:#718096;\n" +
    "}\n" +
    "* { box-sizing:border-box; margin:0; padding:0; }\n" +
    "body { font-family:'Segoe UI',Arial,sans-serif; background:var(--bg); color:var(--text); font-size:14px; }\n" +
    "\n" +
    "/* HEADER */\n" +
    ".report-header {\n" +
    "  background:linear-gradient(135deg,var(--blue1) 0%,var(--blue2) 60%,var(--blue3) 100%);\n" +
    "  color:#fff; padding:32px 40px 28px;\n" +
    "  display:flex; justify-content:space-between; align-items:flex-start;\n" +
    "}\n" +
    ".report-header h1 { font-size:26px; font-weight:700; letter-spacing:-0.5px; }\n" +
    ".report-header .subtitle { font-size:14px; opacity:.85; margin-top:4px; }\n" +
    ".report-header .meta { text-align:right; font-size:13px; opacity:.80; line-height:1.6; }\n" +
    "\n" +
    "/* LAYOUT */\n" +
    ".container { max-width:1280px; margin:0 auto; padding:28px 32px; }\n" +
    "section { margin-bottom:32px; }\n" +
    ".section-title {\n" +
    "  font-size:17px; font-weight:700; color:var(--blue1);\n" +
    "  border-left:4px solid var(--blue3); padding-left:12px;\n" +
    "  margin-bottom:16px;\n" +
    "}\n" +
    "\n" +
    "/* KPI GRID */\n" +
    ".kpi-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:16px; }\n" +
    ".kpi-card {\n" +
    "  background:var(--card); border-radius:10px; padding:20px 16px;\n" +
    "  border:1px solid var(--border); box-shadow:0 1px 4px rgba(0,0,0,.06);\n" +
    "  display:flex; flex-direction:column; gap:6px;\n" +
    "}\n" +
    ".kpi-label { font-size:11px; text-transform:uppercase; letter-spacing:.6px; color:var(--muted); font-weight:600; }\n" +
    ".kpi-value { font-size:22px; font-weight:800; color:var(--blue1); line-height:1.1; }\n" +
    ".kpi-sub   { font-size:12px; color:var(--muted); }\n" +
    ".kpi-card.accent .kpi-value { color:var(--accent); }\n" +
    ".kpi-card.warn   .kpi-value { color:var(--warn); }\n" +
    "\n" +
    "/* CHARTS */\n" +
    ".charts-grid { display:grid; grid-template-columns:2fr 1fr; gap:20px; }\n" +
    ".chart-card {\n" +
    "  background:var(--card); border-radius:10px; padding:20px;\n" +
    "  border:1px solid var(--border); box-shadow:0 1px 4px rgba(0,0,0,.06);\n" +
    "}\n" +
    ".chart-card h3 { font-size:13px; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:.5px; margin-bottom:14px; }\n" +
    ".chart-wrap { position:relative; height:280px; min-height:200px; }\n" +
    "\n" +
    "/* TABLES */\n" +
    ".table-card {\n" +
    "  background:var(--card); border-radius:10px;\n" +
    "  border:1px solid var(--border); box-shadow:0 1px 4px rgba(0,0,0,.06);\n" +
    "  overflow:hidden;\n" +
    "}\n" +
    ".table-toolbar {\n" +
    "  padding:12px 16px; border-bottom:1px solid var(--border);\n" +
    "  display:flex; justify-content:flex-end;\n" +
    "}\n" +
    ".table-toolbar input {\n" +
    "  padding:6px 12px; border:1px solid var(--border); border-radius:6px;\n" +
    "  font-size:13px; width:260px; outline:none;\n" +
    "}\n" +
    ".table-toolbar input:focus { border-color:var(--blue3); }\n" +
    ".tbl-wrap { overflow-x:auto; max-height:420px; overflow-y:auto; }\n" +
    "table { width:100%; border-collapse:collapse; font-size:13px; }\n" +
    "thead th {\n" +
    "  background:var(--blue1); color:#fff; padding:10px 12px;\n" +
    "  text-align:left; font-size:11px; text-transform:uppercase;\n" +
    "  letter-spacing:.4px; position:sticky; top:0; z-index:1; white-space:nowrap;\n" +
    "}\n" +
    "tbody tr:nth-child(even) { background:#f7f9fc; }\n" +
    "tbody tr:hover { background:#eef4ff; }\n" +
    "tbody td { padding:8px 12px; border-bottom:1px solid #eee; }\n" +
    "td.num { text-align:right; font-variant-numeric:tabular-nums; }\n" +
    "\n" +
    "/* TWO-COL */\n" +
    ".two-col { display:grid; grid-template-columns:1fr 1fr; gap:20px; }\n" +
    ".sub-table-wrap { overflow-x:auto; max-height:360px; overflow-y:auto; }\n" +
    "\n" +
    "/* PRINT */\n" +
    "@media print {\n" +
    "  body { background:#fff; }\n" +
    "  .table-toolbar input { display:none; }\n" +
    "  .chart-wrap { height:200px; }\n" +
    "}\n" +
    "@media (max-width:900px) {\n" +
    "  .kpi-grid { grid-template-columns:repeat(2,1fr); }\n" +
    "  .charts-grid, .two-col { grid-template-columns:1fr; }\n" +
    "  .report-header { flex-direction:column; gap:12px; }\n" +
    "}\n" +
    "</style>\n" +
    "</head>\n" +
    "<body>\n" +
    "\n" +
    '<div class="report-header">\n' +
    "  <div>\n" +
    "    <h1>Reporte Semanal de Bodega</h1>\n" +
    '    <div class="subtitle">Semana del ' + data.weekStart + " al " + data.weekEnd + "</div>\n" +
    "  </div>\n" +
    '  <div class="meta">\n' +
    "    <div><strong>Generado:</strong> " + now + "</div>\n" +
    "    <div><strong>Centros de Gestión:</strong> " + centrosActivos + "</div>\n" +
    "    <div><strong>Recursos totales:</strong> " + data.totalResources.toLocaleString("es-CL") + "</div>\n" +
    "  </div>\n" +
    "</div>\n" +
    "\n" +
    '<div class="container">\n' +
    "\n" +
    "  <!-- KPIs -->\n" +
    "  <section>\n" +
    '    <div class="section-title">Resumen Ejecutivo</div>\n' +
    '    <div class="kpi-grid">\n' +
    '      <div class="kpi-card">\n' +
    '        <span class="kpi-label">Valor Total Inventario</span>\n' +
    '        <span class="kpi-value">' + fmtShort(totalInventario) + "</span>\n" +
    '        <span class="kpi-sub">' + fmtCLP(totalInventario) + "</span>\n" +
    "      </div>\n" +
    '      <div class="kpi-card">\n' +
    '        <span class="kpi-label">Centros Activos</span>\n' +
    '        <span class="kpi-value">' + centrosActivos + "</span>\n" +
    '        <span class="kpi-sub">' + data.inventoryPivotCount + " registros pivot</span>\n" +
    "      </div>\n" +
    '      <div class="kpi-card accent">\n' +
    '        <span class="kpi-label">Valor Inventariable</span>\n' +
    '        <span class="kpi-value">' + fmtShort(data.valorInventariable) + "</span>\n" +
    '        <span class="kpi-sub">' + data.inventariableCount + " artículos</span>\n" +
    "      </div>\n" +
    '      <div class="kpi-card warn">\n' +
    '        <span class="kpi-label">Excedentes</span>\n' +
    '        <span class="kpi-value">' + data.excessRecords.length + "</span>\n" +
    '        <span class="kpi-sub">' + data.excessPivotCount + " registros pivot</span>\n" +
    "      </div>\n" +
    '      <div class="kpi-card">\n' +
    '        <span class="kpi-label">Asignaciones Semana</span>\n' +
    '        <span class="kpi-value">' + data.weeklyAssignments + "</span>\n" +
    '        <span class="kpi-sub">' + fmtShort(data.weeklyValorizado) + " valorizado</span>\n" +
    "      </div>\n" +
    "    </div>\n" +
    "  </section>\n" +
    "\n" +
    "  <!-- CHARTS -->\n" +
    "  <section>\n" +
    '    <div class="section-title">Gráficos y Visualizaciones</div>\n' +
    '    <div class="charts-grid">\n' +
    '      <div class="chart-card">\n' +
    "        <h3>Top 12 Centros por Valor Inventariado</h3>\n" +
    '        <div class="chart-wrap"><canvas id="barChart"></canvas></div>\n' +
    "      </div>\n" +
    '      <div class="chart-card">\n' +
    "        <h3>Distribución por Clasificación</h3>\n" +
    '        <div class="chart-wrap"><canvas id="donutChart"></canvas></div>\n' +
    "      </div>\n" +
    "    </div>\n" +
    "  </section>\n" +
    "\n" +
    "  <!-- INVENTORY TABLE -->\n" +
    "  <section>\n" +
    '    <div class="section-title">Tabla de Inventario Detallada</div>\n' +
    '    <div class="table-card">\n' +
    '      <div class="table-toolbar">\n' +
    '        <input type="text" id="invSearch" placeholder="Buscar por bodega, código, descripción…" oninput="filterTable(this,\'invTable\')">\n' +
    "      </div>\n" +
    '      <div class="tbl-wrap">\n' +
    '        <table id="invTable">\n' +
    "          <thead><tr>\n" +
    "            <th>Bodega</th><th>Código</th><th>Descripción</th>\n" +
    "            <th>Centro Gestión</th><th>Unidad</th>\n" +
    "            <th>Stock</th><th>PPP</th><th>Stock Valorizado</th>\n" +
    "          </tr></thead>\n" +
    "          <tbody>\n" + detailRows + "\n          </tbody>\n" +
    "        </table>\n" +
    "      </div>\n" +
    "    </div>\n" +
    "  </section>\n" +
    "\n" +
    "  <!-- EXCESS + ASSIGNMENTS -->\n" +
    "  <section>\n" +
    '    <div class="section-title">Excesos y Asignaciones</div>\n' +
    '    <div class="two-col">\n' +
    '      <div class="table-card">\n' +
    '        <div class="table-toolbar" style="padding:10px 16px;">\n' +
    '          <strong style="font-size:13px;color:var(--warn);">Top 10 Excedentes</strong>\n' +
    "        </div>\n" +
    '        <div class="sub-table-wrap">\n' +
    "          <table>\n" +
    "            <thead><tr><th>Obra / Origen</th><th>Valor Excedente</th></tr></thead>\n" +
    "            <tbody>\n" + excessRows + "\n            </tbody>\n" +
    "          </table>\n" +
    "        </div>\n" +
    "      </div>\n" +
    '      <div class="table-card">\n' +
    '        <div class="table-toolbar" style="padding:10px 16px;">\n' +
    '          <strong style="font-size:13px;color:var(--blue1);">Top 15 Destinos (Asignaciones)</strong>\n' +
    "        </div>\n" +
    '        <div class="sub-table-wrap">\n' +
    "          <table>\n" +
    "            <thead><tr><th>Destino</th><th>Cantidad</th><th>Valor</th></tr></thead>\n" +
    "            <tbody>\n" + destRows + "\n            </tbody>\n" +
    "          </table>\n" +
    "        </div>\n" +
    "      </div>\n" +
    "    </div>\n" +
    "  </section>\n" +
    "\n" +
    "</div><!-- /container -->\n" +
    "\n" +
    "<script>\n" +
    "var BAR_LABELS = " + barLabels + ";\n" +
    "var BAR_VALUES = " + barValues + ";\n" +
    "var DONUT_VALUES = " + donutValues + ";\n" +
    "\n" +
    "new Chart(document.getElementById('barChart'), {\n" +
    "  type: 'bar',\n" +
    "  data: {\n" +
    "    labels: BAR_LABELS,\n" +
    "    datasets: [{\n" +
    "      label: 'Stock Valorizado',\n" +
    "      data: BAR_VALUES,\n" +
    "      backgroundColor: 'rgba(27,108,168,0.75)',\n" +
    "      borderColor: 'rgba(15,76,117,1)',\n" +
    "      borderWidth: 1, borderRadius: 4\n" +
    "    }]\n" +
    "  },\n" +
    "  options: {\n" +
    "    responsive: true, maintainAspectRatio: false,\n" +
    "    plugins: { legend: { display: false } },\n" +
    "    scales: {\n" +
    "      x: { ticks: { font: { size: 10 }, maxRotation: 35 } },\n" +
    "      y: { ticks: { callback: function(v) {\n" +
    "        if (v >= 1e9) return '$' + (v/1e9).toFixed(1) + 'B';\n" +
    "        if (v >= 1e6) return '$' + (v/1e6).toFixed(1) + 'M';\n" +
    "        if (v >= 1e3) return '$' + (v/1e3).toFixed(0) + 'K';\n" +
    "        return '$' + v;\n" +
    "      }}}\n" +
    "    }\n" +
    "  }\n" +
    "});\n" +
    "\n" +
    "new Chart(document.getElementById('donutChart'), {\n" +
    "  type: 'doughnut',\n" +
    "  data: {\n" +
    "    labels: ['Inventariable', 'No Inventariable', 'Sin Clasificar'],\n" +
    "    datasets: [{ data: DONUT_VALUES, backgroundColor: ['#06d6a0','#ef476f','#ffd166'], borderWidth: 2 }]\n" +
    "  },\n" +
    "  options: {\n" +
    "    responsive: true, maintainAspectRatio: false,\n" +
    "    plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }\n" +
    "  }\n" +
    "});\n" +
    "\n" +
    "function filterTable(input, tableId) {\n" +
    "  var q = input.value.toLowerCase();\n" +
    "  var rows = document.getElementById(tableId).querySelectorAll('tbody tr');\n" +
    "  rows.forEach(function(row) {\n" +
    "    row.style.display = row.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none';\n" +
    "  });\n" +
    "}\n" +
    "<" + "/script>\n" +
    "</body>\n" +
    "</html>"
  );
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
