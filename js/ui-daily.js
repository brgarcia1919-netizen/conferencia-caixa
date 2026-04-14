// ═══════════════════════════════════════════════════
// DAILY RECONCILIATION VIEW (async/Supabase)
// ═══════════════════════════════════════════════════

import {
  PAYMENT_TYPES, formatBRL, parseBRL, loadDay, saveDay,
  calcExtratoTotal, calcDiferenca, calcTotals, calcStatus
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

  const extrato = calcExtratoTotal(currentDay);
  const difs = calcDiferenca(currentDay);

  PAYMENT_TYPES.forEach(type => {
    const sistVal = currentDay.sistema[type.key] || 0;
    const tmmVal = currentDay.extrato_tmm[type.key] || 0;
    const brgVal = currentDay.extrato_brg[type.key] || 0;
    const extVal = extrato[type.key];
    const difVal = difs[type.key];

    const tr = el('tr', {}, [
      el('td', { className: 'col-tipo' }, [
        el('span', {}, [`${type.icon} ${type.label}`]),
      ]),
      el('td', { className: 'col-sistema' }, [
        el('span', { className: 'val-sistema', textContent: formatBRL(sistVal) }),
      ]),
      el('td', { className: 'col-tmm' }, [
        createMoneyInput(tmmVal, 'tmm', 'TMM', (e) => {
          currentDay.extrato_tmm[type.key] = parseBRL(e.target.value);
          onDataChange();
        }),
      ]),
      el('td', { className: 'col-brg' }, [
        createMoneyInput(brgVal, 'brg', 'BRG', (e) => {
          currentDay.extrato_brg[type.key] = parseBRL(e.target.value);
          onDataChange();
        }),
      ]),
      el('td', { className: 'col-extrato' }, [
        el('span', { className: 'val-extrato', textContent: formatBRL(extVal) }),
      ]),
      el('td', { className: 'col-dif' }, [createDifBadge(difVal)]),
    ]);

    tbody.appendChild(tr);
  });

  updateTotals();
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
  const extrato = calcExtratoTotal(currentDay);
  const difs = calcDiferenca(currentDay);
  const rows = document.querySelectorAll('#recon-body tr');

  PAYMENT_TYPES.forEach((type, i) => {
    const row = rows[i];
    if (!row) return;
    const extCell = row.querySelector('.col-extrato .val-extrato');
    if (extCell) extCell.textContent = formatBRL(extrato[type.key]);
    const difCell = row.querySelector('.col-dif');
    if (difCell) { difCell.innerHTML = ''; difCell.appendChild(createDifBadge(difs[type.key])); }
  });

  updateTotals();
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
