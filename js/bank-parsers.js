// ═══════════════════════════════════════════════════
// PARSERS DE EXTRATOS BANCÁRIOS — Stone TMM/BRG (CSV) e OFX (Stone conta / Infinite Pay)
// Executados no browser — retornam array unificado pronto pra transacoes_banco
// ═══════════════════════════════════════════════════

function parseBRL(s) {
  if (!s) return 0;
  s = String(s).trim().replace(/\./g, '').replace(',', '.');
  const v = parseFloat(s);
  return isNaN(v) ? 0 : v;
}

function pad2(n) { return String(n).padStart(2, '0'); }

function parseStoneCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  // Strip BOM
  const header = lines[0].replace(/^﻿/, '').split(';');
  const idx = {};
  header.forEach((h, i) => { idx[h.trim().toUpperCase()] = i; });

  // Determine fonte via CNPJ (DOCUMENTO)
  const cnpjTMM = '24721647000170';
  const cnpjBRG = '48858667000156';

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    if (cols.length < header.length) continue;
    const get = (name) => cols[idx[name]] ? cols[idx[name]].trim() : '';
    const status = get('ULTIMO STATUS');
    // Aceita Aprovada e "Parte cancelada" (venda parcialmente estornada)
    if (status !== 'Aprovada' && status !== 'Parte cancelada') continue;

    const doc = get('DOCUMENTO');
    const fonte = doc === cnpjBRG ? 'stone_brg' : 'stone_tmm';

    // DATA DA VENDA: "DD/MM/YYYY HH:MM"
    const raw = get('DATA DA VENDA');
    const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
    if (!m) continue;
    const data = `${m[3]}-${m[2]}-${m[1]}`;
    const hora = `${m[4]}:${m[5]}:00`;

    const prod = get('PRODUTO');
    const bandeira = get('BANDEIRA');
    const prodNorm = prod.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    let tipo;
    if (prodNorm.startsWith('credito') || prodNorm.startsWith('credit')) tipo = 'credito';
    else if (prodNorm.startsWith('debito') || prodNorm.startsWith('debit')) tipo = 'debito';
    else if (prodNorm.includes('pix')) tipo = 'pix_maquininha';
    else if (bandeira && (bandeira.toLowerCase().includes('master') || bandeira.toLowerCase().includes('visa') || bandeira.toLowerCase().includes('elo') || bandeira.toLowerCase().includes('american'))) {
      // Fallback: se tem bandeira de cartao mas PRODUTO nao bateu, chuta credito (mais comum)
      tipo = 'credito';
    } else tipo = 'outro';

    let valorBruto = parseBRL(get('VALOR BRUTO'));
    const valorLiquido = parseBRL(get('VALOR LIQUIDO'));
    // Em 'Parte cancelada', VALOR BRUTO ainda é o original antes do estorno.
    // Bruto efetivo = liquido - desconto_unificado (desconto vem negativo).
    if (status === 'Parte cancelada') {
      const desc = parseBRL(get('DESCONTO UNIFICADO'));
      valorBruto = Math.round((valorLiquido - desc) * 100) / 100;
    }
    rows.push({
      data, hora, fonte,
      forma: tipo,
      bandeira: get('BANDEIRA') || null,
      parcelas: parseInt(get('N DE PARCELAS')) || 1,
      valor_bruto: valorBruto,
      valor_liquido: valorLiquido,
      ns_maquininha: get('N DE SERIE') || null,
      meio_captura: get('MEIO DE CAPTURA') || null,
      id_externo: get('STONE ID') || '',
      pagador: null,
    });
  }
  return rows;
}

function parseOFX(text) {
  // Detect fonte
  const isInfinite = text.includes('[["Tipo - Origem"');
  const isStoneTMM = text.includes('Stone Instituição de Pagamento') || text.includes('Stone Institui');

  const rows = [];
  const blockRe = /<STMTTRN>([\s\S]+?)<\/STMTTRN>/g;
  let m;
  while ((m = blockRe.exec(text)) !== null) {
    const block = m[1];
    const field = (name) => {
      const fm = new RegExp('<' + name + '>([^<\\n]+)').exec(block);
      return fm ? fm[1].trim() : '';
    };
    const trntype = field('TRNTYPE');
    const dtRaw = field('DTPOSTED');
    const amt = parseFloat(field('TRNAMT'));
    const fitid = field('FITID');
    const memo = field('MEMO');
    const name = field('NAME');
    if (!dtRaw || isNaN(amt)) continue;

    // DTPOSTED: YYYYMMDDHHMMSS
    const y = dtRaw.slice(0, 4);
    const mo = dtRaw.slice(4, 6);
    const d = dtRaw.slice(6, 8);
    const hh = dtRaw.slice(8, 10) || '00';
    const mm = dtRaw.slice(10, 12) || '00';
    const ss = dtRaw.slice(12, 14) || '00';
    const data = `${y}-${mo}-${d}`;
    const hora = `${hh}:${mm}:${ss}`;

    if (isInfinite) {
      if (/Cancelada|Estornada|Negada/.test(memo)) continue;
      const nsM = /NS:\s*([A-Za-z0-9]+)/.exec(name);
      const ns = nsM ? nsM[1] : null;
      const taxaM = /Aplicada\(%\):\s*([\d.]+)/.exec(memo);
      const taxa = taxaM ? parseFloat(taxaM[1]) : null;
      let tipo;
      if (/Pix/i.test(memo)) tipo = 'pix_maquininha';
      else if (taxa !== null) tipo = taxa < 3 ? 'debito' : 'credito';
      else if (trntype === 'POS') tipo = 'credito';
      else tipo = 'outro';
      const liqM = /L[íi]quido[^:]*:\s*\+?\s*R?\$?\s*([\d,.]+)/.exec(memo);
      const liquido = liqM ? parseBRL(liqM[1]) : amt;
      rows.push({
        data, hora, fonte: 'infinite_brg',
        forma: tipo, bandeira: null, parcelas: 1,
        valor_bruto: amt, valor_liquido: liquido,
        ns_maquininha: ns, meio_captura: 'POS',
        id_externo: fitid || '', pagador: null,
      });
    } else if (isStoneTMM) {
      const isTransf = /Transfer[êe]ncia\s*\|\s*Pix/i.test(memo);
      const isDevol = /Devolu[çc][ãa]o\s*\|\s*Pix/i.test(memo);
      if (!isTransf && !isDevol) continue;
      const pagador = memo.split(' - ')[0] || memo;
      // Devoluções vêm negativas no OFX (TRNAMT<0). Preservar sinal.
      rows.push({
        data, hora, fonte: 'stone_tmm_conta',
        forma: 'pix_conta', bandeira: null, parcelas: 1,
        valor_bruto: amt, valor_liquido: amt,
        ns_maquininha: null, meio_captura: null,
        id_externo: fitid || '', pagador,
      });
    }
  }
  return rows;
}

export function parseFile(filename, text) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) return { fonte: 'stone_csv', rows: parseStoneCSV(text) };
  if (lower.endsWith('.ofx')) return { fonte: 'ofx', rows: parseOFX(text) };
  return { fonte: 'desconhecido', rows: [] };
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file, 'utf-8');
  });
}
