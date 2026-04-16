// ═══════════════════════════════════════════════════
// DATA MODEL — Supabase persistence
// ═══════════════════════════════════════════════════

import { dbLoadDay, dbSaveDay, dbLoadMonth } from './supabase.js';

export const PAYMENT_TYPES = [
  { key: 'dinheiro', label: 'Dinheiro', icon: '💵' },
  { key: 'credito', label: 'Crédito', icon: '💳' },
  { key: 'debito', label: 'Débito', icon: '💳' },
  { key: 'pix_maquininha', label: 'PIX Maquininha', icon: '📱' },
  { key: 'pix_conta', label: 'PIX Conta', icon: '🏦' },
  { key: 'convenio', label: 'Convênio', icon: '🏥' },
];

// Display types: PIX Maquininha + PIX Conta merged into one "PIX" row
export const DISPLAY_TYPES = [
  { key: 'dinheiro', label: 'Dinheiro', icon: '💵', merged: false },
  { key: 'credito', label: 'Crédito', icon: '💳', merged: false },
  { key: 'debito', label: 'Débito', icon: '💳', merged: false },
  { key: 'pix', label: 'PIX', icon: '📱', merged: true, mergeKeys: ['pix_maquininha', 'pix_conta'] },
  { key: 'convenio', label: 'Convênio', icon: '🏥', merged: false },
];

// Get display values for a day (merging PIX)
export function getDisplayValues(day) {
  const extrato = calcExtratoTotal(day);
  const rows = [];
  for (const dt of DISPLAY_TYPES) {
    if (dt.merged) {
      const sistVal = dt.mergeKeys.reduce((s, k) => s + (day.sistema?.[k] || 0), 0);
      const extVal = dt.mergeKeys.reduce((s, k) => s + (extrato[k] || 0), 0);
      const tmmVal = dt.mergeKeys.reduce((s, k) => s + (day.extrato_tmm?.[k] || 0), 0);
      const brgVal = dt.mergeKeys.reduce((s, k) => s + (day.extrato_brg?.[k] || 0), 0);
      rows.push({ ...dt, sistema: sistVal, extrato: extVal, tmm: tmmVal, brg: brgVal, dif: Math.round((sistVal - extVal) * 100) / 100 });
    } else {
      const sistVal = day.sistema?.[dt.key] || 0;
      const extVal = extrato[dt.key] || 0;
      const tmmVal = day.extrato_tmm?.[dt.key] || 0;
      const brgVal = day.extrato_brg?.[dt.key] || 0;
      rows.push({ ...dt, sistema: sistVal, extrato: extVal, tmm: tmmVal, brg: brgVal, dif: Math.round((sistVal - extVal) * 100) / 100 });
    }
  }
  return rows;
}

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ── Helpers ──
export function formatDate(date) {
  return date.toISOString().split('T')[0];
}

export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function getDayOfWeek(dateStr) {
  return DAYS_PT[parseDate(dateStr).getDay()];
}

export function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export function isWeekend(dateStr) {
  const d = parseDate(dateStr).getDay();
  return d === 0 || d === 6;
}

// ── BRL Formatting ──
export function formatBRL(value) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  if (Math.abs(value) < 0.005) return '-';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseBRL(str) {
  if (!str || str.trim() === '' || str === '-') return 0;
  let clean = str.replace(/\s/g, '');
  if (clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  }
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : Math.round(val * 100) / 100;
}

// ── Empty day record ──
function emptyPayments() {
  const obj = {};
  PAYMENT_TYPES.forEach(t => obj[t.key] = 0);
  return obj;
}

export function createDayRecord(dateStr) {
  return {
    date: dateStr,
    sistema: emptyPayments(),
    extrato_tmm: emptyPayments(),
    extrato_brg: emptyPayments(),
    notas: '',
    updated_at: new Date().toISOString(),
  };
}

// ── Calculations (unchanged) ──
export function calcExtratoTotal(day) {
  const totals = {};
  PAYMENT_TYPES.forEach(t => {
    totals[t.key] = (day.extrato_tmm?.[t.key] || 0) + (day.extrato_brg?.[t.key] || 0);
  });
  return totals;
}

export function calcDiferenca(day) {
  const extrato = calcExtratoTotal(day);
  const difs = {};
  PAYMENT_TYPES.forEach(t => {
    difs[t.key] = Math.round(((day.sistema?.[t.key] || 0) - extrato[t.key]) * 100) / 100;
  });
  return difs;
}

export function calcTotals(payments) {
  if (!payments) return 0;
  return Object.values(payments).reduce((a, b) => a + (b || 0), 0);
}

export function calcStatus(day) {
  const displayRows = getDisplayValues(day);
  const totalSist = calcTotals(day.sistema);
  const totalExt = calcTotals(calcExtratoTotal(day));
  if (totalSist === 0 && totalExt === 0) return 'pendente';
  const hasDif = displayRows.some(r => Math.abs(r.dif) > 0.01);
  return hasDif ? 'divergente' : 'conferido';
}

// ── Storage (now async, uses Supabase) ──
export async function loadDay(dateStr) {
  const row = await dbLoadDay(dateStr);
  if (!row) return createDayRecord(dateStr);
  return {
    date: row.date,
    sistema: row.sistema || emptyPayments(),
    extrato_tmm: row.extrato_tmm || emptyPayments(),
    extrato_brg: row.extrato_brg || emptyPayments(),
    notas: row.notas || '',
    updated_at: row.updated_at,
  };
}

export async function saveDay(day) {
  day.updated_at = new Date().toISOString();
  await dbSaveDay(day);
}

export async function loadMonth(year, month) {
  const rows = await dbLoadMonth(year, month);
  const days = getDaysInMonth(year, month);
  const byDate = {};
  rows.forEach(r => { byDate[r.date] = r; });

  const result = [];
  for (let d = 1; d <= days; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const row = byDate[dateStr];
    if (row) {
      result.push({
        date: row.date,
        sistema: row.sistema || emptyPayments(),
        extrato_tmm: row.extrato_tmm || emptyPayments(),
        extrato_brg: row.extrato_brg || emptyPayments(),
        notas: row.notas || '',
        updated_at: row.updated_at,
      });
    } else {
      result.push(createDayRecord(dateStr));
    }
  }
  return result;
}
