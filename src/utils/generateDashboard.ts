/**
 * generateDashboard.ts
 *
 * Genera un HTML self-contained con diseño de Panel Administrativo
 * basado en los datos del reporte semanal de bodega.
 */

export interface DashboardData {
  inventoryRecords: { centroGestion: string; stockValorizado: number }[];
  excessRecords: { obraOrigen: string; valorExcedente: number }[];
  detailItems: {
    bodega: string; codigo: string; descripcion: string;
    centroGestion: string; unidad: string; stock: number;
    ppp: number; stockValorizado: number;
  }[];
  classifications: {
    codigo: string; descripcion: string; unidad: string;
    inventariable: string; valorTotal: number;
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
  return '$' + Math.round(n).toLocaleString('es-CL');
}

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('es-CL');
}

export function generateDashboardHTML(data: DashboardData): string {
  const {
    inventoryRecords, excessRecords, classifications,
    weeklyAssignments, weeklyValorizado, weekStart, weekEnd,
    assignmentsByDestino,
    valorNoInventariable, valorInventariable, valorSinClasificar,
    noInventariableCount, inventariableCount, unclassifiedCount,
    totalResources, inventoryPivotCount, excessPivotCount,
  } = data;

  const totalStock = inventoryRecords.reduce((s, r) => s + r.stockValorizado, 0);
  const totalExcedentes = excessRecords.reduce((s, r) => s + r.valorExcedente, 0);

  const centroMap = new Map<string, number>();
  inventoryRecords.forEach(r => {
    centroMap.set(r.centroGestion, (centroMap.get(r.centroGestion) || 0) + r.stockValorizado);
  });
  const topCentros = Array.from(centroMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const chartLabels = JSON.stringify(topCentros.map(([name]) =>
    name.length > 35 ? name.substring(0, 33) + '\u2026' : name
  ));
  const chartValues = JSON.stringify(topCentros.map(([, val]) => Math.round(val)));

  const allCentros = Array.from(centroMap.entries()).sort((a, b) => b[1] - a[1]);

  const centrosTableRows = allCentros.map(([centro, stock], i) => {
    const pct = totalStock > 0 ? ((stock / totalStock) * 100).toFixed(1) : '0';
    return `
      <tr>
        <td style="padding:8px 12px;color:#64748b;font-size:13px;">${i + 1}</td>
        <td style="padding:8px 12px;font-size:13px;">${centro}</td>
        <td style="padding:8px 12px;text-align:right;font-size:13px;font-weight:600;color:#1a6b72;">${fmtCLP(stock)}</td>
        <td style="padding:8px 12px;">
          <div style="background:#e2f0f1;border-radius:4px;height:8px;min-width:60px;">
            <div style="background:#1a6b72;border-radius:4px;height:8px;width:${pct}%;"></div>
          </div>
        </td>
        <td style="padding:8px 12px;text-align:center;font-size:12px;color:#64748b;">${pct}%</td>
      </tr>`;
  }).join('');

  const excessMap = new Map<string, number>();
  excessRecords.forEach(r => {
    excessMap.set(r.obraOrigen, (excessMap.get(r.obraOrigen) || 0) + r.valorExcedente);
  });
  const topExcesos = Array.from(excessMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const excesosRows = topExcesos.map(([obra, val]) => `
    <tr>
      <td style="padding:7px 12px;font-size:13px;">${obra}</td>
      <td style="padding:7px 12px;text-align:right;font-size:13px;font-weight:600;color:#f59e0b;">${fmtCLP(val)}</td>
    </tr>`).join('');

  const asignRows = assignmentsByDestino.slice(0, 8).map(a => `
    <tr>
      <td style="padding:7px 12px;font-size:13px;">${a.destino}</td>
      <td style="padding:7px 12px;text-align:center;font-size:13px;">${a.count}</td>
      <td style="padding:7px 12px;text-align:right;font-size:13px;font-weight:600;color:#10b981;">${fmtCLP(a.valor)}</td>
    </tr>`).join('');

  const today = new Date();
  const dateStr = today.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const dateShort = today.toLocaleDateString('es-CL');

  const unclassifiedAlert = unclassifiedCount > 0 ? `
    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:16px 20px;margin-top:16px;display:flex;align-items:center;gap:12px;">
      <span style="font-size:22px;">\u26a0\ufe0f</span>
      <div>
        <div style="font-weight:700;color:#92400e;font-size:14px;">Clasificación Pendiente</div>
        <div style="color:#b45309;font-size:13px;margin-top:2px;">${fmtNum(unclassifiedCount)} materiales sin clasificar por un monto de <strong>${fmtCLP(valorSinClasificar)}</strong>. Favor completar la clasificación en el Google Sheets.</div>
      </div>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Panel Bodega — Informe ${dateShort}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f4f8;color:#1e293b;display:flex;min-height:100vh;}
    .sidebar{width:240px;min-height:100vh;background:#1a6b72;color:white;display:flex;flex-direction:column;flex-shrink:0;}
    .sidebar-header{padding:24px 20px 16px;border-bottom:1px solid rgba(255,255,255,0.15);}
    .sidebar-logo{display:flex;align-items:center;gap:10px;margin-bottom:16px;}
    .sidebar-logo-icon{width:40px;height:40px;background:rgba(255,255,255,0.2);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;}
    .sidebar-logo-text{font-size:11px;opacity:0.8;line-height:1.3;}
    .sidebar-logo-text strong{display:block;font-size:15px;opacity:1;}
    .sidebar-user{background:rgba(255,255,255,0.1);border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px;}
    .sidebar-user-avatar{width:36px;height:36px;background:rgba(255,255,255,0.25);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;}
    .sidebar-user-name{font-size:13px;font-weight:600;}
    .sidebar-user-sub{font-size:11px;opacity:0.7;}
    .sidebar-nav{padding:16px 0;flex:1;}
    .nav-item{display:flex;align-items:center;padding:12px 20px;font-size:14px;cursor:pointer;transition:background 0.15s;border-left:3px solid transparent;opacity:0.85;}
    .nav-item:hover{background:rgba(255,255,255,0.1);opacity:1;}
    .nav-item.active{background:rgba(255,255,255,0.15);border-left-color:white;opacity:1;font-weight:600;}
    .nav-item-icon{margin-right:10px;font-size:16px;}
    .nav-item-arrow{margin-left:auto;font-size:12px;opacity:0.6;}
    .sidebar-footer{padding:16px 20px;border-top:1px solid rgba(255,255,255,0.15);font-size:12px;opacity:0.6;text-align:center;}
    .main{flex:1;padding:24px;overflow-x:auto;}
    .page-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;}
    .page-title{font-size:24px;font-weight:700;color:#1a6b72;}
    .page-subtitle{font-size:13px;color:#64748b;margin-top:4px;}
    .page-date{font-size:13px;color:#64748b;background:white;border-radius:8px;padding:6px 14px;border:1px solid #e2e8f0;display:flex;align-items:center;gap:6px;}
    .cards-row{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:24px;}
    .card{background:white;border-radius:14px;padding:18px 20px;box-shadow:0 1px 4px rgba(0,0,0,0.07);}
    .card-label{font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:#64748b;margin-bottom:8px;}
    .card-value{font-size:22px;font-weight:800;color:#1e293b;line-height:1.1;}
    .card-sub{font-size:12px;color:#94a3b8;margin-top:6px;}
    .card-icon{width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:12px;}
    .icon-teal{background:#e0f2f1;} .icon-blue{background:#e0f2fe;} .icon-green{background:#dcfce7;}
    .icon-orange{background:#fff7ed;} .icon-purple{background:#f3e8ff;}
    .top-row{display:grid;grid-template-columns:1fr 2fr;gap:16px;margin-bottom:24px;}
    .panel{background:white;border-radius:14px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.07);}
    .panel-title{font-size:14px;font-weight:700;color:#1a6b72;margin-bottom:4px;}
    .panel-sub{font-size:12px;color:#94a3b8;margin-bottom:16px;}
    .panel-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;}
    .donut-wrap{display:flex;flex-direction:column;align-items:center;}
    .donut-total{text-align:center;margin:12px 0;}
    .donut-total-num{font-size:36px;font-weight:800;color:#1a6b72;}
    .donut-total-label{font-size:12px;color:#94a3b8;}
    .legend{margin-top:8px;display:flex;flex-direction:column;gap:6px;width:100%;}
    .legend-item{display:flex;align-items:center;gap:8px;font-size:13px;}
    .legend-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;}
    .legend-label{flex:1;color:#64748b;}
    .legend-val{font-weight:700;color:#1e293b;}
    .section{background:white;border-radius:14px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.07);margin-bottom:16px;}
    .section-title{font-size:15px;font-weight:700;color:#1a6b72;margin-bottom:4px;}
    .section-sub{font-size:12px;color:#94a3b8;margin-bottom:16px;}
    table.data-table{width:100%;border-collapse:collapse;}
    table.data-table thead tr{background:#f8fafc;border-bottom:2px solid #e2e8f0;}
    table.data-table thead th{padding:10px 12px;text-align:left;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;}
    table.data-table tbody tr{border-bottom:1px solid #f1f5f9;}
    table.data-table tbody tr:hover{background:#f8fafc;}
    table.data-table tbody tr:last-child{border-bottom:none;}
    .bottom-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px;}
    @media(max-width:900px){.cards-row{grid-template-columns:repeat(2,1fr);}.top-row{grid-template-columns:1fr;}.bottom-grid{grid-template-columns:1fr;}.sidebar{width:200px;}}
    @media(max-width:600px){.sidebar{display:none;}.cards-row{grid-template-columns:1fr 1fr;}}
  </style>
</head>
<body>
<aside class="sidebar">
  <div class="sidebar-header">
    <div class="sidebar-logo">
      <div class="sidebar-logo-icon">\ud83c\udfd7\ufe0f</div>
      <div class="sidebar-logo-text"><strong>Panel Bodega</strong>Informe Automatizado</div>
    </div>
    <div class="sidebar-user">
      <div class="sidebar-user-avatar">\ud83d\udc64</div>
      <div><div class="sidebar-user-name">Bodega IC</div><div class="sidebar-user-sub">Sesión activa</div></div>
    </div>
  </div>
  <nav class="sidebar-nav">
    <div class="nav-item active"><span class="nav-item-icon">\ud83d\udcca</span>Dashboard<span class="nav-item-arrow">→</span></div>
    <div class="nav-item"><span class="nav-item-icon">\ud83d\udce6</span>Inventario<span class="nav-item-arrow">→</span></div>
    <div class="nav-item"><span class="nav-item-icon">\ud83d\udd04</span>Excedentes<span class="nav-item-arrow">→</span></div>
    <div class="nav-item"><span class="nav-item-icon">\ud83d\udccb</span>Asignaciones<span class="nav-item-arrow">→</span></div>
    <div class="nav-item"><span class="nav-item-icon">\ud83c\udff7\ufe0f</span>Clasificación<span class="nav-item-arrow">→</span></div>
  </nav>
  <div class="sidebar-footer">Generado automáticamente<br>${dateShort}</div>
</aside>
<main class="main">
  <div class="page-header">
    <div>
      <div class="page-title">Panel Bodega</div>
      <div class="page-subtitle">${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}</div>
    </div>
    <div class="page-date">\ud83d\udcc5 Actualizado hoy</div>
  </div>
  <div class="top-row">
    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">Estado del Inventario</div>
          <div class="panel-sub">${fmtNum(totalResources)} recursos únicos</div>
        </div>
        <div style="font-size:11px;color:#94a3b8;">${dateShort}</div>
      </div>
      <div class="donut-wrap">
        <canvas id="donutChart" width="180" height="180"></canvas>
        <div class="donut-total">
          <div class="donut-total-num">${inventoryPivotCount}</div>
          <div class="donut-total-label">Centros activos</div>
        </div>
        <div class="legend">
          <div class="legend-item"><div class="legend-dot" style="background:#10b981;"></div><span class="legend-label">Inventariable</span><span class="legend-val">${fmtNum(inventariableCount)}</span></div>
          <div class="legend-item"><div class="legend-dot" style="background:#ef4444;"></div><span class="legend-label">No Inventariable</span><span class="legend-val">${fmtNum(noInventariableCount)}</span></div>
          <div class="legend-item"><div class="legend-dot" style="background:#94a3b8;"></div><span class="legend-label">Sin Clasificar</span><span class="legend-val">${fmtNum(unclassifiedCount)}</span></div>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <div>
          <div class="panel-title">Stock por Centro de Gestión</div>
          <div class="panel-sub">Top 10 centros · Datos al ${dateShort} · Total entradas: ${fmtNum(inventoryPivotCount)} | Total materiales: ${fmtNum(totalResources)}</div>
        </div>
      </div>
      <canvas id="barChart" height="200"></canvas>
    </div>
  </div>
  <div class="cards-row">
    <div class="card"><div class="card-icon icon-teal">\ud83d\udce6</div><div class="card-label">Stock Total</div><div class="card-value" style="font-size:17px;">${fmtCLP(totalStock)}</div><div class="card-sub">Valorizado</div></div>
    <div class="card"><div class="card-icon icon-blue">\ud83c\udfe2</div><div class="card-label">Centros de Gestión</div><div class="card-value">${fmtNum(inventoryPivotCount)}</div><div class="card-sub">Con inventario activo</div></div>
    <div class="card"><div class="card-icon icon-green">\ud83d\udd22</div><div class="card-label">Materiales únicos</div><div class="card-value">${fmtNum(totalResources)}</div><div class="card-sub">Recursos clasificados</div></div>
    <div class="card"><div class="card-icon icon-orange">\ud83d\udd04</div><div class="card-label">Excedentes</div><div class="card-value" style="font-size:17px;">${fmtCLP(totalExcedentes)}</div><div class="card-sub">${fmtNum(excessPivotCount)} obras con excedentes</div></div>
    <div class="card"><div class="card-icon icon-purple">\ud83d\udce4</div><div class="card-label">Asignaciones</div><div class="card-value">${fmtNum(weeklyAssignments)}</div><div class="card-sub">${weekStart} – ${weekEnd}</div></div>
  </div>
  ${unclassifiedAlert}
  <div class="bottom-grid" style="margin-top:16px;">
    <div class="section" style="grid-column:1/-1;">
      <div class="section-title">Inventario por Centro de Gestión</div>
      <div class="section-sub">${fmtNum(allCentros.length)} centros · Stock total: ${fmtCLP(totalStock)}</div>
      <div style="overflow-x:auto;max-height:320px;overflow-y:auto;">
        <table class="data-table">
          <thead><tr><th>#</th><th>Centro de Gestión</th><th style="text-align:right;">Stock Valorizado</th><th>Proporción</th><th style="text-align:center;">%</th></tr></thead>
          <tbody>${centrosTableRows}</tbody>
        </table>
      </div>
    </div>
  </div>
  <div class="bottom-grid">
    <div class="section">
      <div class="section-title">\ud83d\udd04 Excedentes por Obra</div>
      <div class="section-sub">Top ${topExcesos.length} obras · ${fmtCLP(totalExcedentes)} total</div>
      <table class="data-table"><thead><tr><th>Obra Origen</th><th style="text-align:right;">Valor</th></tr></thead><tbody>${excesosRows || '<tr><td colspan="2" style="padding:12px;text-align:center;color:#94a3b8;">Sin excedentes registrados</td></tr>'}</tbody></table>
    </div>
    <div class="section">
      <div class="section-title">\ud83d\udce4 Asignaciones Semana</div>
      <div class="section-sub">${weekStart} – ${weekEnd} · ${fmtNum(weeklyAssignments)} asignaciones · ${fmtCLP(weeklyValorizado)}</div>
      <table class="data-table"><thead><tr><th>Destino</th><th style="text-align:center;">Items</th><th style="text-align:right;">Valor</th></tr></thead><tbody>${asignRows || '<tr><td colspan="3" style="padding:12px;text-align:center;color:#94a3b8;">Sin asignaciones esta semana</td></tr>'}</tbody></table>
    </div>
    <div class="section">
      <div class="section-title">\ud83c\udff7\ufe0f Clasificación de Recursos</div>
      <div class="section-sub">${fmtNum(totalResources)} materiales en total</div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#f0fdf4;border-radius:10px;">
          <div style="display:flex;align-items:center;gap:8px;"><span style="font-size:18px;">\u2705</span><div><div style="font-size:13px;font-weight:600;color:#166534;">Inventariable</div><div style="font-size:11px;color:#64748b;">${fmtNum(inventariableCount)} recursos</div></div></div>
          <div style="font-size:15px;font-weight:800;color:#166534;">${fmtCLP(valorInventariable)}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#fff1f2;border-radius:10px;">
          <div style="display:flex;align-items:center;gap:8px;"><span style="font-size:18px;">\u274c</span><div><div style="font-size:13px;font-weight:600;color:#991b1b;">No Inventariable</div><div style="font-size:11px;color:#64748b;">${fmtNum(noInventariableCount)} recursos</div></div></div>
          <div style="font-size:15px;font-weight:800;color:#991b1b;">${fmtCLP(valorNoInventariable)}</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#f8fafc;border-radius:10px;">
          <div style="display:flex;align-items:center;gap:8px;"><span style="font-size:18px;">\u2753</span><div><div style="font-size:13px;font-weight:600;color:#64748b;">Sin Clasificar</div><div style="font-size:11px;color:#64748b;">${fmtNum(unclassifiedCount)} recursos</div></div></div>
          <div style="font-size:15px;font-weight:800;color:#64748b;">${fmtCLP(valorSinClasificar)}</div>
        </div>
      </div>
    </div>
  </div>
  <div style="text-align:center;color:#94a3b8;font-size:12px;margin-top:8px;padding-bottom:16px;">Panel Bodega — Generado automáticamente el ${dateStr} · Datos extraídos de iConstruye</div>
</main>
<script>
new Chart(document.getElementById('donutChart'), {
  type: 'doughnut',
  data: {
    labels: ['Inventariable', 'No Inventariable', 'Sin Clasificar'],
    datasets: [{ data: [${inventariableCount}, ${noInventariableCount}, ${unclassifiedCount}], backgroundColor: ['#10b981','#ef4444','#94a3b8'], borderWidth: 0, hoverOffset: 6 }]
  },
  options: { cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': ' + ctx.parsed } } } }
});
new Chart(document.getElementById('barChart'), {
  type: 'bar',
  data: {
    labels: ${chartLabels},
    datasets: [{ label: 'Stock Valorizado ($)', data: ${chartValues}, backgroundColor: 'rgba(26,107,114,0.75)', hoverBackgroundColor: '#1a6b72', borderRadius: 6, borderSkipped: false }]
  },
  options: {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' $' + ctx.parsed.x.toLocaleString('es-CL') } } },
    scales: {
      x: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 }, callback: val => '$' + (val/1000000).toFixed(1) + 'M' } },
      y: { grid: { display: false }, ticks: { font: { size: 11 } } }
    }
  }
});
<\/script>
</body>
</html>`;
}
