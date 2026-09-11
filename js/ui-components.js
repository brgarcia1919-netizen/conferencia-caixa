// ═══════════════════════════════════════════════════
// UI COMPONENT HELPERS
// ═══════════════════════════════════════════════════

import { formatBRL } from './data.js';

export function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') e.className = v;
    else if (k === 'textContent') e.textContent = v;
    else if (k === 'innerHTML') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v);
  }
  children.forEach(c => {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  });
  return e;
}

export function createMoneyInput(value, cssClass, placeholder, onChange) {
  const input = el('input', {
    type: 'text',
    className: `input-extrato ${cssClass}`,
    placeholder: placeholder || '0,00',
    value: value ? formatBRL(value) : '',
    onFocus: (e) => {
      if (e.target.value === '-') e.target.value = '';
      e.target.select();
    },
    onBlur: (e) => {
      onChange(e);
      const val = parseInputValue(e.target.value);
      e.target.value = val ? formatBRL(val) : '';
    },
    onKeydown: (e) => {
      if (e.key === 'Enter') {
        e.target.blur();
        // Move to next input
        const inputs = [...document.querySelectorAll('.input-extrato')];
        const idx = inputs.indexOf(e.target);
        if (idx < inputs.length - 1) inputs[idx + 1].focus();
      }
    },
  });
  return input;
}

function parseInputValue(str) {
  if (!str || str.trim() === '' || str === '-') return 0;
  let clean = str.replace(/\s/g, '');

  // Formula mode: starts with "=" OR contains +/-/*/÷ operators (Excel-like)
  const hasOperator = /[+\-*/x]/.test(clean.slice(1));
  const isFormula = clean.startsWith('=') || hasOperator;

  if (isFormula) {
    // Remove leading "="
    if (clean.startsWith('=')) clean = clean.slice(1);
    // Convert BR decimal notation to JS (1.234,56 → 1234.56)
    // Strategy: if comma present, treat as decimal separator; dots are thousands
    // But since users write "100+200,50", we need to handle each number
    // Split by operators, convert each number, then re-join
    clean = clean.replace(/x/gi, '*').replace(/÷/g, '/');
    const parts = clean.split(/([+\-*/()])/);
    const converted = parts.map(p => {
      if (/^[+\-*/()]$/.test(p) || p === '') return p;
      // Number: strip dots (thousands) and convert comma to dot
      if (p.includes(',')) return p.replace(/\./g, '').replace(',', '.');
      return p;
    }).join('');
    try {
      // Only allow safe arithmetic characters
      if (!/^[0-9+\-*/(). ]+$/.test(converted)) return 0;
      const result = Function('"use strict"; return (' + converted + ')')();
      if (isNaN(result) || !isFinite(result)) return 0;
      return Math.round(result * 100) / 100;
    } catch { return 0; }
  }

  // Plain number
  if (clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  }
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : Math.round(val * 100) / 100;
}

export function createDifBadge(value) {
  const span = el('span', { className: 'val-dif' });
  if (Math.abs(value) < 0.01) {
    span.classList.add('ok');
    span.textContent = '✓ OK';
  } else {
    span.classList.add('divergent');
    const prefix = value > 0 ? '+' : '';
    span.textContent = `${prefix}${formatBRL(value)}`;
  }
  return span;
}

export function createStatusBadge(status) {
  const badge = el('div', { className: 'badge' });
  if (status === 'conferido') {
    badge.classList.add('badge-ok');
    badge.textContent = '✅ Conferido';
  } else if (status === 'divergente') {
    badge.classList.add('badge-divergent');
    badge.textContent = '⚠️ Divergente';
  } else {
    badge.classList.add('badge-pending');
    badge.textContent = '⏳ Pendente';
  }
  return badge;
}
