// ═══════════════════════════════════════════════════
// DIVERGÊNCIAS VIEW — rastreio de erros por atendente
// ═══════════════════════════════════════════════════

import { getClient } from './supabase.js';
import { el } from './ui-components.js';
import { formatBRL } from './data.js';

const TIPO_ERRO_LABELS = {
  forma_trocada: { label: '🔄 Forma trocada', cls: 'div-forma' },
  banco_sem_par: { label: '💸 Banco sem par', cls: 'div-orfao' },
  vissmed_sem_par: { label: '👻 Vissmed sem par', cls: 'div-fantasma' },
  ns_errada: { label: '📟 Maquininha errada', cls: 'div-ns' },
};

const FORMA_LABELS = {
  credito: 'Crédito',
  debito: 'Débito',
  pix_maquininha: 'PIX Maquininha',
  pix_conta: 'PIX Conta',
};

const FONTE_LABELS = {
  stone_tmm: 'Stone TMM',
  stone_brg: 'Stone BRG',
  stone_tmm_conta: 'Stone TMM (conta)',
  infinite_brg: 'Infinite Pay BRG',
};

let allRows = [];
let filters = { atendente: '', tipo: '', mes: '' };

export async function renderDivergencias() {
  const container = document.getElementById('view-divergencias');
  if (!container) return;

  const { data, error } = await getClient()
    .from('divergencias')
    .select('*')
    .order('data', { ascending: false })
    .order('hora_vissmed', { ascending: false });

  if (error) {
    container.innerHTML = `<div class="card" style="padding:24px;color:var(--danger)">Erro ao carregar: ${error.message}</div>`;
    return;
  }

  allRows = data || [];
  render();
}

function shortName(n) {
  if (!n) return '?';
  return n.split(' ').slice(0, 2).join(' ');
}

function render() {
  const container = document.getElementById('view-divergencias');
  container.innerHTML = '';

  // Toolbar
  const toolbar = el('div', { className: 'toolbar' });
  const left = el('div', { className: 'toolbar-left', style: 'gap:12px; flex-wrap:wrap' });

  const atendentes = [...new Set(allRows.map(r => r.atendente))].sort();
  const meses = [...new Set(allRows.map(r => r.data?.slice(0, 7)))].sort().reverse();

  const selAtendente = el('select', { className: 'month-picker', style: 'min-width:180px', onChange: e => { filters.atendente = e.target.value; render(); } });
  selAtendente.appendChild(el('option', { value: '', textContent: 'Todas atendentes' }));
  atendentes.forEach(a => {
    const opt = el('option', { value: a, textContent: shortName(a) });
    if (a === filters.atendente) opt.selected = true;
    selAtendente.appendChild(opt);
  });

  const selTipo = el('select', { className: 'month-picker', style: 'min-width:180px', onChange: e => { filters.tipo = e.target.value; render(); } });
  selTipo.appendChild(el('option', { value: '', textContent: 'Todos tipos de erro' }));
  Object.entries(TIPO_ERRO_LABELS).forEach(([k, v]) => {
    const opt = el('option', { value: k, textContent: v.label });
    if (k === filters.tipo) opt.selected = true;
    selTipo.appendChild(opt);
  });

  const selMes = el('select', { className: 'month-picker', style: 'min-width:140px', onChange: e => { filters.mes = e.target.value; render(); } });
  selMes.appendChild(el('option', { value: '', textContent: 'Todos meses' }));
  meses.forEach(m => {
    const opt = el('option', { value: m, textContent: m });
    if (m === filters.mes) opt.selected = true;
    selMes.appendChild(opt);
  });

  left.appendChild(selAtendente);
  left.appendChild(selTipo);
  left.appendChild(selMes);

  const chkPend = el('label', { style: 'display:flex;align-items:center;gap:6px;cursor:pointer' }, [
    el('input', { type: 'checkbox', id: 'chk-pendentes-only', checked: filters.pendentes ? 'checked' : '', onChange: e => { filters.pendentes = e.target.checked; render(); } }),
    el('span', { textContent: 'Só pendentes' }),
  ]);
  left.appendChild(chkPend);

  toolbar.appendChild(left);
  container.appendChild(toolbar);

  // Apply filters
  let rows = allRows.slice();
  if (filters.atendente) rows = rows.filter(r => r.atendente === filters.atendente);
  if (filters.tipo) rows = rows.filter(r => r.tipo_erro === filters.tipo);
  if (filters.mes) rows = rows.filter(r => r.data?.startsWith(filters.mes));
  if (filters.pendentes) rows = rows.filter(r => !r.resolvido);

  // Summary cards
  const totalErros = rows.length;
  const totalValor = rows.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);
  const porTipo = {};
  rows.forEach(r => { porTipo[r.tipo_erro] = (porTipo[r.tipo_erro] || 0) + 1; });
  const porAtd = {};
  rows.forEach(r => { porAtd[r.atendente] = (porAtd[r.atendente] || 0) + 1; });

  const summary = el('div', { className: 'summary-cards' });
  summary.appendChild(el('div', { className: 'summary-card divergent' }, [
    el('div', { className: 'summary-card-label', textContent: 'Divergências' }),
    el('div', { className: 'summary-card-value divergent', textContent: String(totalErros) }),
  ]));
  summary.appendChild(el('div', { className: 'summary-card divergent' }, [
    el('div', { className: 'summary-card-label', textContent: 'Valor total' }),
    el('div', { className: 'summary-card-value divergent', textContent: 'R$ ' + formatBRL(totalValor) }),
  ]));
  // Top 3 atendentes
  const top3 = Object.entries(porAtd).sort((a, b) => b[1] - a[1]).slice(0, 3);
  top3.forEach(([atd, n]) => {
    summary.appendChild(el('div', { className: 'summary-card' }, [
      el('div', { className: 'summary-card-label', textContent: shortName(atd) }),
      el('div', { className: 'summary-card-value', textContent: `${n} erro${n > 1 ? 's' : ''}` }),
    ]));
  });
  container.appendChild(summary);

  // Table
  const card = el('div', { className: 'card' });
  const table = el('table', { className: 'monthly-table' });
  const thead = el('thead');
  const tr = el('tr');
  ['Data', 'Hora', 'Atendente', 'Tipo Erro', 'OS/Paciente', 'Valor', 'Vissmed', 'Banco', 'Detalhe', 'Status'].forEach(h => {
    tr.appendChild(el('th', { textContent: h }));
  });
  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = el('tbody');
  rows.slice(0, 500).forEach(r => {
    const trow = el('tr', { className: r.resolvido ? 'resolvido' : '' });
    trow.appendChild(el('td', { textContent: r.data || '' }));
    trow.appendChild(el('td', { textContent: (r.hora_vissmed || r.hora_banco || '').slice(0, 5) }));
    trow.appendChild(el('td', { textContent: shortName(r.atendente), style: 'font-weight:600' }));
    const tipoLbl = TIPO_ERRO_LABELS[r.tipo_erro] || { label: r.tipo_erro, cls: '' };
    const tdTipo = el('td');
    tdTipo.innerHTML = `<span class="badge-erro ${tipoLbl.cls}">${tipoLbl.label}</span>`;
    trow.appendChild(tdTipo);
    const osPac = r.os ? `${r.os.split('/')[0]} · ${(r.paciente || '').slice(0, 24)}` : (r.pagador_banco ? `pag: ${r.pagador_banco.slice(0, 24)}` : '-');
    trow.appendChild(el('td', { textContent: osPac }));
    trow.appendChild(el('td', { textContent: 'R$ ' + formatBRL(parseFloat(r.valor)), style: 'text-align:right;font-weight:600' }));
    trow.appendChild(el('td', { textContent: r.forma_vissmed ? (FORMA_LABELS[r.forma_vissmed] || r.forma_vissmed) : '-' }));
    trow.appendChild(el('td', { textContent: r.forma_banco ? (FORMA_LABELS[r.forma_banco] || r.forma_banco) : '-' }));

    let detalhe = '';
    if (r.tipo_erro === 'forma_trocada') {
      detalhe = `${FONTE_LABELS[r.fonte_banco] || r.fonte_banco || ''}${r.ns_banco ? ' · NS ' + r.ns_banco.slice(-6) : ''}`;
    } else if (r.tipo_erro === 'ns_errada') {
      detalhe = `NS ${r.ns_banco} → ${shortName(r.detalhe?.atendente_esperado_ns || '')}`;
    } else if (r.tipo_erro === 'banco_sem_par') {
      detalhe = FONTE_LABELS[r.fonte_banco] || r.fonte_banco || '';
    } else if (r.tipo_erro === 'vissmed_sem_par') {
      detalhe = 'Sem correspondente';
    }
    trow.appendChild(el('td', { textContent: detalhe, style: 'font-size:0.85em;color:var(--text-muted)' }));

    // Status button
    const tdStatus = el('td');
    const btn = el('button', {
      className: 'btn btn-icon',
      style: 'padding:4px 10px;font-size:0.85em;' + (r.resolvido ? 'background:var(--success-light);color:var(--success)' : 'background:var(--warning-light)'),
      textContent: r.resolvido ? '✓ Resolvido' : '⏳ Pendente',
      onClick: async () => {
        const { error } = await getClient().from('divergencias').update({ resolvido: !r.resolvido }).eq('id', r.id);
        if (!error) { r.resolvido = !r.resolvido; render(); }
      },
    });
    tdStatus.appendChild(btn);
    trow.appendChild(tdStatus);
    tbody.appendChild(trow);
  });
  table.appendChild(tbody);
  card.appendChild(table);
  container.appendChild(card);

  if (rows.length > 500) {
    container.appendChild(el('div', { style: 'text-align:center;padding:12px;color:var(--text-muted)', textContent: `Mostrando 500 de ${rows.length}. Filtre para ver mais.` }));
  }
}
