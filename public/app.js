(function(){
"use strict";

/* ---------- constantes ---------- */
var CAT_HEX = ['var(--cat-1)','var(--cat-2)','var(--cat-3)','var(--cat-4)','var(--cat-5)','var(--cat-6)','var(--cat-7)','var(--cat-8)'];
var MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
var MESES_LARGO = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

/* ---------- estado ---------- */
var state = {
  ready:false,
  online:false,
  isExample:false,
  currency:'$',
  expenseCategories: [],
  incomeCategories: [],
  transactions: [],
  budgets: {},
  goals: [],
  debts: [],
  categoryRules: [],
  accounts: []
};
var currentView = 'dashboard';
var txFilters = { type:'all', category:'all', account:'all', month:'', q:'' };

/* ---------- utilidades dom ---------- */
function $(sel, root){ return (root||document).querySelector(sel); }
function $all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
function el(tag, attrs, children){
  var e = document.createElement(tag);
  if(attrs) for(var k in attrs){
    if(k === 'text') e.textContent = attrs[k];
    else if(k === 'html') e.innerHTML = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  (children||[]).forEach(function(c){ if(c) e.appendChild(c); });
  return e;
}
function svg(tag, attrs){
  var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for(var k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function todayStr(){ return new Date().toISOString().slice(0,10); }
function fmtMoney(n){
  n = Number(n)||0;
  var neg = n < -0.004;
  var abs = Math.abs(n);
  var str = abs.toLocaleString('es-ES', {minimumFractionDigits:2, maximumFractionDigits:2});
  return (neg?'-':'') + state.currency + str;
}
function fmtCompact(n){
  var abs = Math.abs(n);
  if(abs >= 1000000) return (n/1000000).toFixed(1).replace('.0','') + 'M';
  if(abs >= 1000) return (n/1000).toFixed(1).replace('.0','') + 'k';
  return String(Math.round(n));
}
function monthKey(dateStr){ return dateStr.slice(0,7); }
function monthLabel(key){ var p = key.split('-'); return MESES[parseInt(p[1],10)-1] + " '" + p[0].slice(2); }
function lastNMonthKeys(n){
  var out = []; var d = new Date(); d.setDate(1);
  for(var i=n-1;i>=0;i--){
    var dd = new Date(d.getFullYear(), d.getMonth()-i, 1);
    out.push(dd.getFullYear() + '-' + String(dd.getMonth()+1).padStart(2,'0'));
  }
  return out;
}
function catColor(name, type){
  var list = type === 'income' ? state.incomeCategories : state.expenseCategories;
  var idx = list.indexOf(name);
  if(idx < 0) idx = list.length;
  return CAT_HEX[idx % 8];
}
function debounce(fn, ms){ var t; return function(){ var a=arguments; clearTimeout(t); t=setTimeout(function(){ fn.apply(null,a); }, ms); }; }

/* ---------- capa API ---------- */
async function apiFetch(url, opts){
  var res = await fetch(url, opts);
  if(!res.ok){
    var msg = 'Error de red';
    try{ var j = await res.json(); msg = j.error || msg; }catch(e){}
    throw new Error(msg);
  }
  if(res.status === 204) return null;
  var ct = res.headers.get('content-type') || '';
  return ct.indexOf('application/json') > -1 ? res.json() : null;
}
var JSON_HEADERS = {'Content-Type':'application/json'};

async function refresh(){
  var data = await apiFetch('/api/state');
  Object.assign(state, data);
  state.ready = true;
  state.online = true;
  setOffline(false);
  renderAll();
}
function setOffline(isOffline){
  $('#offlineBanner').hidden = !isOffline;
  var chip = $('#modeChip'), chipText = $('#modeChipText');
  chip.className = 'mode-chip' + (isOffline ? ' offline' : '');
  chipText.textContent = isOffline ? 'Sin conexión con el servidor' : 'Guardado en esta PC';
}
async function withRefresh(promise){
  try{ await promise; await refresh(); }
  catch(e){ setOffline(true); throw e; }
}
async function ensureRealData(){
  if(state.isExample){
    await apiFetch('/api/clear-examples', {method:'POST'});
    state.isExample = false;
  }
}

/* ---------- CRUD ---------- */
function addTransaction(data){ return withRefresh(ensureRealData().then(function(){ return apiFetch('/api/transactions', {method:'POST', headers:JSON_HEADERS, body:JSON.stringify(data)}); })); }
function updateTransaction(id, data){ return withRefresh(apiFetch('/api/transactions/'+encodeURIComponent(id), {method:'PUT', headers:JSON_HEADERS, body:JSON.stringify(data)})); }
function deleteTransaction(id){ return withRefresh(apiFetch('/api/transactions/'+encodeURIComponent(id), {method:'DELETE'})); }
function setBudget(category, limit){ return withRefresh(ensureRealData().then(function(){ return apiFetch('/api/budgets/'+encodeURIComponent(category), {method:'PUT', headers:JSON_HEADERS, body:JSON.stringify({limit:limit})}); })); }
function removeBudget(category){ return withRefresh(apiFetch('/api/budgets/'+encodeURIComponent(category), {method:'DELETE'})); }
function addGoal(data){ return withRefresh(ensureRealData().then(function(){ return apiFetch('/api/goals', {method:'POST', headers:JSON_HEADERS, body:JSON.stringify(data)}); })); }
function updateGoal(id, data){ return withRefresh(apiFetch('/api/goals/'+encodeURIComponent(id), {method:'PUT', headers:JSON_HEADERS, body:JSON.stringify(data)})); }
function deleteGoal(id){ return withRefresh(apiFetch('/api/goals/'+encodeURIComponent(id), {method:'DELETE'})); }
function addAccount(data){ return withRefresh(apiFetch('/api/accounts', {method:'POST', headers:JSON_HEADERS, body:JSON.stringify(data)})); }
function updateAccount(id, data){ return withRefresh(apiFetch('/api/accounts/'+encodeURIComponent(id), {method:'PUT', headers:JSON_HEADERS, body:JSON.stringify(data)})); }
function deleteAccount(id){ return withRefresh(apiFetch('/api/accounts/'+encodeURIComponent(id), {method:'DELETE'})); }
function addDebt(data){ return withRefresh(ensureRealData().then(function(){ return apiFetch('/api/debts', {method:'POST', headers:JSON_HEADERS, body:JSON.stringify(data)}); })); }
function updateDebt(id, data){ return withRefresh(apiFetch('/api/debts/'+encodeURIComponent(id), {method:'PUT', headers:JSON_HEADERS, body:JSON.stringify(data)})); }
function deleteDebt(id){ return withRefresh(apiFetch('/api/debts/'+encodeURIComponent(id), {method:'DELETE'})); }
function saveSettings(partial){ return withRefresh(apiFetch('/api/settings', {method:'PUT', headers:JSON_HEADERS, body:JSON.stringify(partial)})); }
function clearExamples(){ return withRefresh(apiFetch('/api/clear-examples', {method:'POST'})); }
function wipeAll(){ return withRefresh(apiFetch('/api/wipe', {method:'POST'})); }
function addCategoryRule(keyword, category){ return withRefresh(apiFetch('/api/category-rules', {method:'POST', headers:JSON_HEADERS, body:JSON.stringify({keyword:keyword, category:category})})); }
function deleteCategoryRule(id){ return withRefresh(apiFetch('/api/category-rules/'+encodeURIComponent(id), {method:'DELETE'})); }
function applyRulesToExisting(){ return withRefresh(apiFetch('/api/transactions/apply-rules', {method:'POST'})); }
function resolveCategoryForDescription(description){
  var desc = (description||'').toLowerCase();
  for(var i=0;i<state.categoryRules.length;i++){
    var r = state.categoryRules[i];
    if(r.keyword && desc.indexOf(r.keyword.toLowerCase()) > -1) return r.category;
  }
  return null;
}

/* ---------- cálculos ---------- */
function txInMonth(key){ return state.transactions.filter(function(t){ return monthKey(t.date) === key; }); }
function sumByType(txs, type){ return txs.filter(function(t){ return t.type===type; }).reduce(function(a,t){ return a+Number(t.amount); }, 0); }
function allTimeBalance(){ return state.transactions.reduce(function(a,t){ return a + (t.type==='income'? Number(t.amount) : -Number(t.amount)); }, 0); }
function totalInAccounts(){ return state.accounts.reduce(function(a,acc){ return a+Number(acc.balance); }, 0); }
function totalDebt(){ return state.debts.filter(function(d){ return d.kind==='debt'; }).reduce(function(a,d){ return a+Number(d.balance); }, 0); }
function netWorth(){ return totalInAccounts() - totalDebt(); }
function accountName(id){ var a = state.accounts.find(function(x){ return x.id===id; }); return a ? a.name : 'Sin cuenta'; }
function balanceUpTo(key){
  return state.transactions.filter(function(t){ return monthKey(t.date) <= key; })
    .reduce(function(a,t){ return a + (t.type==='income'? Number(t.amount) : -Number(t.amount)); }, 0);
}
function debtStatus(dd){
  if(dd.kind !== 'debt' || !dd.dueDay) return {level:'neutral', label: dd.kind==='account' ? 'Cuenta' : 'Sin vencimiento'};
  var today = new Date();
  if(dd.lastPaymentDate){
    var daysSincePaid = Math.floor((today - new Date(dd.lastPaymentDate + 'T00:00:00')) / 86400000);
    if(daysSincePaid >= 0 && daysSincePaid < 25) return {level:'good', label:'Pagado — al día'};
  }
  var day = today.getDate();
  var diff = dd.dueDay - day;
  if(day > dd.dueDay) diff = (dd.dueDay + 30) - day;
  if(diff <= 0) return {level:'critical', label:'Vencida'};
  if(diff <= 5) return {level:'warning', label:'Vence en ' + diff + ' d.'};
  return {level:'good', label:'Al día'};
}
function budgetStatus(spent, limit){
  if(!limit) return {level:'neutral', ratio:0};
  var ratio = spent/limit;
  if(ratio >= 1) return {level:'critical', ratio:ratio};
  if(ratio >= 0.8) return {level:'warning', ratio:ratio};
  return {level:'good', ratio:ratio};
}

/* ---------- render: shell ---------- */
function switchView(name){
  currentView = name;
  $all('.view').forEach(function(v){ v.hidden = true; });
  $('#view-' + name).hidden = false;
  $all('#nav button').forEach(function(b){ b.classList.toggle('active', b.dataset.view === name); });
  var titles = {
    dashboard: ['Resumen', 'Tu situación financiera de un vistazo'],
    transactions: ['Movimientos', 'Todos tus ingresos y gastos'],
    accounts: ['Cuentas', 'Dónde vive tu plata: bancos, efectivo y ahorros'],
    budgets: ['Presupuestos', 'Cuánto planeaste gastar por categoría este mes'],
    goals: ['Metas de ahorro', 'Lo que estás juntando y cuánto falta'],
    debts: ['Deudas', 'Tarjetas y préstamos pendientes'],
    analysis: ['Análisis', 'Tendencias, comparativas y reportes'],
    settings: ['Ajustes', 'Moneda, categorías y datos']
  };
  $('#viewTitle').textContent = titles[name][0];
  $('#viewSub').textContent = titles[name][1];
  renderCurrentView();
}
function renderAll(){
  $('#exampleBanner').hidden = !state.isExample;
  $('#sidebarBalance').innerHTML = 'Patrimonio neto: <strong class="mono">' + fmtMoney(netWorth()) + '</strong>';
  if(!state.ready) return;
  renderCurrentView();
}
function renderCurrentView(){
  if(!state.ready) return;
  ({
    dashboard: renderDashboard,
    transactions: renderTransactions,
    accounts: renderAccounts,
    budgets: renderBudgets,
    goals: renderGoals,
    debts: renderDebts,
    analysis: renderAnalysis,
    settings: renderSettings
  })[currentView]();
}

/* ---------- charts (SVG) ---------- */
function lineChart(points, opts){
  opts = opts || {};
  var w = 560, h = 200, padL = 44, padR = 16, padT = 16, padB = 26;
  var innerW = w - padL - padR, innerH = h - padT - padB;
  var vals = points.map(function(p){ return p.value; });
  var max = Math.max.apply(null, vals.concat([0]));
  var min = Math.min.apply(null, vals.concat([0]));
  if(max === min){ max += 1; min -= 1; }
  var range = max - min;
  function x(i){ return padL + (innerW * i) / (points.length - 1 || 1); }
  function y(v){ return padT + innerH - ((v - min) / range) * innerH; }

  var s = svg('svg', {viewBox:'0 0 ' + w + ' ' + h, width:'100%', role:'img', 'aria-label': opts.label||'Gráfico de línea'});

  [0, 0.5, 1].forEach(function(f){
    var vy = padT + innerH * f;
    s.appendChild(svg('line', {x1:padL, x2:w-padR, y1:vy, y2:vy, class:'chart-grid'}));
    var val = max - range*f;
    var t = svg('text', {x:padL-8, y:vy+4, class:'chart-tick', 'text-anchor':'end'});
    t.textContent = fmtCompact(val);
    s.appendChild(t);
  });

  var zeroY = y(0);
  if(zeroY >= padT && zeroY <= padT+innerH){
    s.appendChild(svg('line', {x1:padL, x2:w-padR, y1:zeroY, y2:zeroY, class:'chart-baseline'}));
  }

  var dPath = 'M' + points.map(function(p,i){ return x(i)+','+y(p.value); }).join(' L');
  var aPath = dPath + ' L' + x(points.length-1) + ',' + y(min<0?0:min) + ' L' + x(0) + ',' + y(min<0?0:min) + ' Z';
  s.appendChild(svg('path', {d:aPath, class:'chart-area'}));
  s.appendChild(svg('path', {d:dPath, class:'chart-line', fill:'none'}));

  points.forEach(function(p,i){
    var t = svg('text', {x:x(i), y:h-4, class:'chart-tick', 'text-anchor':'middle'});
    t.textContent = p.label;
    s.appendChild(t);
  });

  var lastX = x(points.length-1), lastY = y(points[points.length-1].value);
  s.appendChild(svg('circle', {cx:lastX, cy:lastY, r:5, class:'chart-end-ring'}));
  s.appendChild(svg('circle', {cx:lastX, cy:lastY, r:3.5, class:'chart-end-dot'}));
  var lbl = svg('text', {x:lastX, y: lastY - 12, class:'chart-endlabel', 'text-anchor': points.length>1 ? 'end' : 'middle'});
  lbl.textContent = fmtMoney(points[points.length-1].value);
  s.appendChild(lbl);
  return s;
}

function groupedBarChart(rows, opts){
  opts = opts || {};
  var w = 560, h = 220, padL = 44, padR = 16, padT = 16, padB = 30;
  var innerW = w-padL-padR, innerH = h-padT-padB;
  var max = Math.max.apply(null, rows.reduce(function(a,r){ return a.concat([r.a,r.b]); }, [0]));
  if(max === 0) max = 1;
  var groupW = innerW / rows.length;
  var barW = Math.min(24, groupW*0.32);
  var gap = 3;
  var s = svg('svg', {viewBox:'0 0 '+w+' '+h, width:'100%', role:'img', 'aria-label': opts.label||'Gráfico de barras'});

  [0,0.5,1].forEach(function(f){
    var vy = padT + innerH*(1-f);
    s.appendChild(svg('line', {x1:padL, x2:w-padR, y1:vy, y2:vy, class:'chart-grid'}));
    var t = svg('text', {x:padL-8, y:vy+4, class:'chart-tick', 'text-anchor':'end'});
    t.textContent = fmtCompact(max*f);
    s.appendChild(t);
  });
  s.appendChild(svg('line', {x1:padL, x2:w-padR, y1:padT+innerH, y2:padT+innerH, class:'chart-baseline'}));

  rows.forEach(function(r, i){
    var cx = padL + groupW*i + groupW/2;
    var ha = (r.a/max)*innerH, hb = (r.b/max)*innerH;
    var xa = cx - gap/2 - barW, xb = cx + gap/2;
    s.appendChild(svg('rect', {x:xa, y:padT+innerH-ha, width:barW, height:Math.max(ha,1), rx:4, class:'bar-income'}));
    s.appendChild(svg('rect', {x:xb, y:padT+innerH-hb, width:barW, height:Math.max(hb,1), rx:4, class:'bar-expense'}));
    if(i === rows.length-1){
      var la = svg('text', {x:xa+barW/2, y:padT+innerH-ha-6, class:'chart-tick', 'text-anchor':'middle'}); la.textContent = fmtCompact(r.a); s.appendChild(la);
      var lb = svg('text', {x:xb+barW/2, y:padT+innerH-hb-6, class:'chart-tick', 'text-anchor':'middle'}); lb.textContent = fmtCompact(r.b); s.appendChild(lb);
    }
    var t = svg('text', {x:cx, y:h-8, class:'chart-tick', 'text-anchor':'middle'}); t.textContent = r.label; s.appendChild(t);
  });
  return s;
}

function donutChart(segments, opts){
  opts = opts || {};
  var size = 200, r = 72, cx = size/2, cy = size/2, sw = 26;
  var total = segments.reduce(function(a,s){ return a+s.value; }, 0) || 1;
  var c = 2*Math.PI*r;
  var s = svg('svg', {viewBox:'0 0 '+size+' '+size, width:'200', height:'200', role:'img', 'aria-label': opts.label||'Gráfico de distribución'});
  var g = svg('g', {transform:'rotate(-90 '+cx+' '+cy+')'});
  s.appendChild(svg('circle', {cx:cx, cy:cy, r:r, fill:'none', stroke:'var(--grid)', 'stroke-width':sw}));
  var acc = 0;
  segments.forEach(function(seg){
    var len = (seg.value/total)*c;
    var gap = Math.min(2, len*0.06);
    var circ = svg('circle', {
      cx:cx, cy:cy, r:r, fill:'none', stroke: seg.color, 'stroke-width':sw,
      'stroke-dasharray': Math.max(len-gap,0) + ' ' + (c-len+gap),
      'stroke-dashoffset': -acc
    });
    g.appendChild(circ);
    acc += len;
  });
  s.appendChild(g);
  var t1 = svg('text', {x:cx, y:cy-4, 'text-anchor':'middle', class:'donut-total'}); t1.textContent = fmtMoney(total);
  var t2 = svg('text', {x:cx, y:cy+15, 'text-anchor':'middle', class:'donut-sub'}); t2.textContent = opts.sub || '';
  s.appendChild(t1); s.appendChild(t2);
  return s;
}

var chartStyleInjected = false;
function ensureChartStyles(){
  if(chartStyleInjected) return; chartStyleInjected = true;
  var css = '.chart-grid{stroke:var(--grid);stroke-width:1}' +
    '.chart-baseline{stroke:var(--baseline);stroke-width:1}' +
    '.chart-tick{fill:var(--muted);font-size:10px;font-family:"IBM Plex Mono",monospace}' +
    '.chart-area{fill:var(--accent);opacity:.1}' +
    '.chart-line{stroke:var(--accent);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
    '.chart-end-ring{fill:var(--surface)}' +
    '.chart-end-dot{fill:var(--accent)}' +
    '.chart-endlabel{fill:var(--ink);font-size:12px;font-weight:600;font-family:"IBM Plex Sans",sans-serif}' +
    '.bar-income{fill:var(--status-good)}' +
    '.bar-expense{fill:var(--status-critical)}' +
    '.donut-total{fill:var(--ink);font-size:17px;font-weight:600;font-family:"IBM Plex Sans",sans-serif}' +
    '.donut-sub{fill:var(--ink-secondary);font-size:10.5px;font-family:"IBM Plex Sans",sans-serif}';
  document.head.appendChild(el('style', {text:css}));
}

/* ---------- render: dashboard ---------- */
function renderDashboard(){
  ensureChartStyles();
  var root = $('#view-dashboard'); root.innerHTML = '';
  var now = new Date();
  var curKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  var prevD = new Date(now.getFullYear(), now.getMonth()-1, 1);
  var prevKey = prevD.getFullYear() + '-' + String(prevD.getMonth()+1).padStart(2,'0');
  var curTx = txInMonth(curKey), prevTx = txInMonth(prevKey);
  var curInc = sumByType(curTx,'income'), curExp = sumByType(curTx,'expense');
  var prevInc = sumByType(prevTx,'income'), prevExp = sumByType(prevTx,'expense');
  var curSaving = curInc - curExp, prevSaving = prevInc - prevExp;

  var tiles = el('div', {class:'tiles'});
  function tile(label, value, delta, deltaUp, sub){
    var d = null;
    if(delta !== null && delta !== undefined && isFinite(delta)){
      d = el('div', {class:'delta ' + (deltaUp?'up':'down')}, [
        el('span', {class:'arrow', text: deltaUp?'↑':'↓'}),
        el('span', {text: Math.abs(delta).toFixed(0) + '% vs mes anterior'})
      ]);
    }
    return el('div', {class:'tile'}, [
      el('div', {class:'label', text:label}),
      el('div', {class:'value mono', text: fmtMoney(value)}),
      sub ? el('div', {class:'bar-sub', text:sub}) : d
    ]);
  }
  var pct = function(cur, prev){ if(!prev) return null; return ((cur-prev)/Math.abs(prev))*100; };
  tiles.appendChild(tile('Patrimonio neto', netWorth(), null, null, 'Cuentas ' + fmtMoney(totalInAccounts()) + ' · Deudas ' + fmtMoney(totalDebt())));
  tiles.appendChild(tile('Ingresos de ' + MESES_LARGO[now.getMonth()], curInc, pct(curInc,prevInc), curInc>=prevInc));
  tiles.appendChild(tile('Gastos de ' + MESES_LARGO[now.getMonth()], curExp, pct(curExp,prevExp), curExp<=prevExp));
  tiles.appendChild(tile('Ahorro de ' + MESES_LARGO[now.getMonth()], curSaving, pct(curSaving,prevSaving), curSaving>=prevSaving));
  root.appendChild(tiles);

  var grid = el('div', {class:'grid-2'});
  var months = lastNMonthKeys(6);
  var trendCard = el('div', {class:'card'}, [ el('h3', {text:'Balance acumulado — últimos 6 meses'}) ]);
  trendCard.appendChild(lineChart(months.map(function(k){ return {label:monthLabel(k), value: balanceUpTo(k)}; }), {label:'Balance acumulado'}));
  grid.appendChild(trendCard);

  var catTotals = {};
  curTx.filter(function(t){ return t.type==='expense'; }).forEach(function(t){ catTotals[t.category] = (catTotals[t.category]||0) + Number(t.amount); });
  var segs = Object.keys(catTotals).map(function(c){ return {name:c, value:catTotals[c], color:catColor(c,'expense')}; }).sort(function(a,b){ return b.value-a.value; });
  var donutCard = el('div', {class:'card'}, [ el('h3', {text:'Gastos por categoría — ' + MESES_LARGO[now.getMonth()]}) ]);
  if(segs.length){
    var wrap = el('div', {style:'display:flex;gap:20px;align-items:center;flex-wrap:wrap'});
    wrap.appendChild(donutChart(segs, {sub:MESES_LARGO[now.getMonth()]}));
    var total = segs.reduce(function(a,s){return a+s.value;},0);
    var legend = el('div', {class:'legend', style:'flex:1;min-width:160px'});
    segs.forEach(function(s){
      legend.appendChild(el('div', {class:'legend-row'}, [
        el('span', {class:'cat-dot', style:'background:'+s.color}),
        el('span', {class:'name', text:s.name}),
        el('span', {class:'pct', text: Math.round(s.value/total*100)+'%'}),
        el('span', {class:'amt mono', text: fmtMoney(s.value)})
      ]));
    });
    wrap.appendChild(legend);
    donutCard.appendChild(wrap);
  } else {
    donutCard.appendChild(el('div', {class:'empty', html:'<strong>Sin gastos este mes</strong>Agregá un movimiento para ver el detalle.'}));
  }
  grid.appendChild(donutCard);
  root.appendChild(grid);

  var grid3 = el('div', {class:'grid-3'});

  var budCard = el('div', {class:'card'}, [ el('h3', {text:'Presupuestos del mes'}) ]);
  var budCats = Object.keys(state.budgets);
  if(budCats.length){
    budCats.slice(0,4).forEach(function(cat){
      var spent = curTx.filter(function(t){ return t.type==='expense' && t.category===cat; }).reduce(function(a,t){return a+Number(t.amount);},0);
      var limit = state.budgets[cat];
      var st = budgetStatus(spent, limit);
      budCard.appendChild(budgetBar(cat, spent, limit, st));
    });
  } else {
    budCard.appendChild(el('div', {class:'empty', html:'<strong>Sin presupuestos</strong>Definí límites por categoría.'}));
  }
  grid3.appendChild(budCard);

  var goalCard = el('div', {class:'card'}, [ el('h3', {text:'Metas de ahorro'}) ]);
  if(state.goals.length){
    state.goals.slice(0,3).forEach(function(g){ goalCard.appendChild(goalBar(g)); });
  } else {
    goalCard.appendChild(el('div', {class:'empty', html:'<strong>Sin metas</strong>Definí un objetivo de ahorro.'}));
  }
  grid3.appendChild(goalCard);

  var debtCard = el('div', {class:'card'}, [ el('h3', {text:'Próximos vencimientos'}) ]);
  var debtsWithDue = state.debts.filter(function(d){ return d.kind==='debt'; });
  if(debtsWithDue.length){
    debtsWithDue.forEach(function(dd){
      var st = debtStatus(dd);
      debtCard.appendChild(el('div', {class:'bar-row', style:'margin-bottom:10px'}, [
        el('div', {class:'bar-head'}, [
          el('span', {class:'name', text:dd.name}),
          statusChip(st.level, st.label)
        ]),
        el('div', {class:'bar-sub mono', text:'Saldo ' + fmtMoney(dd.balance) + ' · mín. ' + fmtMoney(dd.minPayment||0)})
      ]));
    });
  } else {
    debtCard.appendChild(el('div', {class:'empty', html:'<strong>Sin deudas cargadas</strong>Agregá tarjetas o préstamos.'}));
  }
  grid3.appendChild(debtCard);

  root.appendChild(grid3);
}

function statusChip(level, label){
  var cls = { good:'chip-good', warning:'chip-warning', critical:'chip-critical', neutral:'chip-neutral' }[level] || 'chip-neutral';
  return el('span', {class:'chip '+cls}, [ el('span', {class:'dot'}), el('span', {text:label}) ]);
}
function budgetBar(cat, spent, limit, st){
  var ratio = limit ? Math.min(spent/limit,1) : 0;
  var fillColor = st.level==='critical' ? 'var(--status-critical)' : catColor(cat,'expense');
  return el('div', {class:'bar-row', style:'margin-bottom:12px'}, [
    el('div', {class:'bar-head'}, [
      el('span', {class:'name'}, [ el('span', {class:'cat-dot', style:'background:'+catColor(cat,'expense')}), document.createTextNode(cat) ]),
      statusChip(st.level, st.level==='critical' ? 'Excedido' : st.level==='warning' ? 'Cerca del límite' : 'Al día')
    ]),
    el('div', {class:'bar-track'}, [ el('div', {class:'bar-fill', style:'width:'+(ratio*100)+'%;background:'+fillColor}) ]),
    el('div', {class:'bar-sub mono', text: fmtMoney(spent) + ' de ' + fmtMoney(limit)})
  ]);
}
function goalBar(g){
  var ratio = g.target ? Math.min(g.current/g.target,1) : 0;
  var done = g.current >= g.target;
  return el('div', {class:'bar-row', style:'margin-bottom:12px'}, [
    el('div', {class:'bar-head'}, [
      el('span', {class:'name', text:g.name}),
      done ? statusChip('good','Completada') : el('span', {class:'bar-sub', text:Math.round(ratio*100)+'%'})
    ]),
    el('div', {class:'bar-track'}, [ el('div', {class:'bar-fill', style:'width:'+(ratio*100)+'%;background:var(--accent)'}) ]),
    el('div', {class:'bar-sub mono', text: fmtMoney(g.current) + ' de ' + fmtMoney(g.target)})
  ]);
}

/* ---------- render: transactions ---------- */
function renderTransactions(){
  var root = $('#view-transactions'); root.innerHTML = '';
  var card = el('div', {class:'card'});

  var filters = el('div', {class:'filters'});
  var typeSel = el('select', {}, []);
  [['all','Todos'],['income','Ingresos'],['expense','Gastos'],['transfer','Transferencias']].forEach(function(o){
    var opt = el('option', {value:o[0], text:o[1]}); if(o[0]===txFilters.type) opt.selected=true; typeSel.appendChild(opt);
  });
  typeSel.addEventListener('change', function(){ txFilters.type = typeSel.value; renderTransactions(); });

  var catSel = el('select', {}, []);
  var allCats = Array.from(new Set(state.expenseCategories.concat(state.incomeCategories)));
  catSel.appendChild(el('option', {value:'all', text:'Todas las categorías'}));
  allCats.forEach(function(c){ var opt = el('option', {value:c, text:c}); if(c===txFilters.category) opt.selected=true; catSel.appendChild(opt); });
  catSel.addEventListener('change', function(){ txFilters.category = catSel.value; renderTransactions(); });

  var acctSel = el('select', {}, []);
  acctSel.appendChild(el('option', {value:'all', text:'Todas las cuentas'}));
  state.accounts.forEach(function(a){ var opt = el('option', {value:a.id, text:a.name}); if(a.id===txFilters.account) opt.selected=true; acctSel.appendChild(opt); });
  acctSel.addEventListener('change', function(){ txFilters.account = acctSel.value; renderTransactions(); });

  var monthInp = el('input', {type:'month', value:txFilters.month});
  monthInp.addEventListener('change', function(){ txFilters.month = monthInp.value; renderTransactions(); });

  var qInp = el('input', {type:'text', placeholder:'Buscar descripción…', value:txFilters.q});
  qInp.addEventListener('input', debounce(function(){ txFilters.q = qInp.value; renderTransactions(); }, 200));

  filters.appendChild(el('div', {class:'field'}, [el('label', {text:'Tipo'}), typeSel]));
  filters.appendChild(el('div', {class:'field'}, [el('label', {text:'Categoría'}), catSel]));
  filters.appendChild(el('div', {class:'field'}, [el('label', {text:'Cuenta'}), acctSel]));
  filters.appendChild(el('div', {class:'field'}, [el('label', {text:'Mes'}), monthInp]));
  filters.appendChild(el('div', {class:'field'}, [el('label', {text:'Buscar'}), qInp]));
  var exportBtn = el('a', {class:'btn btn-ghost btn-small', text:'Exportar CSV', href:'/api/export/transactions.csv'});
  var importBtn = el('button', {class:'btn btn-ghost btn-small', text:'Importar extracto (CSV)'});
  importBtn.addEventListener('click', function(){ openImportPanel(); });
  filters.appendChild(el('div', {class:'field'}, [el('label', {html:'&nbsp;'}), exportBtn]));
  filters.appendChild(el('div', {class:'field'}, [el('label', {html:'&nbsp;'}), importBtn]));
  card.appendChild(filters);

  var rows = state.transactions.filter(function(t){
    if(txFilters.type !== 'all' && t.type !== txFilters.type) return false;
    if(txFilters.category !== 'all' && t.category !== txFilters.category) return false;
    if(txFilters.account !== 'all' && t.accountId !== txFilters.account) return false;
    if(txFilters.month && monthKey(t.date) !== txFilters.month) return false;
    if(txFilters.q && (t.description||'').toLowerCase().indexOf(txFilters.q.toLowerCase()) === -1) return false;
    return true;
  }).sort(function(a,b){ return b.date.localeCompare(a.date); });

  if(!rows.length){
    card.appendChild(el('div', {class:'empty', html:'<strong>No hay movimientos</strong>Probá cambiar los filtros o agregá el primero.'}));
  } else {
    var scroll = el('div', {class:'table-scroll'});
    var table = el('table');
    table.appendChild(el('thead', {}, [ el('tr', {}, [
      el('th', {text:'Fecha'}), el('th', {text:'Categoría'}), el('th', {text:'Cuenta'}), el('th', {text:'Descripción'}),
      el('th', {class:'amount', text:'Monto'}), el('th', {text:''})
    ]) ]));
    var tbody = el('tbody');
    rows.forEach(function(t){
      var tr = el('tr');
      tr.appendChild(el('td', {class:'mono', text: t.date}));
      tr.appendChild(el('td', {}, [ el('span', {class:'cat-tag'}, [ el('span', {class:'cat-dot', style:'background:'+catColor(t.category,t.type)}), document.createTextNode(t.category) ]) ]));
      tr.appendChild(el('td', {text: t.accountId ? accountName(t.accountId) : '—'}));
      tr.appendChild(el('td', {text: t.description || '—'}));
      tr.appendChild(el('td', {class:'amount mono ' + t.type, text: (t.type==='income'?'+':'-') + fmtMoney(t.amount).replace('-','')}));
      var actions = el('td', {}, [ el('div', {class:'row-actions'}, [
        (function(){ var b = el('button', {class:'icon-btn', text:'Editar'}); b.addEventListener('click', function(){ openTxPanel(t); }); return b; })(),
        (function(){ var b = el('button', {class:'icon-btn', text:'Eliminar'}); b.addEventListener('click', function(){ if(confirm('¿Eliminar este movimiento?')) deleteTransaction(t.id); }); return b; })()
      ]) ]);
      tr.appendChild(actions);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    scroll.appendChild(table);
    card.appendChild(scroll);
  }
  root.appendChild(card);
}

/* ---------- render: budgets ---------- */
function renderBudgets(){
  var root = $('#view-budgets'); root.innerHTML = '';
  var now = new Date();
  var curKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  var curTx = txInMonth(curKey);

  var card = el('div', {class:'card'}, [ el('h3', {text:'Presupuestos de ' + MESES_LARGO[now.getMonth()]}) ]);
  var cats = state.expenseCategories.slice();
  cats.forEach(function(cat){
    var spent = curTx.filter(function(t){ return t.type==='expense' && t.category===cat; }).reduce(function(a,t){return a+Number(t.amount);},0);
    var limit = state.budgets[cat];
    var row = el('div', {class:'bar-row', style:'margin-bottom:16px'});
    var head = el('div', {class:'bar-head'}, [
      el('span', {class:'name'}, [ el('span', {class:'cat-dot', style:'background:'+catColor(cat,'expense')}), document.createTextNode(cat) ])
    ]);
    if(limit){
      var st = budgetStatus(spent, limit);
      head.appendChild(statusChip(st.level, st.level==='critical'?'Excedido':st.level==='warning'?'Cerca del límite':'Al día'));
    }
    row.appendChild(head);
    if(limit){
      var ratio = Math.min(spent/limit,1);
      var st2 = budgetStatus(spent, limit);
      var fillColor = st2.level==='critical' ? 'var(--status-critical)' : catColor(cat,'expense');
      row.appendChild(el('div', {class:'bar-track'}, [ el('div', {class:'bar-fill', style:'width:'+(ratio*100)+'%;background:'+fillColor}) ]));
      row.appendChild(el('div', {class:'bar-sub mono', text: fmtMoney(spent) + ' de ' + fmtMoney(limit)}));
    } else {
      row.appendChild(el('div', {class:'bar-sub', text:'Sin límite definido — gastado hasta ahora: ' + fmtMoney(spent)}));
    }
    var editRow = el('div', {style:'display:flex;gap:8px;margin-top:8px;align-items:center'});
    var inp = el('input', {type:'number', min:'0', step:'1', placeholder:'Límite mensual', value: limit||'', style:'width:150px'});
    var saveBtn = el('button', {class:'btn btn-ghost btn-small', text:'Guardar'});
    saveBtn.addEventListener('click', function(){
      var v = parseFloat(inp.value);
      if(v > 0) setBudget(cat, v); else removeBudget(cat);
    });
    editRow.appendChild(inp); editRow.appendChild(saveBtn);
    row.appendChild(editRow);
    card.appendChild(row);
  });
  root.appendChild(card);
}

/* ---------- render: goals ---------- */
function renderGoals(){
  var root = $('#view-goals'); root.innerHTML = '';
  var addBtn = el('button', {class:'btn btn-primary btn-small', text:'+ Nueva meta'});
  addBtn.addEventListener('click', function(){ openGoalPanel(); });
  root.appendChild(el('div', {style:'display:flex;justify-content:flex-end'}, [addBtn]));

  if(!state.goals.length){
    root.appendChild(el('div', {class:'empty', html:'<strong>Todavía no tenés metas</strong>Definí un objetivo de ahorro, por ejemplo un fondo de emergencia.'}));
    return;
  }
  var list = el('div', {class:'card-list'});
  state.goals.forEach(function(g){
    var ratio = g.target ? Math.min(g.current/g.target,1) : 0;
    var done = g.current >= g.target;
    var card = el('div', {class:'goal-card'});
    card.appendChild(el('div', {style:'display:flex;justify-content:space-between;align-items:start'}, [
      el('h4', {text:g.name}),
      done ? statusChip('good','Completada') : null
    ]));
    card.appendChild(el('div', {class:'bar-track'}, [ el('div', {class:'bar-fill', style:'width:'+(ratio*100)+'%;background:var(--accent)'}) ]));
    card.appendChild(el('div', {class:'bar-sub mono', text: fmtMoney(g.current) + ' de ' + fmtMoney(g.target) + ' (' + Math.round(ratio*100) + '%)'}));
    if(g.targetDate) card.appendChild(el('div', {class:'bar-sub', text:'Fecha objetivo: ' + g.targetDate}));
    var actions = el('div', {style:'display:flex;gap:8px;margin-top:4px'});
    var addFundsBtn = el('button', {class:'btn btn-ghost btn-small', text:'Agregar ahorro'});
    addFundsBtn.addEventListener('click', function(){
      var v = prompt('¿Cuánto querés agregar a "' + g.name + '"?', '50');
      if(v === null) return;
      var n = parseFloat(v);
      if(n > 0) updateGoal(g.id, {current: Number(g.current)+n});
    });
    var editBtn = el('button', {class:'btn btn-ghost btn-small', text:'Editar'});
    editBtn.addEventListener('click', function(){ openGoalPanel(g); });
    var delBtn = el('button', {class:'btn btn-danger btn-small', text:'Eliminar'});
    delBtn.addEventListener('click', function(){ if(confirm('¿Eliminar esta meta?')) deleteGoal(g.id); });
    actions.appendChild(addFundsBtn); actions.appendChild(editBtn); actions.appendChild(delBtn);
    card.appendChild(actions);
    list.appendChild(card);
  });
  root.appendChild(list);
}

/* ---------- render: accounts ---------- */
var ACCOUNT_KIND_LABEL = {banco:'Banco', efectivo:'Efectivo', ahorros:'Ahorros', otra:'Otra'};
function renderAccounts(){
  var root = $('#view-accounts'); root.innerHTML = '';
  var addBtn = el('button', {class:'btn btn-primary btn-small', text:'+ Nueva cuenta'});
  addBtn.addEventListener('click', function(){ openAccountPanel(); });
  root.appendChild(el('div', {style:'display:flex;justify-content:flex-end'}, [addBtn]));

  var totalCard = el('div', {class:'card'}, [
    el('h3', {text:'Total en cuentas'}),
    el('div', {class:'value mono', style:'font-size:26px;font-weight:600', text: fmtMoney(totalInAccounts())})
  ]);
  root.appendChild(totalCard);

  if(!state.accounts.length){
    root.appendChild(el('div', {class:'empty', html:'<strong>Sin cuentas cargadas</strong>Agregá tu cuenta bancaria, efectivo o ahorros.'}));
    return;
  }
  var list = el('div', {class:'card-list'});
  state.accounts.forEach(function(acc){
    var count = state.transactions.filter(function(t){ return t.accountId===acc.id; }).length;
    var card = el('div', {class:'goal-card'});
    card.appendChild(el('div', {style:'display:flex;justify-content:space-between;align-items:start'}, [
      el('h4', {text:acc.name}),
      el('span', {class:'chip chip-neutral'}, [el('span',{text:ACCOUNT_KIND_LABEL[acc.kind]||acc.kind})])
    ]));
    card.appendChild(el('div', {class:'value mono', style:'font-size:20px;font-weight:600', text: fmtMoney(acc.balance)}));
    card.appendChild(el('div', {class:'bar-sub', text: count + ' movimiento' + (count===1?'':'s') + ' · saldo inicial ' + fmtMoney(acc.startingBalance)}));
    var actions = el('div', {style:'display:flex;gap:8px;margin-top:4px'});
    var editBtn = el('button', {class:'btn btn-ghost btn-small', text:'Editar'});
    editBtn.addEventListener('click', function(){ openAccountPanel(acc); });
    var delBtn = el('button', {class:'btn btn-danger btn-small', text:'Eliminar'});
    delBtn.addEventListener('click', function(){
      if(state.accounts.length<=1){ alert('No podés borrar tu única cuenta.'); return; }
      var msg = count ? '¿Eliminar "' + acc.name + '"? ' + count + ' movimiento(s) quedarán sin cuenta asignada.' : '¿Eliminar "' + acc.name + '"?';
      if(confirm(msg)) deleteAccount(acc.id);
    });
    actions.appendChild(editBtn); actions.appendChild(delBtn);
    card.appendChild(actions);
    list.appendChild(card);
  });
  root.appendChild(list);
}
function openAccountPanel(existing){
  var isEdit = !!existing;
  var overlay = el('div', {class:'overlay'});
  var panel = el('div', {class:'panel'});
  panel.appendChild(el('h3', {text: isEdit?'Editar cuenta':'Nueva cuenta'}));

  var nameInp = el('input', {type:'text', value: existing?existing.name:'', placeholder:'Ej: Cuenta corriente, Efectivo, Ahorros…'});
  panel.appendChild(el('div', {class:'field'}, [el('label',{text:'Nombre'}), nameInp]));

  var kindSel = el('select', {});
  Object.keys(ACCOUNT_KIND_LABEL).forEach(function(k){ var o = el('option', {value:k, text:ACCOUNT_KIND_LABEL[k]}); if(existing && existing.kind===k) o.selected=true; kindSel.appendChild(o); });
  panel.appendChild(el('div', {class:'field'}, [el('label',{text:'Tipo'}), kindSel]));

  var startInp = el('input', {type:'number', value: existing?existing.startingBalance:0});
  panel.appendChild(el('div', {class:'field'}, [el('label',{text:'Saldo inicial (antes de tus movimientos registrados)'}), startInp]));
  if(isEdit){
    panel.appendChild(el('div', {class:'card-note', style:'margin:-8px 0 0', text:'Cambiar esto ajusta el saldo actual calculado; no mueve tus movimientos.'}));
  }

  var actions = el('div', {class:'panel-actions'});
  var cancelBtn = el('button', {class:'btn btn-ghost', text:'Cancelar'});
  cancelBtn.addEventListener('click', close);
  var saveBtn = el('button', {class:'btn btn-primary', text: isEdit?'Guardar':'Crear cuenta'});
  saveBtn.addEventListener('click', function(){
    var name = nameInp.value.trim();
    if(!name) return;
    var data = {name:name, kind:kindSel.value, startingBalance: parseFloat(startInp.value)||0};
    (isEdit ? updateAccount(existing.id, data) : addAccount(data)).catch(function(){});
    close();
  });
  actions.appendChild(cancelBtn); actions.appendChild(saveBtn);
  panel.appendChild(actions);
  overlay.appendChild(panel);
  overlay.addEventListener('click', function(e){ if(e.target===overlay) close(); });
  function close(){ overlay.remove(); }
  document.getElementById('modalRoot').appendChild(overlay);
  nameInp.focus();
}

/* ---------- render: debts ---------- */
function renderDebts(){
  var root = $('#view-debts'); root.innerHTML = '';
  var addBtn = el('button', {class:'btn btn-primary btn-small', text:'+ Agregar deuda'});
  addBtn.addEventListener('click', function(){ openDebtPanel(); });
  root.appendChild(el('div', {style:'display:flex;justify-content:flex-end'}, [addBtn]));

  if(!state.debts.length){
    root.appendChild(el('div', {class:'empty', html:'<strong>Sin deudas cargadas</strong>Agregá tarjetas de crédito o préstamos.'}));
    return;
  }
  var list = el('div', {class:'card-list'});
  state.debts.forEach(function(dd){
    var st = debtStatus(dd);
    var card = el('div', {class:'debt-card'});
    card.appendChild(el('div', {style:'display:flex;justify-content:space-between;align-items:start'}, [
      el('h4', {text:dd.name}),
      statusChip(st.level, st.label)
    ]));
    card.appendChild(el('div', {class:'bar-sub mono', text:'Saldo: ' + fmtMoney(dd.balance)}));
    if(dd.kind === 'debt'){
      card.appendChild(el('div', {class:'bar-sub', text:'Vence el día ' + dd.dueDay + ' · pago mín. ' + fmtMoney(dd.minPayment||0) + (dd.rate? ' · TEA ' + dd.rate + '%':'')}));
      card.appendChild(el('div', {class:'bar-sub', text: dd.lastPaymentDate ? 'Último pago: ' + dd.lastPaymentDate : 'Todavía no registraste ningún pago'}));
    } else {
      card.appendChild(el('div', {class:'bar-sub', text:'Cuenta / activo disponible'}));
    }
    var actions = el('div', {style:'display:flex;gap:8px;flex-wrap:wrap'});
    if(dd.kind === 'debt'){
      var payBtn = el('button', {class:'btn btn-ghost btn-small', text:'Registrar pago'});
      payBtn.addEventListener('click', function(){
        var v = prompt('¿Cuánto pagaste de "' + dd.name + '"?', String(dd.minPayment||''));
        if(v === null) return;
        var n = parseFloat(v);
        if(n > 0){
          var fromAccount = state.accounts[0];
          addTransaction({type:'transfer', amount:n, category: state.expenseCategories.indexOf('Deudas')>-1?'Deudas':'Otros', description:'Pago — ' + dd.name, date: todayStr(), accountId: fromAccount ? fromAccount.id : null})
            .then(function(){ return updateDebt(dd.id, {balance: Math.max(0, Number(dd.balance)-n), lastPaymentDate: todayStr()}); });
        }
      });
      actions.appendChild(payBtn);
    }
    var editBtn = el('button', {class:'btn btn-ghost btn-small', text:'Editar'});
    editBtn.addEventListener('click', function(){ openDebtPanel(dd); });
    var delBtn = el('button', {class:'btn btn-danger btn-small', text:'Eliminar'});
    delBtn.addEventListener('click', function(){ if(confirm('¿Eliminar?')) deleteDebt(dd.id); });
    actions.appendChild(editBtn); actions.appendChild(delBtn);
    card.appendChild(actions);
    list.appendChild(card);
  });
  root.appendChild(list);
}

/* ---------- render: analysis ---------- */
function renderAnalysis(){
  ensureChartStyles();
  var root = $('#view-analysis'); root.innerHTML = '';
  var months = lastNMonthKeys(6);
  var curKey = months[months.length-1];
  var prevKey = months[months.length-2] || curKey;
  var curInc = sumByType(txInMonth(curKey),'income'), curExp = sumByType(txInMonth(curKey),'expense');
  var prevInc = sumByType(txInMonth(prevKey),'income'), prevExp = sumByType(txInMonth(prevKey),'expense');
  var curRate = curInc ? ((curInc-curExp)/curInc*100) : 0;
  var prevRate = prevInc ? ((prevInc-prevExp)/prevInc*100) : 0;

  var tiles = el('div', {class:'tiles'});
  tiles.appendChild(el('div', {class:'tile'}, [
    el('div', {class:'label', text:'Tasa de ahorro (' + monthLabel(curKey) + ')'}),
    el('div', {class:'value mono', text: curRate.toFixed(0) + '%'}),
    el('div', {class:'delta ' + (curRate>=prevRate?'up':'down')}, [
      el('span', {class:'arrow', text: curRate>=prevRate?'↑':'↓'}),
      el('span', {text: Math.abs(curRate-prevRate).toFixed(0) + ' pp vs mes anterior'})
    ])
  ]));
  var avgExp = months.reduce(function(a,k){return a+sumByType(txInMonth(k),'expense');},0)/months.length;
  tiles.appendChild(el('div', {class:'tile'}, [ el('div', {class:'label', text:'Gasto promedio mensual'}), el('div', {class:'value mono', text:fmtMoney(avgExp)}) ]));
  var avgInc = months.reduce(function(a,k){return a+sumByType(txInMonth(k),'income');},0)/months.length;
  tiles.appendChild(el('div', {class:'tile'}, [ el('div', {class:'label', text:'Ingreso promedio mensual'}), el('div', {class:'value mono', text:fmtMoney(avgInc)}) ]));
  tiles.appendChild(el('div', {class:'tile'}, [ el('div', {class:'label', text:'Deuda total pendiente'}), el('div', {class:'value mono', text:fmtMoney(totalDebt())}) ]));
  root.appendChild(tiles);

  var barCard = el('div', {class:'card'}, [ el('h3', {text:'Ingresos vs. gastos — últimos 6 meses'}) ]);
  var legendRow = el('div', {style:'display:flex;gap:16px;margin-bottom:10px;font-size:12.5px;color:var(--ink-secondary)'}, [
    el('span', {}, [ el('span', {class:'cat-dot', style:'background:var(--status-good);margin-right:6px'}), document.createTextNode('Ingresos') ]),
    el('span', {}, [ el('span', {class:'cat-dot', style:'background:var(--status-critical);margin-right:6px'}), document.createTextNode('Gastos') ])
  ]);
  barCard.appendChild(legendRow);
  barCard.appendChild(groupedBarChart(months.map(function(k){ return {label:monthLabel(k), a:sumByType(txInMonth(k),'income'), b:sumByType(txInMonth(k),'expense')}; }), {label:'Ingresos vs gastos'}));
  root.appendChild(barCard);

  var allExpTotals = {};
  state.transactions.filter(function(t){return t.type==='expense';}).forEach(function(t){ allExpTotals[t.category] = (allExpTotals[t.category]||0)+Number(t.amount); });
  var allSegs = Object.keys(allExpTotals).map(function(c){ return {name:c, value:allExpTotals[c], color:catColor(c,'expense')}; }).sort(function(a,b){return b.value-a.value;});
  var catCard = el('div', {class:'card'}, [ el('h3', {text:'Gastos por categoría — histórico'}) ]);
  if(allSegs.length){
    var wrap = el('div', {style:'display:flex;gap:20px;align-items:center;flex-wrap:wrap'});
    wrap.appendChild(donutChart(allSegs, {sub:'Histórico'}));
    var total = allSegs.reduce(function(a,s){return a+s.value;},0);
    var legend = el('div', {class:'legend', style:'flex:1;min-width:160px'});
    allSegs.forEach(function(s){
      legend.appendChild(el('div', {class:'legend-row'}, [
        el('span', {class:'cat-dot', style:'background:'+s.color}),
        el('span', {class:'name', text:s.name}),
        el('span', {class:'pct', text: Math.round(s.value/total*100)+'%'}),
        el('span', {class:'amt mono', text: fmtMoney(s.value)})
      ]));
    });
    wrap.appendChild(legend);
    catCard.appendChild(wrap);
  } else {
    catCard.appendChild(el('div', {class:'empty', html:'<strong>Sin datos suficientes</strong>'}));
  }
  root.appendChild(catCard);

  var reportCard = el('div', {class:'card no-print'}, [ el('h3', {text:'Reportes'}), el('div', {class:'card-note', text:'Exportá tus datos o generá un informe imprimible / PDF.'}) ]);
  var btnRow = el('div', {style:'display:flex;gap:10px;flex-wrap:wrap'});
  btnRow.appendChild(el('a', {class:'btn btn-ghost btn-small', text:'Exportar movimientos (CSV)', href:'/api/export/transactions.csv'}));
  btnRow.appendChild(el('a', {class:'btn btn-ghost btn-small', text:'Exportar resumen mensual (CSV)', href:'/api/export/summary.csv'}));
  var b3 = el('button', {class:'btn btn-ghost btn-small', text:'Imprimir / Guardar como PDF'});
  b3.addEventListener('click', function(){ window.print(); });
  btnRow.appendChild(b3);
  reportCard.appendChild(btnRow);
  root.appendChild(reportCard);
}

/* ---------- render: settings ---------- */
function renderSettings(){
  var root = $('#view-settings'); root.innerHTML = '';

  var curCard = el('div', {class:'card'}, [ el('h3', {text:'Moneda'}) ]);
  var curSel = el('select', {});
  var opts = [['$','$ Dólar / Peso'],['€','€ Euro'],['S/','S/ Sol'],['Bs','Bs Bolívar / Boliviano'],['Q','Q Quetzal'],['L','L Lempira / Balboa'],['₡','₡ Colón'],['custom','Otro símbolo…']];
  var isKnown = opts.some(function(o){return o[0]===state.currency;});
  opts.forEach(function(o){ var op = el('option', {value:o[0], text:o[1]}); if(o[0]===state.currency || (o[0]==='custom' && !isKnown)) op.selected=true; curSel.appendChild(op); });
  var customInp = el('input', {type:'text', value: isKnown?'':state.currency, placeholder:'Símbolo', style:'width:100px;margin-left:8px', hidden: isKnown});
  curSel.addEventListener('change', function(){ customInp.hidden = curSel.value !== 'custom'; });
  var saveCurBtn = el('button', {class:'btn btn-ghost btn-small', text:'Guardar', style:'margin-left:8px'});
  saveCurBtn.addEventListener('click', function(){
    var v = curSel.value === 'custom' ? (customInp.value || '$') : curSel.value;
    saveSettings({currency:v});
  });
  curCard.appendChild(el('div', {style:'display:flex;align-items:center'}, [curSel, customInp, saveCurBtn]));
  root.appendChild(curCard);

  function catManager(title, key){
    var card = el('div', {class:'card'}, [ el('h3', {text:title}) ]);
    var list = el('div', {class:'cat-manage-list'});
    state[key].forEach(function(cat){
      var chip = el('span', {class:'chip-cat'}, [
        el('span', {class:'cat-dot', style:'background:'+catColor(cat, key==='incomeCategories'?'income':'expense')}),
        el('span', {text:cat})
      ]);
      var rm = el('button', {text:'×'});
      rm.addEventListener('click', function(){
        if(state[key].length<=1) return;
        var next = state[key].filter(function(c){return c!==cat;});
        var patch = {}; patch[key] = next;
        saveSettings(patch);
      });
      chip.appendChild(rm);
      list.appendChild(chip);
    });
    card.appendChild(list);
    var form = el('div', {class:'add-cat-form'});
    var inp = el('input', {type:'text', placeholder:'Nueva categoría'});
    var addBtn = el('button', {class:'btn btn-ghost btn-small', text:'Agregar'});
    addBtn.addEventListener('click', function(){
      var v = inp.value.trim();
      if(v && state[key].indexOf(v)===-1){
        var next = state[key].concat([v]);
        var patch = {}; patch[key] = next;
        saveSettings(patch);
      }
    });
    form.appendChild(inp); form.appendChild(addBtn);
    card.appendChild(form);
    return card;
  }
  root.appendChild(catManager('Categorías de gastos', 'expenseCategories'));
  root.appendChild(catManager('Categorías de ingresos', 'incomeCategories'));

  var rulesCard = el('div', {class:'card'}, [
    el('h3', {text:'Categorización automática'}),
    el('div', {class:'card-note', text:'Cuando un movimiento (manual o importado) tiene una descripción que contiene esta palabra, se le asigna la categoría automáticamente. La primera regla que coincide gana.'})
  ]);
  var allCatsForRules = Array.from(new Set(state.expenseCategories.concat(state.incomeCategories)));
  if(state.categoryRules.length){
    var rulesTable = el('table');
    rulesTable.appendChild(el('thead', {}, [ el('tr', {}, [
      el('th', {text:'Si la descripción contiene…'}), el('th', {text:'Categoría'}), el('th', {text:''})
    ]) ]));
    var rulesBody = el('tbody');
    state.categoryRules.forEach(function(rule){
      var tr = el('tr');
      tr.appendChild(el('td', {text:rule.keyword}));
      tr.appendChild(el('td', {}, [ el('span', {class:'cat-tag'}, [ el('span', {class:'cat-dot', style:'background:'+catColor(rule.category,'expense')}), document.createTextNode(rule.category) ]) ]));
      var delBtn = el('button', {class:'icon-btn', text:'Eliminar'});
      delBtn.addEventListener('click', function(){ deleteCategoryRule(rule.id); });
      tr.appendChild(el('td', {}, [ el('div', {class:'row-actions'}, [delBtn]) ]));
      rulesBody.appendChild(tr);
    });
    rulesTable.appendChild(rulesBody);
    rulesCard.appendChild(el('div', {class:'table-scroll'}, [rulesTable]));
  } else {
    rulesCard.appendChild(el('div', {class:'empty', html:'<strong>Todavía no tenés reglas</strong>Agregá una abajo, por ejemplo "uber" → Transporte.'}));
  }
  var ruleForm = el('div', {style:'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:flex-end'});
  var kwInp = el('input', {type:'text', placeholder:'Ej: uber, oxxo, netflix…'});
  var ruleCatSel = el('select', {});
  allCatsForRules.forEach(function(c){ ruleCatSel.appendChild(el('option', {value:c, text:c})); });
  var addRuleBtn = el('button', {class:'btn btn-ghost btn-small', text:'Agregar regla'});
  addRuleBtn.addEventListener('click', function(){
    var kw = kwInp.value.trim();
    if(!kw) return;
    addCategoryRule(kw, ruleCatSel.value);
    kwInp.value = '';
  });
  ruleForm.appendChild(el('div', {class:'field'}, [el('label',{text:'Palabra clave'}), kwInp]));
  ruleForm.appendChild(el('div', {class:'field'}, [el('label',{text:'Categoría'}), ruleCatSel]));
  ruleForm.appendChild(addRuleBtn);
  rulesCard.appendChild(ruleForm);

  var applyBtn = el('button', {class:'btn btn-ghost btn-small', text:'Aplicar reglas a movimientos existentes', style:'margin-top:14px'});
  applyBtn.addEventListener('click', function(){
    if(!state.categoryRules.length){ alert('Primero agregá al menos una regla.'); return; }
    applyBtn.setAttribute('disabled','disabled');
    applyRulesToExisting().then(function(){
      applyBtn.removeAttribute('disabled');
      alert('Listo, se recategorizaron los movimientos que coincidían con alguna regla.');
    }).catch(function(err){
      applyBtn.removeAttribute('disabled');
      alert('No se pudo aplicar: ' + err.message);
    });
  });
  rulesCard.appendChild(applyBtn);
  root.appendChild(rulesCard);

  var infoCard = el('div', {class:'card'}, [
    el('h3', {text:'Almacenamiento'}),
    el('div', {class:'card-note', style:'margin-bottom:0', text: 'Tus datos se guardan en un archivo SQLite en esta PC (carpeta data/finanzas.db). No se envían a ningún servidor externo. Para respaldarlos, copiá ese archivo; para llevarlos a otra PC, copiá toda la carpeta del proyecto.'})
  ]);
  root.appendChild(infoCard);

  var dz = el('div', {class:'danger-zone'});
  dz.appendChild(el('h3', {text:'Zona de riesgo', style:'margin:0 0 8px;color:var(--status-critical)'}));
  dz.appendChild(el('div', {class:'card-note', style:'margin-bottom:12px', text:'Esto borra permanentemente todos tus movimientos, presupuestos, metas y deudas.'}));
  var wipeBtn = el('button', {class:'btn btn-danger btn-small', text:'Borrar todos los datos'});
  wipeBtn.addEventListener('click', function(){
    if(confirm('Esta acción no se puede deshacer. ¿Borrar todos los datos?')) wipeAll();
  });
  dz.appendChild(wipeBtn);
  root.appendChild(dz);
}

/* ---------- panel: transacción ---------- */
function openTxPanel(existing){
  var isEdit = !!existing;
  var type = existing ? existing.type : 'expense';
  var overlay = el('div', {class:'overlay'});
  var panel = el('div', {class:'panel'});
  panel.appendChild(el('h3', {text: isEdit ? 'Editar movimiento' : 'Nuevo movimiento'}));

  var seg = el('div', {class:'segmented'});
  var incBtn = el('button', {text:'Ingreso', class: type==='income'?'active income':''});
  var expBtn = el('button', {text:'Gasto', class: type==='expense'?'active expense':''});
  incBtn.addEventListener('click', function(){ type='income'; incBtn.className='active income'; expBtn.className=''; fillCats(); });
  expBtn.addEventListener('click', function(){ type='expense'; expBtn.className='active expense'; incBtn.className=''; fillCats(); });
  seg.appendChild(incBtn); seg.appendChild(expBtn);
  panel.appendChild(el('div', {class:'field'}, [el('label',{text:'Tipo'}), seg]));

  var amountInp = el('input', {type:'number', min:'0', step:'0.01', value: existing?existing.amount:''});
  panel.appendChild(el('div', {class:'field'}, [el('label',{text:'Monto'}), amountInp]));

  var catSel = el('select', {});
  function fillCats(){
    catSel.innerHTML = '';
    var list = type==='income' ? state.incomeCategories : state.expenseCategories;
    list.forEach(function(c){ var o = el('option', {value:c, text:c}); if(existing && existing.category===c) o.selected=true; catSel.appendChild(o); });
  }
  fillCats();
  panel.appendChild(el('div', {class:'field'}, [el('label',{text:'Categoría'}), catSel]));

  var descInp = el('input', {type:'text', value: existing?existing.description:'', placeholder:'Ej: Supermercado'});
  panel.appendChild(el('div', {class:'field'}, [el('label',{text:'Descripción'}), descInp]));

  var dateInp = el('input', {type:'date', value: existing?existing.date:todayStr()});
  panel.appendChild(el('div', {class:'field'}, [el('label',{text:'Fecha'}), dateInp]));

  var acctSel = el('select', {});
  state.accounts.forEach(function(a){ var o = el('option', {value:a.id, text:a.name}); if(existing ? existing.accountId===a.id : false) o.selected=true; acctSel.appendChild(o); });
  panel.appendChild(el('div', {class:'field'}, [el('label',{text:'Cuenta'}), acctSel]));

  var actions = el('div', {class:'panel-actions'});
  var cancelBtn = el('button', {class:'btn btn-ghost', text:'Cancelar'});
  cancelBtn.addEventListener('click', close);
  var saveBtn = el('button', {class:'btn btn-primary', text: isEdit?'Guardar cambios':'Agregar movimiento'});
  saveBtn.addEventListener('click', function(){
    var amount = parseFloat(amountInp.value);
    if(!(amount>0)){ amountInp.focus(); return; }
    var data = {type:type, amount:amount, category:catSel.value, description:descInp.value.trim(), date:dateInp.value||todayStr(), accountId: acctSel.value || null};
    (isEdit ? updateTransaction(existing.id, data) : addTransaction(data)).catch(function(){});
    close();
  });
  actions.appendChild(cancelBtn); actions.appendChild(saveBtn);
  panel.appendChild(actions);

  overlay.appendChild(panel);
  overlay.addEventListener('click', function(e){ if(e.target===overlay) close(); });
  function close(){ overlay.remove(); }
  document.getElementById('modalRoot').appendChild(overlay);
  amountInp.focus();
}

/* ---------- panel: meta ---------- */
function openGoalPanel(existing){
  var isEdit = !!existing;
  var overlay = el('div', {class:'overlay'});
  var panel = el('div', {class:'panel'});
  panel.appendChild(el('h3', {text: isEdit?'Editar meta':'Nueva meta de ahorro'}));
  var nameInp = el('input', {type:'text', value: existing?existing.name:'', placeholder:'Ej: Fondo de emergencia'});
  panel.appendChild(el('div', {class:'field'}, [el('label',{text:'Nombre'}), nameInp]));
  var targetInp = el('input', {type:'number', min:'0', value: existing?existing.target:''});
  panel.appendChild(el('div', {class:'field'}, [el('label',{text:'Objetivo'}), targetInp]));
  var curInp = el('input', {type:'number', min:'0', value: existing?existing.current:0});
  panel.appendChild(el('div', {class:'field'}, [el('label',{text:'Ahorrado hasta ahora'}), curInp]));
  var dateInp = el('input', {type:'date', value: existing&&existing.targetDate?existing.targetDate:''});
  panel.appendChild(el('div', {class:'field'}, [el('label',{text:'Fecha objetivo (opcional)'}), dateInp]));
  var actions = el('div', {class:'panel-actions'});
  var cancelBtn = el('button', {class:'btn btn-ghost', text:'Cancelar'});
  cancelBtn.addEventListener('click', close);
  var saveBtn = el('button', {class:'btn btn-primary', text: isEdit?'Guardar':'Crear meta'});
  saveBtn.addEventListener('click', function(){
    var name = nameInp.value.trim(); var target = parseFloat(targetInp.value);
    if(!name || !(target>0)) return;
    var data = {name:name, target:target, current: parseFloat(curInp.value)||0, targetDate: dateInp.value||null};
    (isEdit ? updateGoal(existing.id, data) : addGoal(data)).catch(function(){});
    close();
  });
  actions.appendChild(cancelBtn); actions.appendChild(saveBtn);
  panel.appendChild(actions);
  overlay.appendChild(panel);
  overlay.addEventListener('click', function(e){ if(e.target===overlay) close(); });
  function close(){ overlay.remove(); }
  document.getElementById('modalRoot').appendChild(overlay);
  nameInp.focus();
}

/* ---------- panel: deuda ---------- */
function openDebtPanel(existing){
  var isEdit = !!existing;
  var kind = 'debt';
  var overlay = el('div', {class:'overlay'});
  var panel = el('div', {class:'panel'});
  panel.appendChild(el('h3', {text: isEdit?'Editar deuda':'Nueva deuda'}));

  var nameInp = el('input', {type:'text', value: existing?existing.name:'', placeholder:'Ej: Tarjeta de crédito'});
  panel.appendChild(el('div', {class:'field'}, [el('label',{text:'Nombre'}), nameInp]));
  var balInp = el('input', {type:'number', value: existing?existing.balance:''});
  panel.appendChild(el('div', {class:'field'}, [el('label',{text:'Saldo actual'}), balInp]));

  var debtFields = el('div', {}, []);
  var dueInp = el('input', {type:'number', min:'1', max:'31', value: existing&&existing.dueDay?existing.dueDay:''});
  debtFields.appendChild(el('div', {class:'field'}, [el('label',{text:'Día de vencimiento (1-31)'}), dueInp]));
  var minInp = el('input', {type:'number', min:'0', value: existing?existing.minPayment:''});
  debtFields.appendChild(el('div', {class:'field'}, [el('label',{text:'Pago mínimo'}), minInp]));
  var rateInp = el('input', {type:'number', min:'0', value: existing?existing.rate:''});
  debtFields.appendChild(el('div', {class:'field'}, [el('label',{text:'Tasa anual % (opcional)'}), rateInp]));
  panel.appendChild(debtFields);

  var actions = el('div', {class:'panel-actions'});
  var cancelBtn = el('button', {class:'btn btn-ghost', text:'Cancelar'});
  cancelBtn.addEventListener('click', close);
  var saveBtn = el('button', {class:'btn btn-primary', text: isEdit?'Guardar':'Agregar'});
  saveBtn.addEventListener('click', function(){
    var name = nameInp.value.trim(); var balance = parseFloat(balInp.value);
    if(!name || isNaN(balance)) return;
    var data = {name:name, kind:kind, balance:balance};
    data.dueDay = parseInt(dueInp.value,10)||null; data.minPayment = parseFloat(minInp.value)||0; data.rate = parseFloat(rateInp.value)||0;
    (isEdit ? updateDebt(existing.id, data) : addDebt(data)).catch(function(){});
    close();
  });
  actions.appendChild(cancelBtn); actions.appendChild(saveBtn);
  panel.appendChild(actions);
  overlay.appendChild(panel);
  overlay.addEventListener('click', function(e){ if(e.target===overlay) close(); });
  function close(){ overlay.remove(); }
  document.getElementById('modalRoot').appendChild(overlay);
  nameInp.focus();
}

/* ---------- importar extracto (CSV) ---------- */
function detectDelimiter(line){
  var commas = (line.match(/,/g)||[]).length;
  var semis = (line.match(/;/g)||[]).length;
  return semis > commas ? ';' : ',';
}
function parseCsvLine(line, delim){
  var result = [], cur = '', inQuotes = false;
  for(var i=0;i<line.length;i++){
    var ch = line[i];
    if(inQuotes){
      if(ch === '"'){ if(line[i+1] === '"'){ cur += '"'; i++; } else { inQuotes = false; } }
      else cur += ch;
    } else {
      if(ch === '"') inQuotes = true;
      else if(ch === delim){ result.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  result.push(cur);
  return result;
}
function parseCsv(text){
  var lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(function(l){ return l.trim().length>0; });
  if(!lines.length) return {headers:[], rows:[]};
  var delim = detectDelimiter(lines[0]);
  var headers = parseCsvLine(lines[0], delim).map(function(h){ return h.trim(); });
  var rows = lines.slice(1).map(function(l){ return parseCsvLine(l, delim); });
  return {headers:headers, rows:rows};
}
function pad2(n){ n = String(n); return n.length<2 ? '0'+n : n; }
function parseDateWithFormat(raw, fmt){
  if(raw == null) return null;
  var s = String(raw).trim();
  var m;
  if(fmt === 'YYYY-MM-DD'){ m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/); if(m) return m[1]+'-'+pad2(m[2])+'-'+pad2(m[3]); }
  if(fmt === 'DD/MM/YYYY'){ m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/); if(m) return m[3]+'-'+pad2(m[2])+'-'+pad2(m[1]); }
  if(fmt === 'MM/DD/YYYY'){ m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/); if(m) return m[3]+'-'+pad2(m[1])+'-'+pad2(m[2]); }
  return null;
}
function parseAmountLocale(raw){
  if(raw == null) return NaN;
  var s = String(raw).trim();
  if(!s) return NaN;
  var neg = false;
  if(/^\(.*\)$/.test(s)){ neg = true; s = s.slice(1,-1); }
  s = s.replace(/[^0-9.,-]/g, '');
  if(s.indexOf('-') === 0){ neg = true; }
  s = s.replace(/-/g, '');
  var hasComma = s.indexOf(',') > -1, hasDot = s.indexOf('.') > -1;
  if(hasComma && hasDot){
    if(s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g,'').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if(hasComma){
    var parts = s.split(',');
    if(parts.length === 2 && parts[1].length <= 2) s = parts[0] + '.' + parts[1];
    else s = s.replace(/,/g, '');
  }
  var n = parseFloat(s);
  if(isNaN(n)) return NaN;
  return neg ? -n : n;
}

function openImportPanel(){
  var overlay = el('div', {class:'overlay'});
  var panel = el('div', {class:'panel', style:'width:min(720px, 100vw)'});
  panel.appendChild(el('h3', {text:'Importar extracto bancario'}));

  var source = 'csv';
  var seg = el('div', {class:'segmented'});
  var csvBtn = el('button', {text:'CSV', class:'active income'});
  var pdfBtn = el('button', {text:'PDF tarjeta Nu (Colombia)'});
  csvBtn.addEventListener('click', function(){ source='csv'; csvBtn.className='active income'; pdfBtn.className=''; renderSourceUi(); });
  pdfBtn.addEventListener('click', function(){ source='pdf-nu'; pdfBtn.className='active income'; csvBtn.className=''; renderSourceUi(); });
  seg.appendChild(csvBtn); seg.appendChild(pdfBtn);
  panel.appendChild(el('div', {class:'field'}, [el('label',{text:'Formato del archivo'}), seg]));

  var importAcctSel = el('select', {});
  state.accounts.forEach(function(a){ importAcctSel.appendChild(el('option', {value:a.id, text:a.name})); });
  panel.appendChild(el('div', {class:'field'}, [el('label',{text:'Cuenta a la que pertenecen estos movimientos'}), importAcctSel]));
  var refreshPreview = function(){};
  importAcctSel.addEventListener('change', function(){ refreshPreview(); });

  var note = el('div', {class:'card-note', style:'margin:-8px 0 0'});
  panel.appendChild(note);

  var fileWrap = el('div', {class:'field'});
  panel.appendChild(fileWrap);

  var body = el('div', {style:'display:flex;flex-direction:column;gap:14px'});
  panel.appendChild(body);

  var actions = el('div', {class:'panel-actions'});
  var cancelBtn = el('button', {class:'btn btn-ghost', text:'Cerrar'});
  cancelBtn.addEventListener('click', close);
  var importBtn = el('button', {class:'btn btn-primary', text:'Importar', disabled:'disabled'});
  actions.appendChild(cancelBtn); actions.appendChild(importBtn);
  panel.appendChild(actions);

  var parsed = null;
  var validRows = [];
  var fileInp;

  function renderSourceUi(){
    body.innerHTML = '';
    fileWrap.innerHTML = '';
    importBtn.setAttribute('disabled','disabled');
    parsed = null; validRows = [];
    if(source === 'csv'){
      note.textContent = 'Subí un archivo CSV exportado de tu banco. Después vas a poder indicar qué columna es cada dato antes de importar nada.';
      fileInp = el('input', {type:'file', accept:'.csv,text/csv'});
      fileWrap.appendChild(el('label',{text:'Archivo CSV'}));
      fileWrap.appendChild(fileInp);
      fileInp.addEventListener('change', function(){
        var file = fileInp.files[0];
        if(!file) return;
        var reader = new FileReader();
        reader.onload = function(){
          parsed = parseCsv(String(reader.result));
          if(!parsed.headers.length || !parsed.rows.length){
            body.innerHTML = '';
            body.appendChild(el('div', {class:'empty', html:'<strong>No se pudo leer el archivo</strong>Verificá que sea un CSV válido.'}));
            return;
          }
          renderMapping();
        };
        reader.readAsText(file, 'utf-8');
      });
    } else {
      note.textContent = 'Subí el PDF del extracto de tu tarjeta Nu Colombia (sin contraseña). Se identifican automáticamente las compras — los abonos/pagos a la tarjeta se excluyen solos.';
      fileInp = el('input', {type:'file', accept:'.pdf,application/pdf'});
      fileWrap.appendChild(el('label',{text:'Archivo PDF'}));
      fileWrap.appendChild(fileInp);
      fileInp.addEventListener('change', function(){
        var file = fileInp.files[0];
        if(!file) return;
        body.innerHTML = '';
        body.appendChild(el('div', {class:'card-note', style:'margin:0', text:'Leyendo el PDF…'}));
        file.arrayBuffer().then(function(buf){
          return fetch('/api/import/nu-statement', {method:'POST', headers:{'Content-Type':'application/pdf'}, body:buf});
        }).then(function(res){
          return res.json().then(function(j){ if(!res.ok) throw new Error(j.error||'Error'); return j; });
        }).then(function(j){
          renderPdfPreview(j);
        }).catch(function(err){
          body.innerHTML = '';
          body.appendChild(el('div', {class:'empty', html:'<strong>No se pudo leer el PDF</strong>' + err.message}));
        });
      });
    }
  }
  renderSourceUi();

  function renderPdfPreview(result){
    body.innerHTML = '';
    validRows = [];
    if(!result.rows.length){
      body.appendChild(el('div', {class:'empty', html:'<strong>No se encontraron movimientos</strong>No se pudo reconocer ninguna fila de compra en este PDF.'}));
      return;
    }
    var allCats = Array.from(new Set(state.expenseCategories.concat(state.incomeCategories)));
    var matchedCount = result.rows.filter(function(r){ return r.category; }).length;
    var catSel = el('select', {});
    allCats.forEach(function(c){ var o = el('option', {value:c, text:c}); if(c === (state.expenseCategories.indexOf('Otros')>-1?'Otros':allCats[0])) o.selected=true; catSel.appendChild(o); });
    body.appendChild(el('div', {class:'field'}, [el('label',{text:'Categoría por defecto (para lo que no coincida con ninguna regla)'}), catSel]));

    var summary = el('div', {class:'card-note', style:'margin:0', text: result.rows.length + ' compras detectadas · ' + matchedCount + ' categorizadas automáticamente por tus reglas' + (result.skipped ? ' · ' + result.skipped + ' fila(s) omitida(s)' : '')});
    body.appendChild(summary);

    var previewWrap = el('div', {class:'table-scroll'});
    var table = el('table');
    table.appendChild(el('thead', {}, [ el('tr', {}, [
      el('th', {text:'Fecha'}), el('th', {class:'amount', text:'Monto'}), el('th', {text:'Descripción'}), el('th', {text:'Categoría'})
    ]) ]));
    var tbody = el('tbody');
    function catCell(r){
      var cat = r.category || catSel.value;
      return el('span', {class:'cat-tag'}, [
        el('span', {class:'cat-dot', style:'background:'+catColor(cat,'expense')}),
        document.createTextNode(cat),
        r.category ? null : el('span', {class:'card-note', style:'margin:0 0 0 4px', text:'(por defecto)'})
      ]);
    }
    result.rows.slice(0,8).forEach(function(r){
      var tr = el('tr');
      tr.appendChild(el('td', {class:'mono', text:r.date}));
      tr.appendChild(el('td', {class:'amount mono expense', text: fmtMoney(r.amount)}));
      tr.appendChild(el('td', {text:r.description}));
      var catTd = el('td', {}, [catCell(r)]);
      catTd.dataset.dynamicCat = r.category ? '' : '1';
      tr.appendChild(catTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    previewWrap.appendChild(table);
    if(result.rows.length > 8) previewWrap.appendChild(el('div', {class:'card-note', style:'margin:8px 0 0', text:'… y ' + (result.rows.length-8) + ' más'}));
    body.appendChild(previewWrap);

    function rebuild(){
      var defaultCategory = catSel.value;
      validRows = result.rows.map(function(r){ return {type:'expense', amount:r.amount, category: r.category || defaultCategory, description:r.description, date:r.date, accountId: importAcctSel.value}; });
      $all('td[data-dynamic-cat="1"]', tbody).forEach(function(td){
        var idx = Array.prototype.indexOf.call(tbody.children, td.parentNode);
        td.innerHTML = '';
        td.appendChild(catCell(result.rows[idx]));
      });
      importBtn.removeAttribute('disabled');
    }
    catSel.addEventListener('change', rebuild);
    refreshPreview = rebuild;
    rebuild();
  }

  function renderMapping(){
    body.innerHTML = '';
    var headers = parsed.headers;
    var allCats = Array.from(new Set(state.expenseCategories.concat(state.incomeCategories)));

    var dateSel = colSelect(headers, guessColumn(headers, ['fecha','date']));
    var fmtSel = el('select', {}, [
      el('option', {value:'DD/MM/YYYY', text:'DD/MM/AAAA'}),
      el('option', {value:'YYYY-MM-DD', text:'AAAA-MM-DD'}),
      el('option', {value:'MM/DD/YYYY', text:'MM/DD/AAAA'})
    ]);
    var descSel = colSelect(headers, guessColumn(headers, ['descripcion','descripción','concepto','detalle','description']));

    var modeSel = el('select', {}, [
      el('option', {value:'signed', text:'Una columna con signo (+/-)'}),
      el('option', {value:'split', text:'Dos columnas separadas (Débito / Crédito)'})
    ]);
    var amountSingleWrap = el('div', {class:'field'}, [el('label',{text:'Columna de monto'}), colSelect(headers, guessColumn(headers, ['monto','importe','amount','valor']))]);
    var interpSel = el('select', {}, [
      el('option', {value:'sign', text:'Negativos = gasto, positivos = ingreso'}),
      el('option', {value:'allExpense', text:'Todas las filas son gastos'}),
      el('option', {value:'allIncome', text:'Todas las filas son ingresos'})
    ]);
    var debitSel = colSelect(headers, guessColumn(headers, ['debito','débito','debe','cargo']));
    var creditSel = colSelect(headers, guessColumn(headers, ['credito','crédito','haber','abono']));
    var splitWrap = el('div', {style:'display:flex;gap:10px;flex-wrap:wrap'}, [
      el('div', {class:'field'}, [el('label',{text:'Columna débito (gasto)'}), debitSel]),
      el('div', {class:'field'}, [el('label',{text:'Columna crédito (ingreso)'}), creditSel])
    ]);
    splitWrap.hidden = true;
    modeSel.addEventListener('change', function(){
      var split = modeSel.value === 'split';
      splitWrap.hidden = !split;
      amountSingleWrap.hidden = split;
      interpWrap.hidden = split;
      updatePreview();
    });

    var interpWrap = el('div', {class:'field'}, [el('label',{text:'Interpretar montos como'}), interpSel]);

    var catSel = el('select', {});
    allCats.forEach(function(c){ var o = el('option', {value:c, text:c}); if(c === (state.expenseCategories.indexOf('Otros')>-1?'Otros':allCats[0])) o.selected=true; catSel.appendChild(o); });

    body.appendChild(el('div', {style:'display:flex;gap:10px;flex-wrap:wrap'}, [
      el('div', {class:'field'}, [el('label',{text:'Columna de fecha'}), dateSel]),
      el('div', {class:'field'}, [el('label',{text:'Formato de fecha'}), fmtSel])
    ]));
    body.appendChild(el('div', {class:'field'}, [el('label',{text:'Columna de descripción (opcional)'}), descSel]));
    body.appendChild(el('div', {class:'field'}, [el('label',{text:'Cómo vienen los montos'}), modeSel]));
    body.appendChild(amountSingleWrap);
    body.appendChild(interpWrap);
    body.appendChild(splitWrap);
    body.appendChild(el('div', {class:'field'}, [el('label',{text:'Categoría por defecto (para lo que no coincida con ninguna regla)'}), catSel]));

    var summary = el('div', {class:'card-note', style:'margin:0'});
    var previewWrap = el('div', {class:'table-scroll'});
    body.appendChild(summary);
    body.appendChild(previewWrap);

    [dateSel, fmtSel, descSel, catSel, amountSingleWrap.querySelector('select'), interpSel, debitSel, creditSel].forEach(function(elm){
      elm.addEventListener('change', updatePreview);
    });

    function colSelect(headers, guessIdx){
      var s = el('select', {});
      headers.forEach(function(h, i){ var o = el('option', {value:String(i), text: h || ('Columna ' + (i+1))}); if(i === guessIdx) o.selected = true; s.appendChild(o); });
      return s;
    }

    function buildRows(){
      var dateIdx = Number(dateSel.value);
      var descIdx = descSel.value === '' ? -1 : Number(descSel.value);
      var fmt = fmtSel.value;
      var category = catSel.value;
      var split = modeSel.value === 'split';
      var out = [];
      var errors = 0;
      parsed.rows.forEach(function(row){
        var dateRaw = row[dateIdx];
        var date = parseDateWithFormat(dateRaw, fmt);
        var description = descIdx >= 0 ? (row[descIdx] || '') : '';
        var type = null, amount = null;
        if(split){
          var debitIdx = Number(debitSel.value), creditIdx = Number(creditSel.value);
          var debitVal = parseAmountLocale(row[debitIdx]);
          var creditVal = parseAmountLocale(row[creditIdx]);
          if(!isNaN(debitVal) && Math.abs(debitVal) > 0){ type = 'expense'; amount = Math.abs(debitVal); }
          else if(!isNaN(creditVal) && Math.abs(creditVal) > 0){ type = 'income'; amount = Math.abs(creditVal); }
        } else {
          var amtIdx = Number(amountSingleWrap.querySelector('select').value);
          var raw = parseAmountLocale(row[amtIdx]);
          if(!isNaN(raw)){
            var interp = interpSel.value;
            if(interp === 'allExpense'){ type = 'expense'; amount = Math.abs(raw); }
            else if(interp === 'allIncome'){ type = 'income'; amount = Math.abs(raw); }
            else { type = raw < 0 ? 'expense' : 'income'; amount = Math.abs(raw); }
          }
        }
        if(!date || !type || !(amount > 0)){ errors++; return; }
        var matchedCat = resolveCategoryForDescription(description);
        out.push({type:type, amount:amount, category: matchedCat || category, description:description, date:date, ruleMatched: !!matchedCat, accountId: importAcctSel.value});
      });
      return {out:out, errors:errors};
    }

    function updatePreview(){
      var r = buildRows();
      validRows = r.out;
      var matchedCount = validRows.filter(function(t){ return t.ruleMatched; }).length;
      summary.textContent = validRows.length + ' de ' + parsed.rows.length + ' filas se pueden importar' + (matchedCount ? ' · ' + matchedCount + ' categorizadas por tus reglas' : '') + (r.errors ? ' · ' + r.errors + ' con datos inválidos (se van a omitir)' : '');
      previewWrap.innerHTML = '';
      var table = el('table');
      table.appendChild(el('thead', {}, [ el('tr', {}, [
        el('th', {text:'Fecha'}), el('th', {text:'Tipo'}), el('th', {class:'amount', text:'Monto'}), el('th', {text:'Descripción'}), el('th', {text:'Categoría'})
      ]) ]));
      var tbody = el('tbody');
      validRows.slice(0,5).forEach(function(t){
        tbody.appendChild(el('tr', {}, [
          el('td', {class:'mono', text:t.date}),
          el('td', {text: t.type==='income' ? 'Ingreso' : 'Gasto'}),
          el('td', {class:'amount mono ' + t.type, text: fmtMoney(t.amount)}),
          el('td', {text: t.description || '—'}),
          el('td', {}, [ el('span', {class:'cat-tag'}, [ el('span', {class:'cat-dot', style:'background:'+catColor(t.category,t.type)}), document.createTextNode(t.category) ]) ])
        ]));
      });
      table.appendChild(tbody);
      previewWrap.appendChild(table);
      if(validRows.length){ importBtn.removeAttribute('disabled'); } else { importBtn.setAttribute('disabled','disabled'); }
    }
    refreshPreview = updatePreview;
    updatePreview();
  }

  function guessColumn(headers, keywords){
    for(var i=0;i<headers.length;i++){
      var h = (headers[i]||'').toLowerCase();
      for(var k=0;k<keywords.length;k++){ if(h.indexOf(keywords[k]) > -1) return i; }
    }
    return 0;
  }

  importBtn.addEventListener('click', function(){
    if(!validRows.length) return;
    importBtn.setAttribute('disabled','disabled');
    importBtn.textContent = 'Importando…';
    ensureRealData().then(function(){
      return apiFetch('/api/transactions/bulk', {method:'POST', headers:JSON_HEADERS, body:JSON.stringify({items:validRows})});
    }).then(function(r){
      return refresh().then(function(){
        close();
      });
    }).catch(function(err){
      importBtn.removeAttribute('disabled');
      importBtn.textContent = 'Importar';
      alert('No se pudo importar: ' + err.message);
    });
  });

  overlay.appendChild(panel);
  overlay.addEventListener('click', function(e){ if(e.target===overlay) close(); });
  function close(){ overlay.remove(); }
  document.getElementById('modalRoot').appendChild(overlay);
}

/* ---------- eventos globales ---------- */
$('#nav').addEventListener('click', function(e){
  var btn = e.target.closest('button[data-view]');
  if(btn) switchView(btn.dataset.view);
});
$('#newTxBtn').addEventListener('click', function(){ openTxPanel(); });
$('#clearExampleBtn').addEventListener('click', function(){ clearExamples().catch(function(){}); });
$('#retryBtn').addEventListener('click', function(){ refresh().catch(function(){}); });

(function initSidebarToggle(){
  var appRoot = $('#appRoot');
  var collapsed = false;
  try{ collapsed = localStorage.getItem('cc_sidebar_collapsed') === '1'; }catch(e){}
  if(collapsed) appRoot.classList.add('sidebar-collapsed');
  $('#sidebarToggle').addEventListener('click', function(){
    collapsed = !collapsed;
    appRoot.classList.toggle('sidebar-collapsed', collapsed);
    try{ localStorage.setItem('cc_sidebar_collapsed', collapsed ? '1' : '0'); }catch(e){}
  });
})();

/* ---------- init ---------- */
refresh().catch(function(){ setOffline(true); });

})();
