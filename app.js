'use strict';

// Indicative fees, editable in the form: check each platform's current pricing.
const PLATFORMS = [
  { name: 'Vinted (particulier)', pct: 0, fixed: 0 },
  { name: 'Leboncoin (particulier)', pct: 0, fixed: 0 },
  { name: 'eBay (particulier)', pct: 0, fixed: 0 },
  { name: 'eBay (pro)', pct: 13, fixed: 0.35 },
  { name: 'Vestiaire Collective', pct: 15, fixed: 0 },
  { name: 'Personnalisé', pct: null, fixed: null },
];
const STORAGE_KEY = 'arvp-items';
const DAC7 = { sales: 30, revenue: 2000 };
const FIELDS = ['id', 'name', 'source', 'date', 'cost', 'target', 'status', 'soldPrice', 'soldFees', 'soldDate', 'soldOn'];
const STATUS_LABELS = { stock: 'En stock', listed: 'En ligne', sold: 'Vendu' };

const $ = (sel) => document.querySelector(sel);
const eur = (n) => (Number.isFinite(n) ? n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '—');
const pct = (n) => (Number.isFinite(n) ? `${(n * 100).toFixed(1).replace('.', ',')} %` : '—');
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);

// ---------- Tabs ----------
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === btn.dataset.tab));
  });
});

// ---------- Calculator ----------
function computeDeal({ buy, buyShip, qty, sell, feePct, feeFixed, packaging, social, target }) {
  const unitCost = (buy + buyShip) / Math.max(1, qty);
  const variableRate = (feePct + social) / 100;
  const fixedPerSale = feeFixed + packaging;
  const fees = sell * feePct / 100 + fixedPerSale;
  const socialAmount = sell * social / 100;
  const net = sell - unitCost - fees - socialAmount;
  const breakEven = variableRate < 1 ? (unitCost + fixedPerSale) / (1 - variableRate) : Infinity;
  const targetRate = variableRate + target / 100;
  const targetPrice = targetRate < 1 ? (unitCost + fixedPerSale) / (1 - targetRate) : Infinity;
  return {
    unitCost, fees, socialAmount, net,
    margin: sell > 0 ? net / sell : NaN,
    roi: unitCost > 0 ? net / unitCost : NaN,
    totalNet: net * Math.max(1, qty),
    breakEven, targetPrice,
  };
}

const calcForm = $('#calc-form');
const platformSelect = $('#platform');
platformSelect.innerHTML = PLATFORMS.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('');
$('#platforms-list').innerHTML = PLATFORMS.slice(0, -1).map((p) => `<option value="${esc(p.name.split(' (')[0])}">`).join('');

platformSelect.addEventListener('change', () => {
  const p = PLATFORMS[platformSelect.value];
  if (p.pct !== null) {
    calcForm.elements.feePct.value = p.pct;
    calcForm.elements.feeFixed.value = p.fixed;
  }
  renderCalc();
});
calcForm.addEventListener('input', (e) => {
  if (e.target.name === 'feePct' || e.target.name === 'feeFixed') platformSelect.value = PLATFORMS.length - 1;
  renderCalc();
});

function kpi(label, value, cls = '') {
  return `<div class="kpi"><div class="label">${label}</div><div class="value ${cls}">${value}</div></div>`;
}

function renderCalc() {
  const v = Object.fromEntries(['buy', 'buyShip', 'qty', 'sell', 'feePct', 'feeFixed', 'packaging', 'social', 'target']
    .map((k) => [k, num(calcForm.elements[k].value)]));
  const r = computeDeal(v);
  const hitsTarget = r.margin >= v.target / 100;
  const verdict = r.net <= 0
    ? '<span class="bad">✗ Pas rentable : tu perds de l\'argent à ce prix.</span>'
    : hitsTarget
      ? '<span class="good">✓ Bon deal : la marge nette atteint ton objectif.</span>'
      : '<span class="bad">≈ Rentable mais sous ton objectif de marge : négocie ou passe ton tour.</span>';
  $('#calc-results').innerHTML = [
    `<div class="kpi verdict">${verdict}</div>`,
    kpi('Coût de revient / pièce', eur(r.unitCost)),
    kpi('Frais de vente', eur(r.fees)),
    kpi('Cotisations', eur(r.socialAmount)),
    kpi('Bénéfice net / pièce', eur(r.net), r.net > 0 ? 'good' : 'bad'),
    kpi('Marge nette', pct(r.margin), hitsTarget ? 'good' : 'bad'),
    kpi('ROI', pct(r.roi)),
    kpi(`Bénéfice total (${Math.max(1, v.qty)} pcs)`, eur(r.totalNet), r.totalNet > 0 ? 'good' : 'bad'),
    kpi('Prix mini (0 € de bénéfice)', eur(r.breakEven)),
    kpi(`Prix pour ${v.target} % de marge`, eur(r.targetPrice)),
  ].join('');
}

// ---------- Stock ----------
function loadItems() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}
function saveItems() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* storage unavailable */ }
}
let items = loadItems();

function daysBetween(a, b) {
  if (!a) return NaN;
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function profitOf(it) {
  return it.status === 'sold' ? num(it.soldPrice) - num(it.soldFees) - num(it.cost) : NaN;
}

const itemForm = $('#item-form');
itemForm.elements.date.value = today();
itemForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(FIELDS.map((f) => [f, itemForm.elements[f].value.trim()]));
  if (data.status === 'sold' && !data.soldDate) data.soldDate = today();
  if (data.id) {
    items = items.map((it) => (it.id === data.id ? data : it));
  } else {
    data.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
    items.push(data);
  }
  saveItems();
  itemForm.reset();
  renderStock();
});
itemForm.addEventListener('reset', () => {
  setTimeout(() => { itemForm.elements.id.value = ''; itemForm.elements.date.value = today(); });
});

$('#items').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const it = items.find((x) => x.id === btn.dataset.id);
  if (!it) return;
  if (btn.dataset.action === 'delete') {
    if (!confirm(`Supprimer « ${it.name} » ?`)) return;
    items = items.filter((x) => x !== it);
    saveItems();
    renderStock();
  } else {
    FIELDS.forEach((f) => { itemForm.elements[f].value = it[f] ?? ''; });
    itemForm.closest('details').open = true;
    itemForm.scrollIntoView({ behavior: 'smooth' });
  }
});
$('#filter').addEventListener('change', renderStock);

function renderStock() {
  const socialRate = num(calcForm.elements.social.value) / 100;
  const sold = items.filter((it) => it.status === 'sold');
  const unsold = items.filter((it) => it.status !== 'sold');
  const revenue = sold.reduce((s, it) => s + num(it.soldPrice), 0);
  const profit = sold.reduce((s, it) => s + profitOf(it), 0);
  const tied = unsold.reduce((s, it) => s + num(it.cost), 0);
  const potential = unsold.reduce((s, it) => s + num(it.target), 0);
  const avgDays = sold.length ? sold.reduce((s, it) => s + (daysBetween(it.date, it.soldDate) || 0), 0) / sold.length : NaN;

  $('#stats').innerHTML = [
    kpi('Articles en stock', unsold.length),
    kpi('Capital immobilisé', eur(tied)),
    kpi('Valeur de revente visée', eur(potential)),
    kpi('Ventes', sold.length),
    kpi('Chiffre d\'affaires', eur(revenue)),
    kpi('Bénéfice brut', eur(profit), profit >= 0 ? 'good' : 'bad'),
    kpi('Après cotisations (est.)', eur(profit - revenue * socialRate), profit - revenue * socialRate >= 0 ? 'good' : 'bad'),
    kpi('Délai moyen de vente', Number.isFinite(avgDays) ? `${Math.round(avgDays)} j` : '—'),
  ].join('');

  // DAC7: platforms report sellers reaching 30 sales or 2 000 € per calendar year.
  const year = String(new Date().getFullYear());
  const yearSales = sold.filter((it) => (it.soldDate || '').startsWith(year));
  const yearRevenue = yearSales.reduce((s, it) => s + num(it.soldPrice), 0);
  const dac7 = $('#dac7');
  if (yearSales.length >= DAC7.sales * 0.8 || yearRevenue >= DAC7.revenue * 0.8) {
    dac7.hidden = false;
    dac7.textContent = `Seuil DAC7 : ${yearSales.length} ventes et ${eur(yearRevenue)} en ${year}. `
      + `Au-delà de ${DAC7.sales} ventes ou ${eur(DAC7.revenue)} sur une plateforme, elle déclare tes ventes au fisc. `
      + 'Pense à avoir un statut (micro-entreprise) si ce n\'est pas déjà fait.';
  } else {
    dac7.hidden = true;
  }

  const filter = $('#filter').value;
  const rows = items
    .filter((it) => filter === 'all' || (filter === 'sold' ? it.status === 'sold' : it.status !== 'sold'))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  $('#items').innerHTML = rows.length ? rows.map((it) => {
    const p = profitOf(it);
    const days = daysBetween(it.date, it.status === 'sold' ? it.soldDate : today());
    return `<tr>
      <td>${esc(it.name)}</td>
      <td>${esc(it.source)}</td>
      <td class="num">${eur(num(it.cost))}</td>
      <td>${STATUS_LABELS[it.status] || esc(it.status)}</td>
      <td class="num">${it.status === 'sold' ? eur(num(it.soldPrice)) : (it.target ? `visé ${eur(num(it.target))}` : '—')}</td>
      <td class="num ${p >= 0 ? 'good' : 'bad'}">${eur(p)}</td>
      <td class="num">${Number.isFinite(days) ? days : '—'}</td>
      <td><button class="secondary" data-action="edit" data-id="${esc(it.id)}">Modifier</button>
          <button class="secondary" data-action="delete" data-id="${esc(it.id)}">✕</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" class="empty">Aucun article pour l\'instant.</td></tr>';
}

// ---------- CSV ----------
function toCsv(rows) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [FIELDS.join(';'), ...rows.map((r) => FIELDS.map((f) => cell(r[f])).join(';'))].join('\n');
}
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ';' || c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  if (!header) return [];
  return body.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])));
}

$('#export').addEventListener('click', () => {
  const blob = new Blob(['﻿' + toCsv(items)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `achat-revente-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$('#import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const imported = parseCsv((await file.text()).replace(/^﻿/, ''))
    .filter((r) => r.name)
    .map((r) => ({ ...Object.fromEntries(FIELDS.map((f) => [f, r[f] ?? ''])), id: r.id || String(Date.now() + Math.random()) }));
  const byId = new Map(items.map((it) => [it.id, it]));
  imported.forEach((it) => byId.set(it.id, it));
  items = [...byId.values()];
  saveItems();
  renderStock();
  e.target.value = '';
  alert(`${imported.length} article(s) importé(s).`);
});

renderCalc();
renderStock();
