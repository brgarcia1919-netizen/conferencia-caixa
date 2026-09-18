// ═══════════════════════════════════════════════════
// DIVERGÊNCIAS — dias em que sistema × banco não bateram
// Drill-down: por forma → transações órfãs de cada lado
// ═══════════════════════════════════════════════════

import { getClient } from './supabase.js';
import { el } from './ui-components.js';
import { formatBRL } from './data.js';
import { parseFile, readFileAsText } from './bank-parsers.js';

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

  // PostgREST limita 1000 rows por default — paginar em chunks
  async function fetchAll(qb) {
    const rows = [];
    let from = 0;
    const size = 1000;
    while (true) {
      const { data, error } = await qb.range(from, from + size - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < size) break;
      from += size;
    }
    return rows;
  }
  const [vRows, bRows] = await Promise.all([
    fetchAll(getClient().from('transacoes_vissmed').select('*').order('data')),
    fetchAll(getClient().from('transacoes_banco').select('*').eq('ignorado', false).order('data')),
  ]);
  const vRes = { data: vRows, error: null };
  const bRes = { data: bRows, error: null };
  if (vRes.error) { container.innerHTML = `Erro: ${vRes.error.message}`; return; }
  if (bRes.error) { container.innerHTML = `Erro: ${bRes.error.message}`; return; }

  vissmedRows = vRes.data;
  bancoRows = bRes.data;

  // 1) Remove pares transferência/devolução do mesmo pagador (estornos)
  const canceledIdxs = cancelEstornos(bancoRows);
  if (canceledIdxs.size > 0) {
    bancoRows = bancoRows.filter((_, i) => !canceledIdxs.has(i));
  }
  // 2) Remove devoluções isoladas (valor < 0) — sao saidas de dinheiro (reembolsos),
  //    nao fazem parte da conferencia de vendas
  bancoRows = bancoRows.filter(b => parseFloat(b.valor_bruto || 0) >= 0);

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

  // Upload toolbar
  const uploadBar = el('div', { className: 'toolbar', style: 'margin-bottom:16px' });
  const uploadLeft = el('div', { className: 'toolbar-left', style: 'gap:12px;flex-wrap:wrap;align-items:center' });
  const fileInput = el('input', { type: 'file', id: 'file-input-extratos', accept: '.csv,.ofx', multiple: 'multiple', style: 'display:none' });
  const btn = el('button', { className: 'btn btn-primary', textContent: '📥 Importar extratos', onClick: () => fileInput.click() });
  const statusEl = el('span', { id: 'upload-status', style: 'color:var(--text-muted);font-size:0.9em' });
  const dateInp = el('input', { type: 'date', className: 'date-picker', id: 'vissmed-pull-date', value: new Date().toISOString().slice(0, 10) });
  const btnVissmed = el('button', {
    className: 'btn btn-secondary', textContent: '🔄 Atualizar Vissmed',
    onClick: async () => {
      const d = document.getElementById('vissmed-pull-date').value;
      if (!d) return;
      btnVissmed.disabled = true;
      const orig = btnVissmed.textContent;
      btnVissmed.textContent = '⏳ Puxando…';
      statusEl.textContent = `Puxando Vissmed do ${d} (24 caixas)…`;
      statusEl.style.color = 'var(--primary)';
      try {
        const r = await fetch(`/api/vissmed-pull?data=${d}`);
        const j = await r.json();
        if (j.ok) {
          statusEl.textContent = `✓ Vissmed ${d}: ${j.tx_total} tx importadas. Recarregando…`;
          statusEl.style.color = 'var(--success)';
          setTimeout(() => renderDivergencias(), 800);
        } else {
          statusEl.textContent = 'Erro: ' + (j.error || JSON.stringify(j));
          statusEl.style.color = 'var(--danger)';
        }
      } catch (e) {
        statusEl.textContent = 'Erro rede: ' + e.message;
        statusEl.style.color = 'var(--danger)';
      } finally {
        btnVissmed.disabled = false;
        btnVissmed.textContent = orig;
      }
    },
  });
  fileInput.addEventListener('change', (e) => handleUpload(e.target.files, statusEl));
  uploadLeft.appendChild(btn);
  uploadLeft.appendChild(fileInput);
  uploadLeft.appendChild(el('span', { textContent: ' · ', style: 'color:var(--text-muted)' }));
  uploadLeft.appendChild(dateInp);
  uploadLeft.appendChild(btnVissmed);
  uploadLeft.appendChild(statusEl);
  uploadBar.appendChild(uploadLeft);
  container.appendChild(uploadBar);

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

async function handleUpload(files, statusEl) {
  if (!files || files.length === 0) return;
  statusEl.textContent = `Lendo ${files.length} arquivo(s)…`;
  statusEl.style.color = 'var(--primary)';
  const allRows = [];
  const perFile = [];
  try {
    for (const f of files) {
      const text = await readFileAsText(f);
      const { fonte, rows } = parseFile(f.name, text);
      perFile.push({ name: f.name, fonte, count: rows.length });
      allRows.push(...rows);
    }
  } catch (e) {
    statusEl.textContent = 'Erro lendo arquivo: ' + e.message;
    statusEl.style.color = 'var(--danger)';
    return;
  }

  if (allRows.length === 0) {
    statusEl.textContent = 'Nenhuma transação encontrada nos arquivos.';
    statusEl.style.color = 'var(--danger)';
    return;
  }

  // Set de (fonte, data) que os uploads cobrem — deletar antes de reinserir
  const scopes = new Set();
  allRows.forEach(r => scopes.add(`${r.fonte}|${r.data}`));

  statusEl.textContent = `${allRows.length} tx encontradas. Substituindo dados anteriores…`;

  const client = getClient();
  // DELETE por (fonte + data) — evita duplicar se reimportar mesmo dia
  for (const scope of scopes) {
    const [fonte, data] = scope.split('|');
    await client.from('transacoes_banco').delete().eq('fonte', fonte).eq('data', data);
  }

  // INSERT em lotes
  const CHUNK = 200;
  for (let i = 0; i < allRows.length; i += CHUNK) {
    const batch = allRows.slice(i, i + CHUNK);
    const { error } = await client.from('transacoes_banco').insert(batch);
    if (error) {
      statusEl.textContent = `Erro salvando: ${error.message}`;
      statusEl.style.color = 'var(--danger)';
      return;
    }
  }

  // Recompute conferencia_dias p/ cada data (atualiza Diario/Mensal)
  statusEl.textContent = `Recalculando totais dos dias…`;
  const uniqDates = [...new Set(allRows.map(r => r.data))];
  for (const d of uniqDates) {
    try { await fetch(`/api/recompute-day?data=${d}`); } catch (e) {}
  }

  const perFileMsg = perFile.map(p => `${p.name} → ${p.count}`).join(' · ');
  statusEl.textContent = `✓ ${allRows.length} tx importadas (${perFileMsg}). Recarregando…`;
  statusEl.style.color = 'var(--success)';
  setTimeout(() => renderDivergencias(), 800);
}

function normName(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(x => x.length > 2);
}
function nameSim(a, b) {
  const A = new Set(normName(a));
  const B = new Set(normName(b));
  if (A.size === 0 || B.size === 0) return 0;
  let hit = 0; A.forEach(x => { if (B.has(x)) hit++; });
  return hit / Math.min(A.size, B.size);
}

// Detecta e cancela pares Transferência | Pix (+) e Devolução | Pix (-) do mesmo pagador
// Rodam sobre TODAS as transacoes banco (nao so do dia), pra pegar estornos em dias diferentes.
function cancelEstornos(allBanco) {
  const canceled = new Set();
  // Agrupar por pagador+valor absoluto (só stone_tmm_conta)
  const groups = {};
  allBanco.forEach((b, i) => {
    if (b.fonte !== 'stone_tmm_conta' || !b.pagador) return;
    const key = `${b.pagador}|${Math.round(Math.abs(parseFloat(b.valor_bruto)) * 100)}`;
    (groups[key] = groups[key] || []).push(i);
  });
  Object.values(groups).forEach(idxs => {
    if (idxs.length < 2) return;
    const pos = idxs.filter(i => parseFloat(allBanco[i].valor_bruto) > 0);
    const neg = idxs.filter(i => parseFloat(allBanco[i].valor_bruto) < 0);
    const n = Math.min(pos.length, neg.length);
    for (let k = 0; k < n; k++) {
      canceled.add(pos[k]);
      canceled.add(neg[k]);
    }
  });
  return canceled;
}

function toMin(h) {
  if (!h) return 0;
  const p = h.split(':');
  return (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0);
}

function matchDay(vDay, bDay) {
  const bUsed = new Array(bDay.length).fill(false);
  const vUsed = new Array(vDay.length).fill(false);

  // Pass 1: 1-para-1 valor exato — matching global por score
  //   +1000 se NS bate atendente esperado
  //   -abs(minutos diff) por distancia temporal
  // Constroi TODOS os pares candidatos, ordena por score desc, casa gulosamente
  const pairs = [];
  for (let i = 0; i < vDay.length; i++) {
    const v = vDay[i];
    const val = parseFloat(v.valor_liquido);
    const vMin = toMin(v.hora);
    for (let j = 0; j < bDay.length; j++) {
      const b = bDay[j];
      if (Math.abs(parseFloat(b.valor_bruto) - val) >= 0.01) continue;
      let score = 0;
      if (b.ns_maquininha && NS_ATENDENTE[b.ns_maquininha] === v.atendente) score += 1000;
      score -= Math.abs(vMin - toMin(b.hora));
      pairs.push({ i, j, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  for (const { i, j } of pairs) {
    if (vUsed[i] || bUsed[j]) continue;
    vUsed[i] = true; bUsed[j] = true;
  }

  // Pass 2: N-para-1 (subset de banco soma = 1 Vissmed) — nome do pagador confirma quando existe
  vDay.forEach((v, i) => {
    if (vUsed[i]) return;
    const target = Math.round(parseFloat(v.valor_liquido) * 100);
    const availIdxs = bDay.map((_, j) => j).filter(j => !bUsed[j]);
    // Tenta pares primeiro
    let found = null;
    for (let a = 0; a < availIdxs.length && !found; a++) {
      for (let b = a + 1; b < availIdxs.length && !found; b++) {
        const s = Math.round((parseFloat(bDay[availIdxs[a]].valor_bruto) + parseFloat(bDay[availIdxs[b]].valor_bruto)) * 100);
        if (s === target) {
          const sim = Math.max(nameSim(v.paciente, bDay[availIdxs[a]].pagador), nameSim(v.paciente, bDay[availIdxs[b]].pagador));
          if (sim > 0.3 || !bDay[availIdxs[a]].pagador) found = [availIdxs[a], availIdxs[b]];
        }
      }
    }
    // Trios
    if (!found) {
      for (let a = 0; a < availIdxs.length && !found; a++) {
        for (let b = a + 1; b < availIdxs.length && !found; b++) {
          for (let c = b + 1; c < availIdxs.length && !found; c++) {
            const s = Math.round((parseFloat(bDay[availIdxs[a]].valor_bruto) + parseFloat(bDay[availIdxs[b]].valor_bruto) + parseFloat(bDay[availIdxs[c]].valor_bruto)) * 100);
            if (s === target) {
              const sim = Math.max(nameSim(v.paciente, bDay[availIdxs[a]].pagador), nameSim(v.paciente, bDay[availIdxs[b]].pagador), nameSim(v.paciente, bDay[availIdxs[c]].pagador));
              if (sim > 0.3 || !bDay[availIdxs[a]].pagador) found = [availIdxs[a], availIdxs[b], availIdxs[c]];
            }
          }
        }
      }
    }
    if (found) { found.forEach(j => bUsed[j] = true); vUsed[i] = true; }
  });

  // Pass 3: 1-para-N (1 banco = soma de vários Vissmed do mesmo paciente)
  bDay.forEach((b, j) => {
    if (bUsed[j]) return;
    const target = Math.round(parseFloat(b.valor_bruto) * 100);
    const availIdxs = vDay.map((_, i) => i).filter(i => !vUsed[i]);
    let found = null;
    for (let a = 0; a < availIdxs.length && !found; a++) {
      for (let bi = a + 1; bi < availIdxs.length && !found; bi++) {
        const s = Math.round((parseFloat(vDay[availIdxs[a]].valor_liquido) + parseFloat(vDay[availIdxs[bi]].valor_liquido)) * 100);
        if (s === target) {
          const sim = b.pagador ? Math.max(nameSim(vDay[availIdxs[a]].paciente, b.pagador), nameSim(vDay[availIdxs[bi]].paciente, b.pagador)) : 1;
          if (sim > 0.3) found = [availIdxs[a], availIdxs[bi]];
        }
      }
    }
    if (found) { found.forEach(i => vUsed[i] = true); bUsed[j] = true; }
  });

  const vUnmatched = vDay.filter((_, i) => !vUsed[i]);
  const bUnmatched = bDay.filter((_, i) => !bUsed[i]);
  return { vUnmatched, bUnmatched };
}

const FORMA_LBL = { credito: 'Crédito', debito: 'Débito', pix: 'PIX' };

function buildDrillDown(dayRow) {
  const wrap = el('div', { style: 'padding:16px 20px' });
  const { difs } = difsForDay(dayRow);

  // Passo 1: intra-forma matching, coletar não-pareados por forma
  const perForma = {};
  FORMAS.forEach(f => {
    const vDay = vissmedRows.filter(v => v.data === dayRow.data && bucket(v.forma) === f.key);
    const bDay = bancoRows.filter(b => b.data === dayRow.data && bucket(b.forma) === f.key);
    perForma[f.key] = matchDay(vDay, bDay);
  });

  // Passo 2: cross-forma matching — Vissmed forma X ↔ Banco forma Y
  // Empareia por (valor exato, mesma data) — se casar, era forma trocada
  const crossPairs = []; // {v, b, vForma, bForma}
  const consumedV = new Set();
  const consumedB = new Set();
  // Cross-forma requer sinal FORTE: nome do paciente/pagador similar (>0.5)
  // OU NS da maquininha bate atendente. Sem isso e' coincidencia numerica.
  for (const fv of FORMAS) {
    for (const v of perForma[fv.key].vUnmatched) {
      if (consumedV.has(v.id)) continue;
      const val = parseFloat(v.valor_liquido);
      let paired = false;
      for (const fb of FORMAS) {
        if (paired) break;
        if (fb.key === fv.key) continue;
        for (const b of perForma[fb.key].bUnmatched) {
          if (consumedB.has(b.id)) continue;
          if (Math.abs(parseFloat(b.valor_bruto) - val) >= 0.01) continue;
          const nameSimVal = b.pagador ? nameSim(v.paciente, b.pagador) : 0;
          const nsOk = !!(b.ns_maquininha && NS_ATENDENTE[b.ns_maquininha] === v.atendente);
          // Sinal forte necessario: NS bate OU nome bate (>0.5)
          if (nsOk || nameSimVal > 0.5) {
            crossPairs.push({ v, b, vForma: fv.key, bForma: fb.key });
            consumedV.add(v.id);
            consumedB.add(b.id);
            paired = true;
            break;
          }
        }
      }
    }
  }

  // Renderiza cross-forma no topo
  if (crossPairs.length > 0) {
    const secX = el('div', { style: 'margin-bottom:20px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 16px' });
    secX.appendChild(el('div', { style: 'font-weight:600;margin-bottom:8px;color:#9a3412', innerHTML: `🔄 Forma trocada (${crossPairs.length}) — casaram entre formas diferentes` }));
    secX.appendChild(el('div', { style: 'font-size:0.85em;color:var(--text-muted);margin-bottom:10px', textContent: 'Cliente pagou uma forma, atendente lançou outra. Valor bate mas a categoria não.' }));
    crossPairs.forEach(p => {
      const atd = p.v.atendente || (p.b.ns_maquininha && NS_ATENDENTE[p.b.ns_maquininha]) || '?';
      const line = el('div', { style: 'padding:8px 10px;background:white;border-radius:6px;font-size:0.85em;margin-bottom:6px;border-left:3px solid #f97316' });
      line.innerHTML = `<strong>R$ ${formatBRL(parseFloat(p.v.valor_liquido))}</strong> · <strong>${shortName(atd)}</strong><br>` +
        `<span style="color:var(--text-muted)">Vissmed: <strong>${FORMA_LBL[p.vForma]}</strong> · OS ${(p.v.os || '').split('/')[0]} · ${(p.v.paciente || '').slice(0, 30)}</span><br>` +
        `<span style="color:var(--text-muted)">Banco: <strong>${FORMA_LBL[p.bForma]}</strong> · ${FONTE_LABELS[p.b.fonte]} · ${p.b.pagador ? 'pag: ' + p.b.pagador.slice(0, 30) : (p.b.ns_maquininha || '-')}</span>`;
      secX.appendChild(line);
    });
    wrap.appendChild(secX);
  }

  FORMAS.forEach(f => {
    const x = difs[f.key];
    if (Math.abs(x.dif) < 0.01) return;

    const sec = el('div', { style: 'margin-bottom:20px;background:white;border-radius:8px;padding:12px 16px;border:1px solid var(--border)' });
    const sign = x.dif > 0 ? '+' : '';
    const explain = x.dif > 0 ? `Sistema tem <strong>R$${formatBRL(x.dif)} A MAIS</strong> → sobrou no Vissmed OU falta no banco` : `Sistema tem <strong>R$${formatBRL(-x.dif)} A MENOS</strong> → falta lançar no Vissmed OU sobra no banco`;
    sec.appendChild(el('div', { style: 'font-weight:600;margin-bottom:8px', innerHTML: `${f.icon} ${f.label} · Sistema R$${formatBRL(x.sistema)} vs Banco R$${formatBRL(x.banco)} → <span class="status-div">${sign}R$${formatBRL(x.dif)}</span>` }));
    sec.appendChild(el('div', { style: 'font-size:0.85em;color:var(--text-muted);margin-bottom:12px', innerHTML: explain }));

    // Filtrar unmatched removendo os que viraram cross-forma
    const vUnmatched = perForma[f.key].vUnmatched.filter(v => !consumedV.has(v.id));
    const bUnmatched = perForma[f.key].bUnmatched.filter(b => !consumedB.has(b.id));
    if (vUnmatched.length === 0 && bUnmatched.length === 0) { return; }

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
      const isEcom = b.meio_captura === 'E-commerce';
      let fonteLbl = FONTE_LABELS[b.fonte] || b.fonte;
      if (isEcom) fonteLbl += ' (link de pagamento)';
      let atdLine = '';
      if (b.ns_maquininha && NS_ATENDENTE[b.ns_maquininha]) {
        atdLine = `NS ${b.ns_maquininha.slice(-6)} → <strong>${shortName(NS_ATENDENTE[b.ns_maquininha])}</strong>`;
      } else if (b.pagador) {
        atdLine = `pag: <strong>${b.pagador.slice(0, 30)}</strong>`;
      }
      const div = el('div', { style: 'padding:6px 8px;background:#fef2f2;border-radius:6px;font-size:0.85em;margin-bottom:4px;position:relative' });
      div.innerHTML = `<strong>R$ ${formatBRL(parseFloat(b.valor_bruto))}</strong> · ${(b.hora || '').slice(0, 5)} · ${fonteLbl}` + (atdLine ? `<br><span style="color:var(--text-muted)">${atdLine}</span>` : '');
      const ignoreBtn = el('button', {
        style: 'position:absolute;top:6px;right:8px;background:transparent;border:1px solid var(--rule,#e5e7eb);color:var(--text-muted);font-size:0.75em;padding:2px 8px;border-radius:4px;cursor:pointer',
        textContent: '✓ Estorno',
        title: 'Marcar como estornado / ignorar dessa conferência',
        onClick: async (e) => {
          e.stopPropagation();
          const motivo = prompt('Motivo pra ignorar essa tx (ex: "estornado 16/09")');
          if (motivo === null) return;
          const { error } = await getClient().from('transacoes_banco').update({ ignorado: true, motivo_ignore: motivo }).eq('id', b.id);
          if (error) { alert('Erro: ' + error.message); return; }
          try { await fetch(`/api/recompute-day?data=${b.data}`); } catch (_) {}
          renderDivergencias();
        },
      });
      div.appendChild(ignoreBtn);
      right.appendChild(div);
    });
    grid.appendChild(right);

    sec.appendChild(grid);
    wrap.appendChild(sec);
  });

  return wrap;
}
