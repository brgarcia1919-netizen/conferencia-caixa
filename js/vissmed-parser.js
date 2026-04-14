// ═══════════════════════��═══════════════════════════
// VISSMED HTML PARSER
// ═══════════════════════════════════════════════════

export function parseVissmedHTML(text) {
  const result = {
    dinheiro: 0,
    credito: 0,
    debito: 0,
    pix_maquininha: 0,
    pix_conta: 0,
    convenio: 0,
  };

  try {
    // Extract "Total em DINHEIRO"
    const dinMatch = text.match(/Total em DINHEIRO\s+([\d.,]+)/i);
    if (dinMatch) result.dinheiro = parsePtNumber(dinMatch[1]);

    // Extract all credit card amounts
    const creditMatches = text.matchAll(/CRÉDITO VISA\/MASTER[^0-9]+([\d.,]+)/gi);
    for (const m of creditMatches) {
      result.credito += parsePtNumber(m[1]);
    }
    result.credito = Math.round(result.credito * 100) / 100;

    // Extract all debit amounts
    const debitMatches = text.matchAll(/DÉBITO[^0-9]+([\d.,]+)/gi);
    for (const m of debitMatches) {
      result.debito += parsePtNumber(m[1]);
    }
    result.debito = Math.round(result.debito * 100) / 100;

    // Extract PIX STONE
    const pixMatch = text.match(/PIX STONE\s+([\d.,]+)/i);
    if (pixMatch) result.pix_maquininha = parsePtNumber(pixMatch[1]);

    // Extract Total em Convênios
    const convMatch = text.match(/Total em Convênios\s+([\d.,]+)/i);
    if (convMatch) result.convenio = parsePtNumber(convMatch[1]);

  } catch (e) {
    console.error('Erro ao parsear Vissmed:', e);
  }

  return result;
}

function parsePtNumber(str) {
  if (!str) return 0;
  const clean = str.replace(/\./g, '').replace(',', '.');
  return parseFloat(clean) || 0;
}

export function setupImportModal(onImport) {
  const modal = document.getElementById('import-modal');
  const btnImport = document.getElementById('btn-import');
  const btnClose = document.getElementById('modal-close');
  const btnCancel = document.getElementById('modal-cancel');
  const btnConfirm = document.getElementById('modal-confirm');
  const textarea = document.getElementById('vissmed-paste');

  function openModal() {
    textarea.value = '';
    modal.style.display = 'flex';
    textarea.focus();
  }

  function closeModal() {
    modal.style.display = 'none';
  }

  btnImport.addEventListener('click', openModal);
  btnClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  btnConfirm.addEventListener('click', () => {
    const text = textarea.value;
    if (!text.trim()) return;
    const data = parseVissmedHTML(text);
    onImport(data);
    closeModal();
  });
}
