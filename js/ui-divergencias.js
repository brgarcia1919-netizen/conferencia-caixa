// ═══════════════════════════════════════════════════
// DIVERGÊNCIAS — dias em que sistema × banco não bateram
// Drill-down: por forma → transações órfãs de cada lado
// ═══════════════════════════════════════════════════

import { getClient } from './supabase.js';
import { el } from './ui-components.js';
import { formatBRL } from './data.js';

// PIX Maquininha + PIX Conta juntos no bucket "pix" (igual view mensal)
// Dinheiro e Convênio não passam pelos bancos — omitidos aqui.
const FORMAS = [
  { key: 'credito', label: 'Crédito', icon: '💳' },
  { key: 'debito', label: 'Débito', icon: '💳' },
  { key: 'pix', label: 'PIX', icon: '📱' },
];

const NS_ATENDENTE = {
  '4AH329X3J': 'ANA CLAUDIA',
  '4AH91HP5A': 'ANA LUCIA BATISTA DA SILVA LIMA',
  'PB4M259Q74930': 'ADELINI ALVES PENTEADO DA SILVA',
  'PB09241472793': 'ALINE RECEPCAO',
  'PB09241275622': 'GIOVANA CLARA DE MELLO',
};

const FONTE_LABELS = {
  stone_tmm: 'Stone TMM',
  stone_brg: 'Stone BRG',
  stone_tmm_conta: 'Stone TMM (PIX conta)',
  infinite_brg: 'Infinite Pay',
};

let vissmedRows = [];
let bancoRows = [];
let dailyRows = [];
let selectedDate = null;

function bucket(forma) {
  if (forma === 'pix_maquininha' || forma === 'pix_conta') return 'pix';
  return forma;
}

function shortName(n) {
  if (!n) return '?';
  return n.split(' ').slice(0, 2).join(' ');
}

function ymShort(date) { return date; }

export async function renderDivergencias() {
  const container = document.getElementById('view-divergencias');
  container.innerHTML = '<div class="card" style="padding:24px;text-align:center;color:var(--text-muted)">Carregando…</div>';

  const [vRes, bRes] = await Promise.all([
    getClient().from('transacoes_vissmed').select('*').order('data'),
    getClient().from('transacoes_banco').select('*').order('data'),
  ]);
  if (vRes.error) { container.innerHTML = `Erro: ${vRes.error.message}`; return; }
  if (bRes.error) { container.innerHTML = `Erro: ${bRes.error.message}`; return; }

  vissmedRows = vRes.data;
  bancoRows = bRes.data;

  // Compute daily totals per bucket
  const byDay = {};
  for (const v of vissmedRows) {
    if (!byDay[v.data]) byDay[v.data] = { data: v.data, sistema: {}, banco: {} };
    const b = bucket(v.forma);
    byDay[v.data].sistema[b] = (byDay[v.data].sistema[b] || 0) + parseFloat(v.valor_liquido || 0);
  }
  for (const b of bancoRows) {
    if (!byDay[b.data]) byDay[b.data] = { data: b.data, sistema: {}, banco: {} };
    const bk = bucket(b.forma);
    byDay[b.data].banco[bk] = (byDay[b.data].banco[bk] || 0) + parseFloat(b.valor_bruto || 0);
  }

  dailyRows = Object.values(byDay).sort((a, b) => b.data.localeCompare(a.data));
  render();
}

function difsForDay(d) {
  const difs = {};
  let anyDif = false;
  FORMAS.forEach(f => {
    const s = d.sistema[f.key] || 0;
    const b = d.banco[f.key] || 0;
    const dif = Math.round((s - b) * 100) / 100;
    difs[f.key] = { sistema: s, banco: b, dif };
    if (Math.abs(dif) > 0.01) anyDif = true;
  });
  return { difs, anyDif };
}

function render() {
  const container = document.getElementById('view-divergencias');
  container.innerHTML = '';

  const soDivergentes = dailyRows.filter(d => difsForDay(d).anyDif);

  // Summary
  const summary = el('div', { className: 'summary-cards' });
  summary.appendChild(el('div', { className: 'summary-card divergent' }, [
    el('div', { className: 'summary-card-label', textContent: 'Dias com divergência' }),
    el('div', { className: 'summary-card-value divergent', textContent: `${soDivergentes.length} / ${dailyRows.length}` }),
  ]));

  // Total dif absoluto
  let sumAbs = 0;
  soDivergentes.forEach(d => {
    const { difs } = difsForDay(d);
    Object.values(difs).forEach(x => { sumAbs += Math.abs(x.dif); });
  });
  summary.appendChild(el('div', { className: 'summary-card divergent' }, [
    el('div', { className: 'summary-card-label', textContent: 'Soma |diferenças|' }),
    el('div', { className: 'summary-card-value divergent', textContent: 'R$ ' + formatBRL(sumAbs) }),
  ]));

  container.appendChild(summary);

  // Table of days with divergence
  const card = el('div', { className: 'card' });
  const title = el('div', { style: 'padding:16px 20px; border-bottom:1px solid var(--border); font-weight:600' }, [
    el('span', { textContent: '📅 Dias que não bateram — clique para ver detalhes' }),
  ]);
  card.appendChild(title);

  const table = el('table', { className: 'monthly-table' });
  const thead = el('thead');
  const hr = el('tr');
  ['Data', 'Crédito', 'Débito', 'PIX', ''].forEach(h => hr.appendChild(el('th', { textContent: h })));
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = el('tbody');
  if (soDivergentes.length === 0) {
    const trE = el('tr');
    trE.appendChild(el('td', { colspan: '5', style: 'text-align:center;padding:24px;color:var(--success)', textContent: '✓ Nenhum dia com divergência.' }));
    tbody.appendChild(trE);
  }
  soDivergentes.forEach(d => {
    const { difs } = difsForDay(d);
    const isSelected = selectedDate === d.data;
    const tr = el('tr', { style: 'cursor:pointer' + (isSelected ? ';background:var(--primary-light)' : ''), onClick: () => { selectedDate = isSelected ? null : d.data; render(); } });
    tr.appendChild(el('td', { textContent: d.data, style: 'font-weight:600' }));
    FORMAS.forEach(f => {
      const x = difs[f.key];
      const td = el('td');
      if (Math.abs(x.dif) < 0.01) {
        td.innerHTML = `<span class="status-ok">✓</span>`;
      } else {
        const sign = x.dif > 0 ? '+' : '';
        td.innerHTML = `<span class="status-div" title="Sistema ${formatBRL(x.sistema)} · Banco ${formatBRL(x.banco)}">${sign}${formatBRL(x.dif)}</span>`;
      }
      tr.appendChild(td);
    });
    tr.appendChild(el('td', { textContent: isSelected ? '▼' : '▶', style: 'color:var(--text-muted)' }));
    tbody.appendChild(tr);

    if (isSelected) {
      const trDrill = el('tr');
      const td = el('td', { colspan: '5', style: 'background:#f8fafc;padding:0' });
      td.appendChild(buildDrillDown(d));
      trDrill.appendChild(td);
      tbody.appendChild(trDrill);
    }
  });
  table.appendChild(tbody);
  card.appendChild(table);
  container.appendChild(card);
}

function buildDrillDown(dayRow) {
  const wrap = el('div', { style: 'padding:16px 20px' });
  const { difs } = difsForDay(dayRow);

  // For each forma with divergence, show unmatched tx
  FORMAS.forEach(f => {
    const x = difs[f.key];
    if (Math.abs(x.dif) < 0.01) return;

    const sec = el('div', { style: 'margin-bottom:20px;background:white;border-radius:8px;padding:12px 16px;border:1px solid var(--border)' });
    const sign = x.dif > 0 ? '+' : '';
    const explain = x.dif > 0 ? `Sistema tem <strong>R$${formatBRL(x.dif)} A MAIS</strong> → provavelmente sobrou lançamento no Vissmed OU falta transação no banco` : `Sistema tem <strong>R$${formatBRL(-x.dif)} A MENOS</strong> → provavelmente falta lançar no Vissmed OU sobra tx no banco`;
    sec.appendChild(el('div', { style: 'font-weight:600;margin-bottom:8px', innerHTML: `${f.icon} ${f.label} · Sistema R$${formatBRL(x.sistema)} vs Banco R$${formatBRL(x.banco)} → <span class="status-div">${sign}R$${formatBRL(x.dif)}</span>` }));
    sec.appendChild(el('div', { style: 'font-size:0.85em;color:var(--text-muted);margin-bottom:12px', innerHTML: explain }));

    // Match tx of this forma this day, mark unmatched
    const vDay = vissmedRows.filter(v => v.data === dayRow.data && bucket(v.forma) === f.key);
    const bDay = bancoRows.filter(b => b.data === dayRow.data && bucket(b.forma) === f.key);
    const bUsed = new Array(bDay.length).fill(false);
    const vUnmatched = [];
    vDay.forEach(v => {
      const val = parseFloat(v.valor_liquido);
      let idx = bDay.findIndex((b, i) => !bUsed[i] && Math.abs(parseFloat(b.valor_bruto) - val) < 0.01);
      if (idx >= 0) bUsed[idx] = true;
      else vUnmatched.push(v);
    });
    const bUnmatched = bDay.filter((_, i) => !bUsed[i]);

    // 2 columns
    const grid = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' });

    const left = el('div');
    left.appendChild(el('div', { style: 'font-weight:600;font-size:0.9em;margin-bottom:6px;color:#7c3aed', innerHTML: `📋 Vissmed sem par no banco (${vUnmatched.length}) — quem lançou:` }));
    if (vUnmatched.length === 0) left.appendChild(el('div', { style: 'color:var(--text-muted);font-size:0.85em', textContent: '(nenhum)' }));
    vUnmatched.sort((a, b) => parseFloat(b.valor_liquido) - parseFloat(a.valor_liquido)).forEach(v => {
      const div = el('div', { style: 'padding:6px 8px;background:#f5f3ff;border-radius:6px;font-size:0.85em;margin-bottom:4px' });
      div.innerHTML = `<strong>R$ ${formatBRL(parseFloat(v.valor_liquido))}</strong> · ${(v.hora || '').slice(0, 5)} · <strong>${shortName(v.atendente)}</strong><br><span style="color:var(--text-muted)">OS ${(v.os || '').split('/')[0]} · ${(v.paciente || '').slice(0, 40)} · <em>${v.forma_raw}</em></span>`;
      left.appendChild(div);
    });
    grid.appendChild(left);

    const right = el('div');
    right.appendChild(el('div', { style: 'font-weight:600;font-size:0.9em;margin-bottom:6px;color:var(--danger)', innerHTML: `🏦 Banco sem par no Vissmed (${bUnmatched.length}) — quem deveria ter lançado:` }));
    if (bUnmatched.length === 0) right.appendChild(el('div', { style: 'color:var(--text-muted);font-size:0.85em', textContent: '(nenhum)' }));
    bUnmatched.sort((a, b) => parseFloat(b.valor_bruto) - parseFloat(a.valor_bruto)).forEach(b => {
      const atd = b.ns_maquininha && NS_ATENDENTE[b.ns_maquininha] ? NS_ATENDENTE[b.ns_maquininha] : '?';
      const div = el('div', { style: 'padding:6px 8px;background:#fef2f2;border-radius:6px;font-size:0.85em;margin-bottom:4px' });
      const nsInfo = b.ns_maquininha ? `NS ${b.ns_maquininha.slice(-6)} → <strong>${shortName(atd)}</strong>` : (b.pagador ? `pag: ${b.pagador.slice(0, 30)}` : '(sem identificação)');
      div.innerHTML = `<strong>R$ ${formatBRL(parseFloat(b.valor_bruto))}</strong> · ${(b.hora || '').slice(0, 5)} · ${FONTE_LABELS[b.fonte] || b.fonte}<br><span style="color:var(--text-muted)">${nsInfo}</span>`;
      right.appendChild(div);
    });
    grid.appendChild(right);

    sec.appendChild(grid);
    wrap.appendChild(sec);
  });

  return wrap;
}
