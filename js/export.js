// ════════���════════���═════════════════════════════════
// CSV EXPORT
// ═══════════════════════════════════════════════════

import {
  PAYMENT_TYPES, formatBRL, loadMonth, getDayOfWeek,
  calcExtratoTotal, calcDiferenca, calcTotals
} from './data.js';

export function exportMonthCSV(year, month) {
  const days = loadMonth(year, month);
  const monthName = new Date(year, month).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const headers = [
    'Dia', 'Semana',
    ...PAYMENT_TYPES.flatMap(t => [`${t.label} Sistema`, `${t.label} TMM`, `${t.label} BRG`, `${t.label} Extrato`, `${t.label} Dif`]),
    'Total Sistema', 'Total Extrato', 'Total Diferença', 'Status'
  ];

  const rows = [headers.join(';')];

  days.forEach((day, i) => {
    const dayNum = i + 1;
    const dow = getDayOfWeek(day.date);
    const extrato = calcExtratoTotal(day);
    const difs = calcDiferenca(day);
    const totalSist = calcTotals(day.sistema);
    const totalExt = calcTotals(extrato);
    const totalDif = Math.round((totalSist - totalExt) * 100) / 100;

    const cols = [
      String(dayNum).padStart(2, '0'),
      dow,
    ];

    PAYMENT_TYPES.forEach(t => {
      cols.push(
        fmtCSV(day.sistema[t.key]),
        fmtCSV(day.extrato_tmm[t.key]),
        fmtCSV(day.extrato_brg[t.key]),
        fmtCSV(extrato[t.key]),
        fmtCSV(difs[t.key]),
      );
    });

    cols.push(
      fmtCSV(totalSist),
      fmtCSV(totalExt),
      fmtCSV(totalDif),
      Math.abs(totalDif) < 0.01 ? 'OK' : 'DIVERGENTE',
    );

    rows.push(cols.join(';'));
  });

  const bom = '\uFEFF';
  const blob = new Blob([bom + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `conferencia_caixa_${monthName.replace(/\s/g, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtCSV(val) {
  if (!val || val === 0) return '0';
  return val.toFixed(2).replace('.', ',');
}
