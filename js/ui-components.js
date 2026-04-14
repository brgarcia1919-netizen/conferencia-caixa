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
