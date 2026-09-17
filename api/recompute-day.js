// Recomputa a linha da tabela `conferencia_dias` para uma data,
// somando transacoes_vissmed (sistema) e transacoes_banco (extrato_tmm/brg).
//
// GET /api/recompute-day?data=YYYY-MM-DD
// GET /api/recompute-day?inicio=YYYY-MM-DD&fim=YYYY-MM-DD

export const config = { maxDuration: 30 };

const SUPABASE_URL = "https://snausqyrqwdmdkcivmtb.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuYXVzcXlycXdkbWRrY2l2bXRiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjEzMDgyNiwiZXhwIjoyMDkxNzA2ODI2fQ.6_tyTA9sxV2kCyxZo0yY0XQtnsBKdKn8zxXxL1n-1Ow";

const H = {
  apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function supaGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function supaUpsert(payload) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/conferencia_dias?on_conflict=date`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Upsert: ${r.status} ${await r.text()}`);
}

function empty() {
  return { dinheiro: 0, credito: 0, debito: 0, pix_maquininha: 0, pix_conta: 0, convenio: 0 };
}

export async function recomputeDay(isoDate) {
  const [vRows, bRows, bAllPix] = await Promise.all([
    supaGet(`transacoes_vissmed?data=eq.${isoDate}&select=forma,valor_liquido`),
    supaGet(`transacoes_banco?data=eq.${isoDate}&ignorado=eq.false&select=id,fonte,forma,valor_bruto,pagador`),
    // Todas as tx PIX stone_tmm_conta (nao filtradas por data) para casar estornos cross-day
    supaGet(`transacoes_banco?fonte=eq.stone_tmm_conta&forma=eq.pix_conta&ignorado=eq.false&select=id,valor_bruto,pagador,data`),
  ]);

  // Detectar pares +/- do mesmo pagador (Transferencia + Devolucao)
  const canceledIds = new Set();
  const groups = {};
  bAllPix.forEach(r => {
    if (!r.pagador) return;
    const key = `${r.pagador}|${Math.round(Math.abs(Number(r.valor_bruto)) * 100)}`;
    (groups[key] = groups[key] || []).push(r);
  });
  Object.values(groups).forEach(list => {
    if (list.length < 2) return;
    const pos = list.filter(x => Number(x.valor_bruto) > 0);
    const neg = list.filter(x => Number(x.valor_bruto) < 0);
    const n = Math.min(pos.length, neg.length);
    for (let k = 0; k < n; k++) {
      canceledIds.add(pos[k].id);
      canceledIds.add(neg[k].id);
    }
  });

  const sistema = empty();
  vRows.forEach(r => {
    if (sistema[r.forma] !== undefined) sistema[r.forma] += Number(r.valor_liquido || 0);
  });

  const extrato_tmm = empty();
  const extrato_brg = empty();
  bRows.forEach(r => {
    if (canceledIds.has(r.id)) return; // par estornado — cancela
    const v = Number(r.valor_bruto || 0);
    if (v < 0) return; // devolucao isolada — nao conta
    const dest = (r.fonte === 'stone_tmm' || r.fonte === 'stone_tmm_conta') ? extrato_tmm
               : (r.fonte === 'stone_brg' || r.fonte === 'infinite_brg') ? extrato_brg
               : null;
    if (!dest) return;
    if (dest[r.forma] !== undefined) dest[r.forma] += v;
  });

  // Dinheiro e convenio nao passam pelo banco — copia de sistema pra "bater" no daily view
  extrato_tmm.dinheiro = sistema.dinheiro;
  extrato_tmm.convenio = sistema.convenio;

  // Arredondar 2 casas
  const round2 = o => { for (const k in o) o[k] = Math.round(o[k] * 100) / 100; };
  round2(sistema); round2(extrato_tmm); round2(extrato_brg);

  await supaUpsert({
    date: isoDate,
    sistema, extrato_tmm, extrato_brg,
    updated_at: new Date().toISOString(),
  });
  return { data: isoDate, sistema, extrato_tmm, extrato_brg };
}

function dateRange(start, end) {
  const out = [];
  const d = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  while (d <= e) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
  return out;
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const data = url.searchParams.get('data');
    let inicio = url.searchParams.get('inicio');
    let fim = url.searchParams.get('fim');
    if (data) { inicio = data; fim = data; }
    if (!inicio || !fim) return res.status(400).json({ error: 'passe ?data=YYYY-MM-DD' });
    const datas = dateRange(inicio, fim);
    const out = [];
    for (const d of datas) out.push(await recomputeDay(d));
    return res.status(200).json({ ok: true, dias: out });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
