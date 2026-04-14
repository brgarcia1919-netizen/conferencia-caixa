// ═══════════════════════════════════════════════════
// APP INITIALIZATION (async/Supabase)
// ═══════════════════════════════════════════════════

import { formatDate, parseDate, getDayOfWeek } from './data.js';
import { renderDaily, updateSistema } from './ui-daily.js';
import { renderMonthly } from './ui-monthly.js';
import { setupImportModal } from './vissmed-parser.js';
import { exportMonthCSV } from './export.js';
import { checkAuth, signOut } from './supabase.js';

let currentView = 'daily';
let currentDate = formatDate(new Date());
let currentMonth = { year: new Date().getFullYear(), month: new Date().getMonth() };

async function init() {
  // Check authentication — redirect to login if not authenticated
  const session = await checkAuth();
  if (!session) return;

  // Show user email in header
  const userEmail = session.user?.email || '';
  const subtitle = document.querySelector('.header-subtitle');
  if (subtitle) subtitle.textContent = `Clínica Você + Saúde — ${userEmail}`;

  // Set initial date
  const datePicker = document.getElementById('date-picker');
  datePicker.value = currentDate;
  updateDayLabel();

  // Render initial view
  await renderDaily(currentDate);
  populateMonthPicker();

  // ── Event Listeners ──
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  datePicker.addEventListener('change', (e) => {
    currentDate = e.target.value;
    updateDayLabel();
    renderDaily(currentDate);
  });

  document.getElementById('btn-prev-day').addEventListener('click', () => changeDay(-1));
  document.getElementById('btn-next-day').addEventListener('click', () => changeDay(1));

  document.getElementById('btn-prev-month').addEventListener('click', () => changeMonth(-1));
  document.getElementById('btn-next-month').addEventListener('click', () => changeMonth(1));
  document.getElementById('month-picker').addEventListener('change', (e) => {
    const [y, m] = e.target.value.split('-').map(Number);
    currentMonth = { year: y, month: m };
    renderMonthly(y, m, navigateToDay);
  });

  document.getElementById('btn-export-csv').addEventListener('click', () => {
    exportMonthCSV(currentMonth.year, currentMonth.month);
  });

  // Logout button
  document.getElementById('btn-logout')?.addEventListener('click', () => signOut());

  // Vissmed import
  setupImportModal((data) => updateSistema(data));

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft') changeDay(-1);
    if (e.key === 'ArrowRight') changeDay(1);
    if (e.key === '1') switchView('daily');
    if (e.key === '2') switchView('monthly');
  });
}

async function switchView(view) {
  currentView = view;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  if (view === 'monthly') {
    await renderMonthly(currentMonth.year, currentMonth.month, navigateToDay);
  }
}

async function changeDay(delta) {
  const d = parseDate(currentDate);
  d.setDate(d.getDate() + delta);
  currentDate = formatDate(d);
  document.getElementById('date-picker').value = currentDate;
  updateDayLabel();
  await renderDaily(currentDate);
}

function updateDayLabel() {
  document.getElementById('day-of-week').textContent = getDayOfWeek(currentDate);
}

async function navigateToDay(dateStr) {
  currentDate = dateStr;
  document.getElementById('date-picker').value = currentDate;
  updateDayLabel();
  switchView('daily');
  await renderDaily(currentDate);
}

async function changeMonth(delta) {
  currentMonth.month += delta;
  if (currentMonth.month > 11) { currentMonth.month = 0; currentMonth.year++; }
  if (currentMonth.month < 0) { currentMonth.month = 11; currentMonth.year--; }
  updateMonthPicker();
  await renderMonthly(currentMonth.year, currentMonth.month, navigateToDay);
}

function populateMonthPicker() {
  const select = document.getElementById('month-picker');
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  for (let y = 2025; y <= 2027; y++) {
    for (let m = 0; m < 12; m++) {
      const opt = document.createElement('option');
      opt.value = `${y}-${m}`;
      opt.textContent = `${months[m]} ${y}`;
      select.appendChild(opt);
    }
  }
  updateMonthPicker();
}

function updateMonthPicker() {
  document.getElementById('month-picker').value = `${currentMonth.year}-${currentMonth.month}`;
}

document.addEventListener('DOMContentLoaded', init);
