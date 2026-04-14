// ═══════════════════════════════════════════════════
// MONTHLY SUMMARY VIEW (async/Supabase)
// ═══════════════════════════════════════════════════

import {
  PAYMENT_TYPES, formatBRL, loadMonth, getDayOfWeek, isWeekend,
  calcExtratoTotal, calcDiferenca, calcTotals, calcStatus
} from './data.js';
import { el } from './ui-components.js';

export async function renderMonthly(year, month, onDayClick) {
  const days = await loadMonth(year, month);
  const tbody = document.getElementById('monthly-body');
  tbody.innerHTML = '';

  let grandSistema = 0, grandExtrato = 0, grandDif = 0;
  const typeTotals = {};
  PAYMENT_TYPES.forEach(t => typeTotals[t.key] = { dif: 0 });

  days.forEach((day, i) => {
    const dayNum = i + 1;
    const dow = getDayOfWeek(day.date);
    const weekend = isWeekend(day.date);
    const status = calcStatus(day);
    const extrato = calcExtratoTotal(day);
    const difs = calcDiferenca(day);
    const totalSist = calcTotals(day.sistema);
    const totalExt = calcTotals(extrato);
    const totalDif = Math.round((totalSist - totalExt) * 100) / 100;
    const noData = totalSist === 0 && totalExt === 0;

    grandSistema += totalSist;
    grandExtrato += totalExt;
    grandDif += totalDif;

    PAYMENT_TYPES.forEach(t => {
      typeTotals[t.key].dif += difs[t.key] || 0;
    });

    const tr = el('tr', {
      className: `${weekend ? 'weekend' : ''} ${noData ? 'no-data' : ''}`,
      onClick: () => { if (!noData) onDayClick(day.date); },
    });

    tr.appendChild(el('td', { textContent: String(dayNum).padStart(2, '0') }));
    tr.appendChild(el('td', { textContent: dow }));

    PAYMENT_TYPES.filter(t => t.key !== 'pix_conta').forEach(t => {
      const d = difs[t.key] || 0;
      const td = el('td');
      if (noData) {
        td.textContent = '-';
      } else if (Math.abs(d) < 0.01) {
        td.innerHTML = `<span class="status-ok">✓✓</span>`;
      } else {
        td.innerHTML = `<span class="status-div">${d > 0 ? '+' : ''}${formatBRL(d)}</span>`;
      }
      tr.appendChild(td);
    });

    tr.appendChild(el('td', { textContent: noData ? '-' : formatBRL(totalSist) }));
    tr.appendChild(el('td', { textContent: noData ? '-' : formatBRL(totalExt) }));

    const difTd = el('td');
    if (noData) difTd.textContent = '-';
    else if (Math.abs(totalDif) < 0.01) difTd.innerHTML = `<span class="status-ok">✓ OK</span>`;
    else difTd.innerHTML = `<span class="status-div">${totalDif > 0 ? '+' : ''}${formatBRL(totalDif)}</span>`;
    tr.appendChild(difTd);

    const statusTd = el('td');
    if (noData) statusTd.innerHTML = `<span class="status-pending">-</span>`;
    else if (status === 'conferido') statusTd.innerHTML = `<span class="status-ok">✅</span>`;
    else statusTd.innerHTML = `<span class="status-div">⚠️</span>`;
    tr.appendChild(statusTd);

    tbody.appendChild(tr);
  });

  // Totals row
  const tfoot = document.getElementById('monthly-totals');
  tfoot.innerHTML = '';
  tfoot.appendChild(el('td', { textContent: 'TOTAL', colspan: '2' }));
  PAYMENT_TYPES.filter(t => t.key !== 'pix_conta').forEach(t => {
    const d = Math.round(typeTotals[t.key].dif * 100) / 100;
    const td = el('td');
    td.textContent = Math.abs(d) < 0.01 ? '✓' : `${d > 0 ? '+' : ''}${formatBRL(d)}`;
    tfoot.appendChild(td);
  });
  tfoot.appendChild(el('td', { textContent: formatBRL(Math.round(grandSistema * 100) / 100) }));
  tfoot.appendChild(el('td', { textContent: formatBRL(Math.round(grandExtrato * 100) / 100) }));
  grandDif = Math.round(grandDif * 100) / 100;
  tfoot.appendChild(el('td', { textContent: `${grandDif > 0 ? '+' : ''}${formatBRL(grandDif)}` }));
  tfoot.appendChild(el('td', { textContent: '' }));

  renderSummaryCards(typeTotals, grandDif);
}

function renderSummaryCards(typeTotals, grandDif) {
  const container = document.getElementById('summary-cards');
  container.innerHTML = '';

  PAYMENT_TYPES.filter(t => t.key !== 'pix_conta').forEach(t => {
    const dif = Math.round(typeTotals[t.key].dif * 100) / 100;
    const isOk = Math.abs(dif) < 0.01;
    container.appendChild(el('div', { className: `summary-card ${isOk ? 'ok' : 'divergent'}` }, [
      el('div', { className: 'summary-card-label', textContent: t.label }),
      el('div', {
        className: `summary-card-value ${isOk ? 'ok' : 'divergent'}`,
        textContent: isOk ? '✓ OK' : `${dif > 0 ? '+' : ''}${formatBRL(dif)}`,
      }),
    ]));
  });

  const isOk = Math.abs(grandDif) < 0.01;
  container.appendChild(el('div', { className: `summary-card ${isOk ? 'ok' : 'divergent'}` }, [
    el('div', { className: 'summary-card-label', textContent: 'TOTAL GERAL' }),
    el('div', {
      className: `summary-card-value ${isOk ? 'ok' : 'divergent'}`,
      textContent: isOk ? '✓ OK' : `${grandDif > 0 ? '+' : ''}${formatBRL(grandDif)}`,
    }),
  ]));
}
