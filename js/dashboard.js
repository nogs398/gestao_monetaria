// =============================================
// js/dashboard.js — Lógica principal
// =============================================

let currentUser = null;
let currentMes = getCurrentMesRef();
let allCartoes = [];
let allFaturas = [];
let allReceitas = [];
let allGastos = [];
let chartCat = null;
let chartMensal = null;
let selectedColor = CARD_COLORS[0];
let csvParsed = [];

// =============================================
// INIT
// =============================================
async function init() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return window.location.href = 'login.html';
  currentUser = user;

  // Load profile
  const { data: profile } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const nome = profile?.nome || user.email.split('@')[0];
  document.getElementById('user-name').textContent = nome;
  document.getElementById('user-email').textContent = user.email;
  document.getElementById('user-avatar').textContent = nome[0].toUpperCase();

  // Month selector
  populateMonthSelect('month-select', currentMes);

  // Load data
  await loadAll();
  renderPage('dashboard');
}

async function logout() {
  await client.auth.signOut();
  window.location.href = 'login.html';
}

// =============================================
// DATA LOADING
// =============================================
async function loadAll() {
  await Promise.all([
    loadCartoes(),
    loadFaturas(),
    loadReceitas(),
    loadGastos()
  ]);
}

async function loadCartoes() {
  const { data, error } = await client.from('cartoes').select('*').eq('user_id', currentUser.id).order('created_at');
  if (error) { console.warn('Tabela cartoes:', error.message); allCartoes = []; return; }
  allCartoes = data || [];
}

async function loadFaturas() {
  const { data, error } = await client.from('faturas_itens').select('*').eq('user_id', currentUser.id).order('data', { ascending: false });
  if (error) { console.warn('Tabela faturas_itens:', error.message); allFaturas = []; return; }
  allFaturas = data || [];
}

async function loadReceitas() {
  const { data, error } = await client.from('receitas').select('*').eq('user_id', currentUser.id).order('data', { ascending: false });
  if (error) { console.warn('Tabela receitas:', error.message); allReceitas = []; return; }
  allReceitas = data || [];
}

async function loadGastos() {
  const { data, error } = await client.from('gastos').select('*').eq('user_id', currentUser.id).order('data', { ascending: false });
  if (error) { console.warn('Tabela gastos:', error.message); allGastos = []; return; }
  allGastos = data || [];
}

// =============================================
// NAVIGATION
// =============================================
const PAGE_CONFIG = {
  dashboard: { title: 'Dashboard', subtitle: 'Visão geral das suas finanças', action: null },
  faturas:   { title: 'Faturas', subtitle: 'Lançamentos importados do CSV', action: '⬆️ Importar CSV' },
  parcelas:  { title: 'Parcelas futuras', subtitle: 'Projeção dos seus parcelamentos', action: null },
  cartoes:   { title: 'Cartões', subtitle: 'Gerencie seus cartões de crédito', action: '+ Novo cartão' },
  receitas:  { title: 'Receitas', subtitle: 'Entradas e salários', action: null },
  gastos:    { title: 'Gastos manuais', subtitle: 'Despesas sem cartão', action: null },
};

function navigate(page) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  renderPage(page);
}

function renderPage(page) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');

  const cfg = PAGE_CONFIG[page];
  document.getElementById('page-title').textContent = cfg.title;
  document.getElementById('page-subtitle').textContent = cfg.subtitle;

  const actionBtn = document.getElementById('topbar-action-btn');
  if (cfg.action) {
    actionBtn.style.display = 'inline-flex';
    actionBtn.textContent = cfg.action;
    actionBtn.onclick = page === 'cartoes' ? openModalCartao : openImportModal;
  } else {
    actionBtn.style.display = 'none';
  }

  switch (page) {
    case 'dashboard': renderDashboard(); break;
    case 'faturas':   renderFaturas(); break;
    case 'parcelas':  renderParcelas(); break;
    case 'cartoes':   renderCartoes(); break;
    case 'receitas':  renderReceitas(); break;
    case 'gastos':    renderGastos(); break;
  }
}

function onMonthChange() {
  currentMes = document.getElementById('month-select').value;
  const active = document.querySelector('.nav-item.active')?.dataset?.page || 'dashboard';
  renderPage(active);
}

// =============================================
// FUNÇÃO CENTRAL: projeta quais itens caem em um mês
// =============================================
function getFaturasDoMes(mes) {
  const result = [];
  allFaturas.forEach(item => {
    const baseRef = item.mes_referencia;
    if (!baseRef) return;
    if (item.parcela_total <= 1) {
      if (baseRef === mes) result.push({ ...item });
    } else {
      const diffMeses = monthDiff(baseRef, mes);
      const parcelaNoMes = item.parcela_atual + diffMeses;
      if (parcelaNoMes >= 1 && parcelaNoMes <= item.parcela_total) {
        result.push({ ...item, parcela_atual: parcelaNoMes, _projetado: diffMeses !== 0 });
      }
    }
  });
  // Deduplicar reimportações: mantém só o item com maior id por descricao+parcela_total
  const seen = new Map();
  result.forEach(item => {
    const key = normDesc(item.descricao) + '_' + item.parcela_total;
    const existing = seen.get(key);
    if (!existing || item.id > existing.id) seen.set(key, item);
  });
  return Array.from(seen.values());
}

function monthDiff(from, to) {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function normDesc(desc) {
  return (desc || '').replace(/\s*-?\s*[Pp]arcela\s+\d+\/\d+/g, '').trim().toLowerCase();
}

// =============================================
// DASHBOARD
// =============================================
function renderDashboard() {
  const faturasMes = getFaturasDoMes(currentMes);
  const receitasMes = allReceitas.filter(r => getMesRefFromReceita(r) === currentMes);
  const gastosMes = allGastos.filter(g => getMesRefFromGasto(g) === currentMes);

  const totalFaturas = faturasMes.reduce((s, f) => s + Number(f.valor), 0);
  const totalReceitas = receitasMes.reduce((s, r) => s + Number(r.valor), 0);
  const totalGastos = gastosMes.reduce((s, g) => s + Number(g.valor), 0);
  const saldo = totalReceitas - totalFaturas - totalGastos;

  document.getElementById('kpi-saldo').textContent = fmtBRL(saldo);
  document.getElementById('kpi-saldo').className = `card-value ${saldo >= 0 ? 'green' : 'red'}`;
  document.getElementById('kpi-receitas').textContent = fmtBRL(totalReceitas);
  document.getElementById('kpi-faturas').textContent = fmtBRL(totalFaturas);
  document.getElementById('kpi-gastos').textContent = fmtBRL(totalGastos);

  // Saldo delta badge
  const deltaEl = document.getElementById('kpi-saldo-delta');
  if (saldo !== 0) {
    const pct = totalReceitas > 0 ? Math.abs(saldo / totalReceitas * 100).toFixed(0) : 0;
    deltaEl.className = `card-delta ${saldo >= 0 ? 'up' : 'down'}`;
    deltaEl.innerHTML = `${saldo >= 0 ? '▲' : '▼'} ${pct}% do salário`;
  } else {
    deltaEl.innerHTML = '';
  }

  renderChartCat(faturasMes, gastosMes);
  renderChartMensal();
  renderTopGastos(faturasMes, gastosMes);
}

function renderTopGastos(faturasMes, gastosMes) {
  const tbody = document.getElementById('top-gastos-list');
  const combined = [
    ...faturasMes.map(f => ({ ...f, _origem: 'fatura' })),
    ...gastosMes.map(g => ({ ...g, _origem: 'gasto', cartao_id: null }))
  ].sort((a, b) => Number(b.valor) - Number(a.valor)).slice(0, 10);

  if (!combined.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><span class="empty-icon">📭</span><p>Nenhum gasto no mês</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = combined.map(item => {
    const cartao = allCartoes.find(c => c.id === item.cartao_id);
    const parcela = item.parcela_total > 1 ? `<span class="badge badge-parcela">${item.parcela_atual}/${item.parcela_total}</span>` : '';
    return `<tr>
      <td>${fmtDate(item.data)}</td>
      <td>${item.descricao} ${parcela}</td>
      <td><span class="badge badge-categoria">${item.categoria || 'Outros'}</span></td>
      <td>${cartao ? `<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:8px;height:8px;border-radius:50%;background:${cartao.cor}"></span>${cartao.nome}</span>` : '—'}</td>
      <td style="text-align:right;color:var(--red);font-weight:600">${fmtBRL(item.valor)}</td>
    </tr>`;
  }).join('');
}

function renderChartCat(faturasMes, gastosMes) {
  const all = [...faturasMes, ...gastosMes];
  const cats = {};
  all.forEach(item => {
    const cat = item.categoria || 'Outros';
    cats[cat] = (cats[cat] || 0) + Number(item.valor);
  });

  const labels = Object.keys(cats);
  const values = Object.values(cats);
  const colors = labels.map(l => CATEGORY_COLORS[l] || '#6B7599');

  if (chartCat) chartCat.destroy();
  const ctx = document.getElementById('chart-cat');
  chartCat = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#111521' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#6B7599', font: { size: 12 }, padding: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${fmtBRL(ctx.raw)}` } }
      },
      cutout: '65%'
    }
  });
}

function renderChartMensal() {
  // Show last 6 months
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(addMonths(currentMes, -i));

  const receitas = months.map(m => allReceitas.filter(r => getMesRefFromReceita(r) === m).reduce((s, r) => s + Number(r.valor), 0));
  const despesas = months.map(m => {
    const fat = getFaturasDoMes(m).reduce((s, f) => s + Number(f.valor), 0);
    const gst = allGastos.filter(g => getMesRefFromGasto(g) === m).reduce((s, g) => s + Number(g.valor), 0);
    return fat + gst;
  });

  if (chartMensal) chartMensal.destroy();
  const ctx = document.getElementById('chart-mensal');
  chartMensal = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months.map(m => getMesLabel(m).split(' ')[0]),
      datasets: [
        { label: 'Receitas', data: receitas, backgroundColor: 'rgba(16,217,138,0.7)', borderRadius: 6 },
        { label: 'Despesas', data: despesas, backgroundColor: 'rgba(240,69,106,0.7)', borderRadius: 6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#6B7599', font: { size: 12 } } }, tooltip: { callbacks: { label: ctx => ` ${fmtBRL(ctx.raw)}` } } },
      scales: {
        x: { ticks: { color: '#6B7599' }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#6B7599', callback: v => `R$${(v/1000).toFixed(0)}k` }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

// =============================================
// FATURAS
// =============================================
function renderFaturas() {
  document.getElementById('faturas-mes-label').textContent = getMesLabel(currentMes);
  const faturasMes = getFaturasDoMes(currentMes);

  // Resumo por cartão
  const resumoEl = document.getElementById('cartoes-resumo');
  if (allCartoes.length) {
    resumoEl.innerHTML = allCartoes.map(c => {
      const total = faturasMes.filter(f => f.cartao_id === c.id).reduce((s, f) => s + Number(f.valor), 0);
      const pct = c.limite > 0 ? Math.min((total / c.limite) * 100, 100) : 0;
      return `<div class="card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${c.cor};flex-shrink:0"></span>
          <span style="font-size:13px;font-weight:600;">${c.nome}</span>
          <span style="font-size:11px;color:var(--muted);margin-left:auto">${c.bandeira}</span>
        </div>
        <div class="card-value red" style="font-size:22px;">${fmtBRL(total)}</div>
        ${c.limite > 0 ? `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px;">Limite: ${fmtBRL(c.limite)} · ${pct.toFixed(0)}% usado</div>` : ''}
      </div>`;
    }).join('');
  } else {
    resumoEl.innerHTML = '';
  }

  renderFaturasList();
}

function renderFaturasList() {
  const busca = (document.getElementById('busca-fatura')?.value || '').toLowerCase();
  const faturasMes = getFaturasDoMes(currentMes);
  const filtered = busca ? faturasMes.filter(f => f.descricao.toLowerCase().includes(busca)) : faturasMes;

  const tbody = document.getElementById('faturas-list');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><span class="empty-icon">📭</span><p>Nenhum item encontrado. Importe um CSV para começar.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const cartao = allCartoes.find(c => c.id === item.cartao_id);
    const parcela = item.parcela_total > 1
      ? `<span class="badge badge-parcela">${item.parcela_atual}/${item.parcela_total}</span>`
      : '<span class="badge badge-categoria">À vista</span>';
    return `<tr>
      <td>${fmtDate(item.data)}</td>
      <td>${item.descricao}</td>
      <td>${cartao ? `<span style="display:inline-flex;align-items:center;gap:5px;font-size:13px;"><span style="width:8px;height:8px;border-radius:50%;background:${cartao.cor}"></span>${cartao.nome}</span>` : '—'}</td>
      <td>
        <span class="badge badge-categoria" style="cursor:pointer;" onclick="openCatModal(${item.id}, '${item.categoria || 'Outros'}')">
          ${item.categoria || 'Outros'} ✏️
        </span>
      </td>
      <td>${parcela}</td>
      <td style="text-align:right;color:var(--red);font-weight:600;">${fmtBRL(item.valor)}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteFaturaItem(${item.id})">✕</button>
      </td>
    </tr>`;
  }).join('');
}

async function deleteFaturaItem(id) {
  if (!confirm('Remover este item?')) return;
  await client.from('faturas_itens').delete().eq('id', id);
  allFaturas = allFaturas.filter(f => f.id !== id);
  renderFaturas();
  showToast('Item removido');
}

// =============================================
// PARCELAS FUTURAS
// Mostra o mês atual + todos os meses futuros com parcelas
// usando a mesma lógica de projeção do getFaturasDoMes
// =============================================
function renderParcelas() {
  const parcelados = allFaturas.filter(f => f.parcela_total > 1);
  if (!parcelados.length) {
    document.getElementById('timeline-container').innerHTML =
      '<div class="empty-state"><span class="empty-icon">📅</span><p>Nenhuma parcela encontrada. Importe um CSV com parcelamentos.</p></div>';
    return;
  }

  // Descobrir todos os meses que têm parcelas (do atual em diante)
  const mesesSet = new Set();
  parcelados.forEach(item => {
    for (let p = item.parcela_atual; p <= item.parcela_total; p++) {
      const diff = p - item.parcela_atual;
      const mesRef = addMonths(item.mes_referencia, diff);
      if (mesRef >= currentMes) mesesSet.add(mesRef);
    }
  });

  if (!mesesSet.size) {
    document.getElementById('timeline-container').innerHTML =
      '<div class="empty-state"><span class="empty-icon">✅</span><p>Nenhuma parcela futura encontrada. Tudo pago!</p></div>';
    return;
  }

  const sortedMonths = Array.from(mesesSet).sort();

  // Totais acumulados para o resumo no topo
  let totalFuturo = 0;

  const cardsHtml = sortedMonths.map(mes => {
    const itensMes = getFaturasDoMes(mes).filter(f => f.parcela_total > 1);
    if (!itensMes.length) return '';
    const total = itensMes.reduce((s, i) => s + Number(i.valor), 0);
    totalFuturo += total;
    const isCurrent = mes === currentMes;

    return `<div class="card" style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="font-size:15px;color:${isCurrent ? 'var(--accent)' : 'var(--text)'}">
          ${getMesLabel(mes)}
          ${isCurrent ? '<span style="font-size:11px;background:rgba(91,110,245,0.2);color:var(--accent);padding:2px 8px;border-radius:20px;margin-left:8px;">mês atual</span>' : ''}
        </h3>
        <span style="font-size:15px;font-weight:700;color:var(--red)">${fmtBRL(total)}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${itensMes.map(item => {
          const cartao = allCartoes.find(c => c.id === item.cartao_id);
          const nomeClean = item.descricao.replace(/\s*-?\s*[Pp]arcela\s+\d+\/\d+/g, '').trim();
          return `<div class="timeline-item">
            <span class="timeline-item-name">${nomeClean}</span>
            <span class="timeline-item-parcela">${item.parcela_atual}/${item.parcela_total}</span>
            ${cartao ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);margin-right:8px;"><span style="width:6px;height:6px;border-radius:50%;background:${cartao.cor}"></span>${cartao.nome}</span>` : ''}
            <span class="timeline-item-valor">${fmtBRL(item.valor)}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  // Resumo no topo
  const resumo = `<div class="card" style="margin-bottom:20px;background:linear-gradient(135deg,rgba(91,110,245,0.12),rgba(139,92,246,0.08));border-color:rgba(91,110,245,0.25);">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Total em parcelas futuras</div>
        <div style="font-family:'Syne',sans-serif;font-size:28px;font-weight:700;color:var(--red);">${fmtBRL(totalFuturo)}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:12px;color:var(--muted);font-weight:600;margin-bottom:4px;">Meses com parcelas</div>
        <div style="font-size:24px;font-weight:700;">${sortedMonths.length}</div>
      </div>
    </div>
  </div>`;

  document.getElementById('timeline-container').innerHTML = resumo + cardsHtml;
}

// =============================================
// CARTÕES
// =============================================
function renderCartoes() {
  const list = document.getElementById('cartoes-list');
  const cartoesHTML = allCartoes.map(c => `
    <div class="credit-card" style="background:linear-gradient(135deg, ${c.cor}, ${c.cor}99);" onclick="openModalCartao(${c.id})">
      <div>
        <div class="card-brand">${c.bandeira}</div>
        <div class="card-nome">${c.nome}</div>
      </div>
      <div class="card-footer">
        <div>
          <div class="card-label">Vencimento</div>
          <div class="card-info-value">Dia ${c.vencimento}</div>
        </div>
        <div>
          <div class="card-label">Fechamento</div>
          <div class="card-info-value">Dia ${c.fechamento}</div>
        </div>
        ${c.limite > 0 ? `<div>
          <div class="card-label">Limite</div>
          <div class="card-info-value">${fmtBRL(c.limite)}</div>
        </div>` : ''}
      </div>
    </div>`).join('');

  list.innerHTML = cartoesHTML + `
    <button class="card-add-btn" onclick="openModalCartao()">
      <span style="font-size:28px;">+</span>
      <span style="font-size:14px;font-weight:600;">Adicionar cartão</span>
    </button>`;
}

function openModalCartao(cartaoId) {
  selectedColor = CARD_COLORS[0];
  // Build color swatches
  const swatches = document.getElementById('color-swatches');
  swatches.innerHTML = CARD_COLORS.map(c => `
    <div class="color-swatch ${c === selectedColor ? 'selected' : ''}"
      style="background:${c}" onclick="selectColor('${c}')"></div>`).join('');

  document.getElementById('cartao-edit-id').value = cartaoId || '';
  if (cartaoId) {
    const c = allCartoes.find(x => x.id === cartaoId);
    if (!c) return;
    document.getElementById('cartao-modal-title').textContent = '✏️ Editar cartão';
    document.getElementById('cartao-nome').value = c.nome;
    document.getElementById('cartao-bandeira').value = c.bandeira;
    document.getElementById('cartao-limite').value = c.limite;
    document.getElementById('cartao-venc').value = c.vencimento;
    document.getElementById('cartao-fech').value = c.fechamento;
    selectedColor = c.cor;
    swatches.querySelectorAll('.color-swatch').forEach(el => {
      el.classList.toggle('selected', el.style.background === c.cor || el.style.background === `rgb(${hexToRgb(c.cor)})`);
    });
  } else {
    document.getElementById('cartao-modal-title').textContent = '💳 Novo cartão';
    document.getElementById('cartao-nome').value = '';
    document.getElementById('cartao-bandeira').value = 'Visa';
    document.getElementById('cartao-limite').value = '';
    document.getElementById('cartao-venc').value = '10';
    document.getElementById('cartao-fech').value = '3';
  }
  openModal('modal-cartao');
}

function selectColor(color) {
  selectedColor = color;
  document.querySelectorAll('.color-swatch').forEach(el => {
    el.classList.toggle('selected', el.style.background === color || el.style.background === `rgb(${hexToRgb(color)})`);
  });
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `${r}, ${g}, ${b}`;
}

async function saveCartao() {
  const id = document.getElementById('cartao-edit-id').value;
  const data = {
    user_id: currentUser.id,
    nome: document.getElementById('cartao-nome').value,
    bandeira: document.getElementById('cartao-bandeira').value,
    limite: parseFloat(document.getElementById('cartao-limite').value) || 0,
    vencimento: parseInt(document.getElementById('cartao-venc').value) || 10,
    fechamento: parseInt(document.getElementById('cartao-fech').value) || 3,
    cor: selectedColor
  };
  if (!data.nome) return showToast('Nome é obrigatório', 'error');

  if (id) {
    await client.from('cartoes').update(data).eq('id', parseInt(id));
    showToast('Cartão atualizado!');
  } else {
    await client.from('cartoes').insert(data);
    showToast('Cartão adicionado!');
  }
  closeModal('modal-cartao');
  await loadCartoes();
  renderCartoes();
  populateImportCartaoSelect();
}

// =============================================
// RECEITAS
// =============================================
function getMesRefFromReceita(r) {
  // Se tem mes_referencia usa ele, senão deriva da data, senão usa created_at
  if (r.mes_referencia) return r.mes_referencia;
  if (r.data) return r.data.substring(0, 7);
  if (r.created_at) return r.created_at.substring(0, 7);
  return currentMes;
}

function renderReceitas() {
  const receitasMes = allReceitas.filter(r => getMesRefFromReceita(r) === currentMes);
  const total = receitasMes.reduce((s, r) => s + Number(r.valor), 0);
  document.getElementById('receitas-mes-label').textContent = getMesLabel(currentMes);
  document.getElementById('total-receitas-page').textContent = fmtBRL(total);

  // Set date input to first day of currentMes by default
  const [y, m] = currentMes.split('-');
  const today = new Date();
  const isCurrentMonth = currentMes === getCurrentMesRef();
  document.getElementById('rec-data').value = isCurrentMonth
    ? today.toISOString().split('T')[0]
    : `${y}-${m}-01`;

  const tbody = document.getElementById('receitas-list');
  if (!receitasMes.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><span class="empty-icon">💵</span><p>Nenhuma receita em ${getMesLabel(currentMes)}</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = receitasMes.map(r => `
    <tr>
      <td>${r.descricao}</td>
      <td>${fmtDate(r.data)}</td>
      <td style="text-align:right;color:var(--green);font-weight:600;">${fmtBRL(r.valor)}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteReceita(${r.id})">✕</button></td>
    </tr>`).join('');
}

async function addReceita() {
  const desc = document.getElementById('rec-desc').value;
  const valor = parseFloat(document.getElementById('rec-valor').value);
  const data = document.getElementById('rec-data').value;
  if (!desc || !valor || !data) return showToast('Preencha todos os campos', 'error');

  // Sempre salva no mês que está selecionado no topo, não importa a data escolhida
  const { error } = await client.from('receitas').insert({
    user_id: currentUser.id,
    descricao: desc,
    valor,
    data,
    mes_referencia: currentMes
  });

  if (error) return showToast('Erro ao salvar: ' + error.message, 'error');

  document.getElementById('rec-desc').value = '';
  document.getElementById('rec-valor').value = '';
  showToast('Receita adicionada!');
  await loadReceitas();
  renderReceitas();
}

async function deleteReceita(id) {
  await client.from('receitas').delete().eq('id', id);
  allReceitas = allReceitas.filter(r => r.id !== id);
  renderReceitas();
  showToast('Receita removida');
}

// =============================================
// GASTOS MANUAIS
// =============================================
function getMesRefFromGasto(g) {
  if (g.mes_referencia) return g.mes_referencia;
  if (g.data) return g.data.substring(0, 7);
  if (g.created_at) return g.created_at.substring(0, 7);
  return currentMes;
}

function renderGastos() {
  const gastosMes = allGastos.filter(g => getMesRefFromGasto(g) === currentMes);
  const total = gastosMes.reduce((s, g) => s + Number(g.valor), 0);
  document.getElementById('gastos-mes-label').textContent = getMesLabel(currentMes);
  document.getElementById('total-gastos-page').textContent = fmtBRL(total);

  const [y, m] = currentMes.split('-');
  const isCurrentMonth = currentMes === getCurrentMesRef();
  document.getElementById('gst-data').value = isCurrentMonth
    ? new Date().toISOString().split('T')[0]
    : `${y}-${m}-01`;

  const tbody = document.getElementById('gastos-list');
  if (!gastosMes.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><span class="empty-icon">🛍️</span><p>Nenhum gasto em ${getMesLabel(currentMes)}</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = gastosMes.map(g => `
    <tr>
      <td>${g.descricao}</td>
      <td><span class="badge badge-categoria">${g.categoria}</span></td>
      <td>${fmtDate(g.data)}</td>
      <td style="text-align:right;color:var(--red);font-weight:600;">${fmtBRL(g.valor)}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteGasto(${g.id})">✕</button></td>
    </tr>`).join('');
}

async function addGasto() {
  const desc = document.getElementById('gst-desc').value;
  const cat = document.getElementById('gst-cat').value;
  const valor = parseFloat(document.getElementById('gst-valor').value);
  const data = document.getElementById('gst-data').value;
  if (!desc || !valor || !data) return showToast('Preencha todos os campos', 'error');

  const { error } = await client.from('gastos').insert({
    user_id: currentUser.id,
    descricao: desc,
    categoria: cat,
    valor,
    data,
    mes_referencia: currentMes
  });

  if (error) return showToast('Erro ao salvar: ' + error.message, 'error');

  document.getElementById('gst-desc').value = '';
  document.getElementById('gst-valor').value = '';
  showToast('Gasto adicionado!');
  await loadGastos();
  renderGastos();
}

async function deleteGasto(id) {
  await client.from('gastos').delete().eq('id', id);
  allGastos = allGastos.filter(g => g.id !== id);
  renderGastos();
  showToast('Gasto removido');
}

// =============================================
// MODAL CATEGORIA
// =============================================
function openCatModal(itemId, catAtual) {
  document.getElementById('cat-item-id').value = itemId;
  document.getElementById('cat-select').value = catAtual;
  openModal('modal-categoria');
}

async function saveCategoria() {
  const id = parseInt(document.getElementById('cat-item-id').value);
  const cat = document.getElementById('cat-select').value;
  await client.from('faturas_itens').update({ categoria: cat }).eq('id', id);
  const item = allFaturas.find(f => f.id === id);
  if (item) item.categoria = cat;
  closeModal('modal-categoria');
  showToast('Categoria atualizada!');
  renderFaturas();
}

// =============================================
// IMPORT — CSV + PDF
// =============================================
function openImportModal() {
  csvParsed = [];
  document.getElementById('csv-file').value = '';
  document.getElementById('upload-label').textContent = 'Arraste o arquivo aqui ou clique para selecionar';
  document.getElementById('csv-preview').style.display = 'none';
  document.getElementById('btn-import').disabled = true;
  populateMonthSelect('import-mes', currentMes);
  populateImportCartaoSelect();
  // Sync toggle visual
  updateToggleVisual();
  openModal('modal-import');
}

function updateToggleVisual() {
  const cb = document.getElementById('toggle-substituir');
  const track = document.getElementById('toggle-track');
  const thumb = document.getElementById('toggle-thumb');
  if (!cb || !track || !thumb) return;
  track.style.background = cb.checked ? 'var(--accent)' : '#374151';
  thumb.style.left = cb.checked ? '19px' : '3px';
}

document.addEventListener('change', e => {
  if (e.target.id === 'toggle-substituir') updateToggleVisual();
});

function populateImportCartaoSelect() {
  const sel = document.getElementById('import-cartao');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Selecione um cartão —</option>';
  allCartoes.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.nome} (${c.bandeira})`;
    sel.appendChild(opt);
  });
}

function onFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('upload-label').textContent = `📄 ${file.name}`;
  if (file.name.toLowerCase().endsWith('.pdf')) {
    parsePDF(file);
  } else {
    const reader = new FileReader();
    reader.onload = e => parseCSV(e.target.result);
    reader.readAsText(file, 'UTF-8');
  }
}

// ---- CSV Parser (Nubank) ----
function parseCSV(text) {
  const lines = text.trim().split('\n');
  csvParsed = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g)?.map(c => c.replace(/^"|"$/g, '').trim()) || line.split(',').map(c => c.trim());
    if (cols.length < 3) continue;
    const [date, title, amount] = cols;
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) continue;
    csvParsed.push({
      date,
      title,
      amount: val,
      parcela: parseParcela(title),
      categoria: detectCategoria(title)
    });
  }

  showBadge('CSV · Nubank');
  renderPreview();
}

// ---- PDF Parser (Itaú e outros) ----
async function parsePDF(file) {
  document.getElementById('upload-label').textContent = '⏳ Lendo PDF...';
  try {
    // Set workerSrc
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      fullText += content.items.map(i => i.str).join(' ') + '\n';
    }

    csvParsed = parseItauPDF(fullText);

    if (!csvParsed.length) {
      showToast('Nenhum lançamento encontrado no PDF. Verifique se é uma fatura do Itaú.', 'error');
      document.getElementById('upload-label').textContent = 'Arraste o arquivo aqui ou clique para selecionar';
      return;
    }

    showBadge('PDF · Itaú');
    renderPreview();
    document.getElementById('upload-label').textContent = `📄 ${file.name}`;
  } catch (err) {
    console.error(err);
    showToast('Erro ao ler o PDF: ' + err.message, 'error');
    document.getElementById('upload-label').textContent = 'Arraste o arquivo aqui ou clique para selecionar';
  }
}

function parseItauPDF(text) {
  const items = [];
  const mesRef = document.getElementById('import-mes').value;
  const [refYear, refMonth] = mesRef.split('-').map(Number);

  // Pattern: DD/MM DESCRIPTION ... VALUE
  // ex: "14/04 Wellhub Donizete Moseli 69,99"
  // ex: "24/02 OTICA SILVANA 02/02 75,00"
  // The PDF text comes concatenated, so we look for the transactions block
  
  // Find the transactions section
  const startMarkers = ['Lançamentos: compras', 'LANÇAMENTOS', 'Lançamentos no cartão', 'DATA ESTABELECIMENTO'];
  const endMarkers = ['Total dos lançamentos', 'Limites de crédito', 'Encargos cobrados'];

  let startIdx = -1;
  for (const m of startMarkers) {
    const idx = text.indexOf(m);
    if (idx !== -1 && (startIdx === -1 || idx < startIdx)) startIdx = idx;
  }
  if (startIdx === -1) startIdx = 0;

  let endIdx = text.length;
  for (const m of endMarkers) {
    const idx = text.indexOf(m, startIdx + 10);
    if (idx !== -1 && idx < endIdx) endIdx = idx;
  }

  const section = text.substring(startIdx, endIdx);

  // Match: DD/MM ... value like "75,00" or "1.234,56"
  // Lines are like: "14/04 Wellhub Donizete Moseli 69,99"
  const lineRegex = /(\d{2})\/(\d{2})\s+(.+?)\s+([\d]{1,3}(?:\.\d{3})*,\d{2})/g;
  let match;

  while ((match = lineRegex.exec(section)) !== null) {
    const day = match[1];
    const month = match[2];
    let desc = match[3].trim();
    const valStr = match[4].replace('.', '').replace(',', '.');
    const val = parseFloat(valStr);

    if (isNaN(val) || val <= 0) continue;

    // Skip lines that are clearly metadata (juros, IOF, CET, etc)
    if (/juros|multa|iof|cet|rotativo|financiado|pagamento|limite|saldo|total|encargo|taxa/i.test(desc)) continue;

    // Clean up description — remove extra date patterns like "02/02" in middle
    desc = desc.replace(/\d{2}\/\d{2}\s*/g, '').trim();
    if (!desc) continue;

    // Build date: use the year from mesRef
    // If month > refMonth by more than 1, it's probably previous year
    let year = refYear;
    const mon = parseInt(month);
    if (mon > refMonth + 1) year = refYear - 1;

    const date = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
    const parcela = parseParcela(desc);
    const categoria = detectCategoria(desc);

    items.push({ date, title: desc, amount: val, parcela, categoria });
  }

  return items;
}

function showBadge(label) {
  const badge = document.getElementById('import-source-badge');
  if (badge) { badge.textContent = label; badge.style.display = 'inline-flex'; }
}

function renderPreview() {
  document.getElementById('csv-count').textContent = csvParsed.length;
  document.getElementById('csv-preview').style.display = 'block';
  document.getElementById('btn-import').disabled = csvParsed.length === 0;

  const tbody = document.getElementById('csv-preview-list');
  tbody.innerHTML = csvParsed.slice(0, 8).map(item => `
    <tr>
      <td>${item.date}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.title}</td>
      <td style="color:var(--red)">${fmtBRL(item.amount)}</td>
      <td>${item.parcela.total > 1 ? `<span class="badge badge-parcela">${item.parcela.atual}/${item.parcela.total}</span>` : '—'}</td>
    </tr>`).join('');
  if (csvParsed.length > 8) {
    tbody.innerHTML += `<tr><td colspan="4" style="text-align:center;color:var(--muted);font-size:12px;">+ ${csvParsed.length - 8} itens...</td></tr>`;
  }
}

async function importFatura() {
  if (!csvParsed.length) return showToast('Nenhum dado para importar', 'error');
  const cartaoId = document.getElementById('import-cartao').value || null;
  const mesRef = document.getElementById('import-mes').value;
  const substituir = document.getElementById('toggle-substituir').checked;

  const btn = document.getElementById('btn-import');
  btn.innerHTML = '<span class="spinner"></span> Importando...';
  btn.disabled = true;

  // Se toggle ativo: apaga lançamentos existentes desse mês/cartão primeiro
  if (substituir) {
    let query = client.from('faturas_itens')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('mes_referencia', mesRef);
    if (cartaoId) query = query.eq('cartao_id', parseInt(cartaoId));
    const { error: delError } = await query;
    if (delError) console.warn('Erro ao limpar mês anterior:', delError.message);
  }

  const rows = csvParsed.map(item => ({
    user_id: currentUser.id,
    cartao_id: cartaoId ? parseInt(cartaoId) : null,
    descricao: item.title,
    valor: item.amount,
    data: item.date,
    parcela_atual: item.parcela.atual,
    parcela_total: item.parcela.total,
    categoria: item.categoria,
    mes_referencia: mesRef
  }));

  const { error } = await client.from('faturas_itens').insert(rows);
  btn.innerHTML = 'Importar fatura';
  btn.disabled = false;

  if (error) return showToast('Erro ao importar: ' + error.message, 'error');

  showToast(`✅ ${rows.length} itens importados!`);
  closeModal('modal-import');
  await loadFaturas();
  renderPage('faturas');
}

// =============================================
// DRAG & DROP
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('upload-zone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const name = file.name.toLowerCase();
      if (name.endsWith('.csv') || name.endsWith('.pdf')) {
        document.getElementById('csv-file').files = e.dataTransfer.files;
        document.getElementById('upload-label').textContent = `📄 ${file.name}`;
        if (name.endsWith('.pdf')) {
          parsePDF(file);
        } else {
          const reader = new FileReader();
          reader.onload = ev => parseCSV(ev.target.result);
          reader.readAsText(file, 'UTF-8');
        }
      }
    });
  }
});

// =============================================
// START
// =============================================
init();
