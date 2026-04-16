// ═══════════════════════════════════════════════════
// DAILY RECONCILIATION VIEW (async/Supabase)
// PIX Maquininha + PIX Conta merged into single "PIX" row
// ═══════════════════════════════════════════════════

import {
  PAYMENT_TYPES, DISPLAY_TYPES, formatBRL, parseBRL, loadDay, saveDay,
  calcExtratoTotal, calcTotals, calcStatus, getDisplayValues
} from './data.js';
import { el, createMoneyInput, createDifBadge, createStatusBadge } from './ui-components.js';

let currentDay = null;
let saveTimeout = null;

export async function renderDaily(dateStr) {
  currentDay = await loadDay(dateStr);
  renderTable();
  renderStatus();
  renderNotes();
}

function renderTable() {
  const tbody = document.getElementById('recon-body');
  tbody.innerHTML = '';

  const displayRows = getDisplayValues(currentDay);

  displayRows.forEach(row => {
    const tr = el('tr', {}, [
      // Tipo
      el('td', { className: 'col-tipo' }, [
        el('span', {}, [`${row.icon} ${row.label}`]),
      ]),
      // Sistema
      el('td', { className: 'col-sistema' }, [
        el('span', { className: 'val-sistema', textContent: formatBRL(row.sistema) }),
      ]),
      // TMM input
      el('td', { className: 'col-tmm' }, [
        row.merged
          ? createMergedInputs(row.mergeKeys, 'tmm', 'TMM')
          : createMoneyInput(row.tmm, 'tmm', 'TMM', (e) => {
              currentDay.extrato_tmm[row.key] = parseBRL(e.target.value);
              onDataChange();
            }),
      ]),
      // BRG input
      el('td', { className: 'col-brg' }, [
        row.merged
          ? createMergedInputs(row.mergeKeys, 'brg', 'BRG')
          : createMoneyInput(row.brg, 'brg', 'BRG', (e) => {
              currentDay.extrato_brg[row.key] = parseBRL(e.target.value);
              onDataChange();
            }),
      ]),
      // Extrato Total
      el('td', { className: 'col-extrato' }, [
        el('span', { className: 'val-extrato', textContent: formatBRL(row.extrato) }),
      ]),
      // Diferença
      el('td', { className: 'col-dif' }, [createDifBadge(row.dif)]),
    ]);

    tbody.appendChild(tr);
  });

  updateTotals();
}

// Creates stacked inputs for merged PIX row (maquininha + conta)
function createMergedInputs(mergeKeys, cssClass, placeholder) {
  const source = cssClass === 'tmm' ? 'extrato_tmm' : 'extrato_brg';
  const container = el('div', { className: 'merged-inputs' });

  mergeKeys.forEach((key, i) => {
    const label = key === 'pix_maquininha' ? 'Maq' : 'Conta';
    const val = currentDay[source]?.[key] || 0;

    const wrapper = el('div', { className: 'merged-input-row' }, [
      el('span', { className: 'merged-label', textContent: label }),
      createMoneyInput(val, cssClass, `${placeholder} ${label}`, (e) => {
        currentDay[source][key] = parseBRL(e.target.value);
        onDataChange();
      }),
    ]);
    container.appendChild(wrapper);
  });

  return container;
}

function updateTotals() {
  const extrato = calcExtratoTotal(currentDay);
  const totalSist = calcTotals(currentDay.sistema);
  const totalTMM = calcTotals(currentDay.extrato_tmm);
  const totalBRG = calcTotals(currentDay.extrato_brg);
  const totalExt = calcTotals(extrato);
  const totalDif = Math.round((totalSist - totalExt) * 100) / 100;

  document.getElementById('total-sistema').innerHTML = `<span class="val-sistema">${formatBRL(totalSist)}</span>`;
  document.getElementById('total-tmm').textContent = formatBRL(totalTMM);
  document.getElementById('total-brg').textContent = formatBRL(totalBRG);
  document.getElementById('total-extrato').innerHTML = `<span class="val-extrato">${formatBRL(totalExt)}</span>`;

  const difCell = document.getElementById('total-dif');
  difCell.innerHTML = '';
  difCell.appendChild(createDifBadge(totalDif));
}

function renderStatus() {
  const status = calcStatus(currentDay);
  const container = document.getElementById('status-badge');
  const badge = createStatusBadge(status);
  badge.id = 'status-badge';
  container.replaceWith(badge);
}

function renderNotes() {
  const textarea = document.getElementById('notes-input');
  textarea.value = currentDay.notas || '';
  textarea.onchange = () => {
    currentDay.notas = textarea.value;
    debouncedSave();
  };
}

function onDataChange() {
  // Re-render the whole table (simpler than updating merged rows individually)
  renderTable();
  renderStatus();
  debouncedSave();
}

function debouncedSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveDay(currentDay), 800);
}

export function updateSistema(sistemaData) {
  if (!currentDay) return;
  currentDay.sistema = { ...currentDay.sistema, ...sistemaData };
  renderTable();
  renderStatus();
  debouncedSave();
}
