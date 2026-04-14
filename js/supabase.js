// ═══════════════════════════════════════════════════
// SUPABASE CLIENT — Auth + Database
// ═══════════════════════════════════════════════════

const SUPABASE_URL = 'https://snausqyrqwdmdkcivmtb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuYXVzcXlycXdkbWRrY2l2bXRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMzA4MjYsImV4cCI6MjA5MTcwNjgyNn0.ygTDV_993trG_0bQbj-glPLX_9nXGSG_OXkH2L8wLh4';

let _client = null;

export function getClient() {
  if (!_client) {
    _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return _client;
}

// ── Auth ──
export async function checkAuth() {
  const { data: { session } } = await getClient().auth.getSession();
  if (!session) {
    window.location.href = '/login.html';
    return null;
  }
  return session;
}

export async function signOut() {
  await getClient().auth.signOut();
  window.location.href = '/login.html';
}

export async function getCurrentUser() {
  const { data: { user } } = await getClient().auth.getUser();
  return user;
}

// ── Database CRUD ──
export async function dbLoadDay(dateStr) {
  const { data, error } = await getClient()
    .from('conferencia_dias')
    .select('*')
    .eq('date', dateStr)
    .maybeSingle();

  if (error) { console.error('dbLoadDay error:', error); return null; }
  return data;
}

export async function dbSaveDay(dayRecord) {
  const user = await getCurrentUser();
  const payload = {
    date: dayRecord.date,
    sistema: dayRecord.sistema,
    extrato_tmm: dayRecord.extrato_tmm,
    extrato_brg: dayRecord.extrato_brg,
    notas: dayRecord.notas || '',
    updated_at: new Date().toISOString(),
    updated_by: user?.id || null,
  };

  const { data, error } = await getClient()
    .from('conferencia_dias')
    .upsert(payload, { onConflict: 'date' })
    .select()
    .single();

  if (error) console.error('dbSaveDay error:', error);
  return data;
}

export async function dbLoadMonth(year, month) {
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  const { data, error } = await getClient()
    .from('conferencia_dias')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date');

  if (error) { console.error('dbLoadMonth error:', error); return []; }
  return data || [];
}
