// Vercel serverless function: puxa Vissmed extratocaixa de todas as 25 caixas
// para uma data (ou intervalo) e faz upsert em transacoes_vissmed.
//
// GET /api/vissmed-pull?data=YYYY-MM-DD
// GET /api/vissmed-pull?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
//
// Resposta: { ok, dias, tx_total, por_dia: { 'YYYY-MM-DD': n }, erros }

export const config = { maxDuration: 60 };

const TOKEN = "eyJkYXRhIjp7InVzdWFyaW8iOnsic2lzdGVtYSI6bnVsbCwiaWQiOjE0Nzk3LCJsb2dpbiI6ImJydW5vQDIzIiwibm9tZSI6IkJydW5vIC0gQURNIiwiaWRlbXByZXNhIjoyOTQsImlkdW5pZGFkZSI6MzQxLCJub21ldW5pZGFkZSI6IkNsXHUwMGVkbmljYSBWb2NcdTAwZWEgKyBTYVx1MDBmYWRlIiwiaWRwYWNpZW50ZSI6bnVsbCwiaWRwcm9maXNzaW9uYWwiOm51bGwsImlkdXN1YXJpb3RpcG8iOjF9fX0=";

const SUPABASE_URL = "https://snausqyrqwdmdkcivmtb.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuYXVzcXlycXdkbWRrY2l2bXRiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjEzMDgyNiwiZXhwIjoyMDkxNzA2ODI2fQ.6_tyTA9sxV2kCyxZo0yY0XQtnsBKdKn8zxXxL1n-1Ow";

const CAIXAS = [
  [14796, "ADM - VISSMED"], [14797, "Bruno - ADM"], [14826, "ANA CLAUDIA"],
  [14834, "Jaqueline - RECEPCAO"], [14835, "MIDIAM RODRIGUES-RECEPCAO"],
  [14838, "ADRIANA-TELEFONIA"], [14839, "GEOVANNA-TELEFONIA"], [14865, "THAIS TELEFONISTA"],
  [14866, "Nasser"], [14869, "Sabrina"], [14897, "JHENNIFER ROCHA JORGE"],
  [14913, "LETICIA PEREIRA GONCALVES"], [14958, "MARIA EDUARDA CARDOSO"],
  [15079, "ANA LUCIA BATISTA DA SILVA LIMA"], [15124, "NICOLLY SILVA"],
  [15154, "KEILA DINIZ"], [15189, "Giovanna Paiva"], [15280, "JOSIANE TELEFONIA"],
  [15310, "ALINE RECEPCAO"], [15311, "JULIA FLAVIA DA SILVA MELO"],
  [15315, "ISABELLA DE MORAES SILVA"], [15318, "KARLA GIOVANA DOS SANTOS"],
  [15328, "GIOVANA CLARA DE MELLO"], [15335, "ADELINI ALVES PENTEADO DA SILVA"],
];

function parseBRL(s) {
  s = String(s).trim().replace(/\./g, '').replace(',', '.');
  const m = s.match(/^-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

function normalizeTipo(t) {
  const T = t.toUpperCase();
  if (T.includes('DINHEIRO')) return 'dinheiro';
  if (T.includes('CONV')) return 'convenio';
  if (T.includes('PIX')) return (T.includes('CONTA') || T.includes('TRANSF')) ? 'pix_conta' : 'pix_maquininha';
  if (T.includes('BITO')) return 'debito';
  if (T.includes('DITO')) return 'credito';
  return 'outro';
}

function parseParcelas(t) {
  const T = t.toUpperCase();
  if (T.includes('VISTA')) return 1;
  const m = T.match(/(\d+)X/);
  return m ? parseInt(m[1]) : 1;
}

function parseTx(html) {
  const rows = [];
  const trRe = /<tr nobr="true">([\s\S]+?)<\/tr>/g;
  let m;
  while ((m = trRe.exec(html)) !== null) {
    const inner = m[1];
    const tds = [];
    const tdRe = /<td>([\s\S]+?)<\/td>/g;
    let tm;
    while ((tm = tdRe.exec(inner)) !== null) tds.push(tm[1]);
    if (tds.length < 6) continue;
    const osM = /OS\s+(\d+\/\d+)/.exec(tds[0]);
    if (!osM) continue;
    const pacM = /Paciente\s+([^<]+?)</.exec(tds[0]);
    const itensM = /Itens:\s*([^<]+?)</.exec(tds[0]);
    const horaM = /(\d+\/\d+)\s*<br\/>\s*([\d:]+)/.exec(tds[1]);
    const tipoRaw = tds[2].replace(/<[^>]+>/g, '').trim();
    const bruto = parseBRL(tds[3].replace(/<[^>]+>/g, ''));
    const desconto = parseBRL(tds[4].replace(/<[^>]+>/g, '').replace(/\([^)]*\)/, ''));
    const liquido = parseBRL(tds[5].replace(/<[^>]+>/g, ''));
    rows.push({
      os: osM[1],
      paciente: pacM ? pacM[1].trim() : '',
      itens: itensM ? itensM[1].trim() : '',
      hora: horaM ? horaM[2] : '',
      forma_raw: tipoRaw,
      forma: normalizeTipo(tipoRaw),
      parcelas: parseParcelas(tipoRaw),
      valor_bruto: bruto,
      desconto,
      valor_liquido: liquido,
    });
  }
  return rows;
}

async function fetchExtrato(idcaixa, nome, dataDDMMYYYY) {
  const qs = new URLSearchParams({
    token: TOKEN, data_inicio: dataDDMMYYYY, idcaixa: String(idcaixa), nomecaixa: nome,
  });
  const url = `https://app.vissmed.com.br/api-vissmed-3/relatorios/extratocaixa/Index.php?${qs}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const buf = await r.arrayBuffer();
  const dec = new TextDecoder('windows-1252', { fatal: false });
  return dec.decode(buf);
}

function dateRange(start, end) {
  const out = [];
  const d = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  while (d <= e) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

async function supaReq(path, method, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`Supabase ${method} ${path}: ${r.status} ${await r.text()}`);
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const data = url.searchParams.get('data');
    let inicio = url.searchParams.get('inicio');
    let fim = url.searchParams.get('fim');
    if (data) { inicio = data; fim = data; }
    if (!inicio || !fim) return res.status(400).json({ error: 'passe ?data=YYYY-MM-DD ou ?inicio=&fim=' });

    const datas = dateRange(inicio, fim);
    const allRows = [];
    const porDia = {};
    const erros = [];

    for (const isoDate of datas) {
      const [y, m, d] = isoDate.split('-');
      const ddmm = `${d}/${m}/${y}`;
      porDia[isoDate] = 0;
      // Paralelo em todas as caixas do dia
      const results = await Promise.allSettled(
        CAIXAS.map(async ([idc, nome]) => {
          const html = await fetchExtrato(idc, encodeURIComponent(nome), ddmm);
          return { idc, nome, txs: parseTx(html) };
        })
      );
      for (const r of results) {
        if (r.status === 'rejected') { erros.push({ dia: isoDate, err: String(r.reason) }); continue; }
        const { idc, nome, txs } = r.value;
        for (const t of txs) {
          allRows.push({
            data: isoDate, hora: t.hora, os: t.os, paciente: t.paciente,
            idcaixa: idc, atendente: nome, forma: t.forma, forma_raw: t.forma_raw,
            parcelas: t.parcelas, valor_bruto: t.valor_bruto, valor_liquido: t.valor_liquido,
          });
          porDia[isoDate]++;
        }
      }
      // Substitui dados existentes do dia antes de inserir
      await supaReq(`transacoes_vissmed?data=eq.${isoDate}`, 'DELETE');
    }

    // Insere em lotes
    const CHUNK = 200;
    for (let i = 0; i < allRows.length; i += CHUNK) {
      await supaReq('transacoes_vissmed', 'POST', allRows.slice(i, i + CHUNK));
    }

    return res.status(200).json({ ok: true, dias: datas.length, tx_total: allRows.length, por_dia: porDia, erros });
  } catch (e) {
    return res.status(500).json({ error: String(e), stack: e.stack });
  }
}
