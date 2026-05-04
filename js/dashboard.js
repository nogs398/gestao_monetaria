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
let activeCategoryFilter = null;
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
  gastos:       { title: 'Gastos manuais', subtitle: 'Despesas sem cartão', action: null },
  planejamento: { title: 'Planejamento', subtitle: 'Divisão de salário e adiantamento por período', action: null },
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
    case 'gastos':        renderGastos(); break;
    case 'planejamento':  renderPlanejamento(); break;
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
    const key = [
      normDesc(item.descricao),
      Number(item.valor).toFixed(2),
      item.parcela_total,
      item.cartao_id || 'sem-cartao'
    ].join('_');

    const existing = seen.get(key);

    if (!existing || item.id > existing.id) {
      seen.set(key, item);
    }
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

    const header = tbody
        ?.closest('.card')
        ?.querySelector('.section-header');

    if (header) {
        header.innerHTML = `
            <h3>
                Maiores gastos do mês
                ${
                    activeCategoryFilter
                        ? `<span class="badge badge-parcela" style="margin-left:8px;">
                            ${activeCategoryFilter}
                           </span>`
                        : ''
                }
            </h3>

            ${
                activeCategoryFilter
                    ? `<button class="btn btn-ghost btn-sm" onclick="clearCategoryFilter()">
                        Limpar filtro
                       </button>`
                    : ''
            }
        `;
    }

    let combined = [
        ...faturasMes.map(f => ({ ...f, _origem: 'fatura' })),
        ...gastosMes.map(g => ({
            ...g,
            _origem: 'gasto',
            cartao_id: null,
            parcela_total: 1,
            parcela_atual: 1
        }))
    ];

    if (activeCategoryFilter) {
        combined = combined.filter(
            item => (item.categoria || 'Outros') === activeCategoryFilter
        );
    }

    combined = combined
        .sort((a, b) => Number(b.valor) - Number(a.valor))
        .slice(0, activeCategoryFilter ? 100 : 10);

    if (!combined.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="empty-state">
                        <span class="empty-icon">📭</span>
                        <p>Nenhum gasto encontrado para esse filtro</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = combined.map(item => {
        const cartao = allCartoes.find(c => c.id === item.cartao_id);
        const categoria = item.categoria || 'Outros';
        const categoriaSafe = categoria.replace(/'/g, "\\'");

        const parcela = item.parcela_total > 1
            ? `<span class="badge badge-parcela">${item.parcela_atual}/${item.parcela_total}</span>`
            : '';

        return `
            <tr>
                <td>${item.descricao} ${parcela}</td>

                <td>
                    <span
                        class="badge badge-categoria"
                        style="cursor:pointer;"
                        onclick="openCatModal(${item.id}, '${categoriaSafe}', '${item._origem}')"
                        title="Clique para editar"
                    >
                        ${categoria} ✏️
                    </span>
                </td>

                <td>${fmtDate(item.data)}</td>

                <td>
                    ${
                        cartao
                            ? `<span style="display:inline-flex;align-items:center;gap:5px;">
                                <span style="width:8px;height:8px;border-radius:50%;background:${cartao.cor}"></span>
                                ${cartao.nome}
                               </span>`
                            : item._origem === 'gasto'
                                ? 'Gasto manual'
                                : '—'
                    }
                </td>

                <td style="text-align:right;color:var(--red);font-weight:600">
                    ${fmtBRL(item.valor)}
                </td>
            </tr>
        `;
    }).join('');
}
function clearCategoryFilter() {
    activeCategoryFilter = null;

    const faturasMes = getFaturasDoMes(currentMes);
    const gastosMes = allGastos.filter(
        g => getMesRefFromGasto(g) === currentMes
    );

    renderTopGastos(faturasMes, gastosMes);
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
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#111521'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            onClick: (event, elements, chart) => {
                if (!elements.length) return;

                const index = elements[0].index;
                const categoria = chart.data.labels[index];

                activeCategoryFilter =
                    activeCategoryFilter === categoria ? null : categoria;

                const faturasMesAtual = getFaturasDoMes(currentMes);
                const gastosMesAtual = allGastos.filter(
                    g => getMesRefFromGasto(g) === currentMes
                );

                renderTopGastos(faturasMesAtual, gastosMesAtual);
            },
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#6B7599',
                        font: { size: 12 },
                        padding: 12
                    }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${fmtBRL(ctx.raw)}`
                    }
                }
            }
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
        <span class="badge badge-categoria" style="cursor:pointer;" onclick="openCatModal(${item.id}, '${item.categoria || 'Outros'}', 'fatura')">
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
      <td>
          <span
              class="badge badge-categoria"
              style="cursor:pointer;"
              onclick="openCatModal(${g.id}, '${g.categoria || 'Outros'}', 'gasto')"
          >
              ${g.categoria || 'Outros'} ✏️
          </span>
      </td>
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

function openCatModal(itemId, catAtual, tipo = 'fatura') {
    document.getElementById('cat-item-id').value = itemId;
    document.getElementById('cat-item-tipo').value = tipo;
    document.getElementById('cat-select').value = catAtual || 'Outros';

    openModal('modal-categoria');
}



async function saveCategoria() {
    const id = parseInt(document.getElementById('cat-item-id').value);
    const tipo = document.getElementById('cat-item-tipo').value || 'fatura';
    const cat = document.getElementById('cat-select').value;

    const tabela = tipo === 'gasto' ? 'gastos' : 'faturas_itens';

    const { error } = await client
        .from(tabela)
        .update({ categoria: cat })
        .eq('id', id)
        .eq('user_id', currentUser.id);

    if (error) {
        return showToast('Erro ao atualizar categoria: ' + error.message, 'error');
    }

    if (tipo === 'gasto') {
        const item = allGastos.find(g => g.id === id);
        if (item) item.categoria = cat;
    } else {
        const item = allFaturas.find(f => f.id === id);
        if (item) item.categoria = cat;
    }

    closeModal('modal-categoria');
    showToast('Categoria atualizada!');

    const activePage =
        document.querySelector('.nav-item.active')?.dataset?.page || 'dashboard';

    renderPage(activePage);
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

  const startMarkers = [
    'Lançamentos: compras',
    'LANÇAMENTOS',
    'Lançamentos no cartão',
    'DATA ESTABELECIMENTO'
  ];

  const endMarkers = [
    'Total dos lançamentos',
    'Limites de crédito',
    'Encargos cobrados'
  ];

  let startIdx = -1;

  for (const marker of startMarkers) {
    const idx = text.indexOf(marker);

    if (idx !== -1 && (startIdx === -1 || idx < startIdx)) {
      startIdx = idx;
    }
  }

  if (startIdx === -1) startIdx = 0;

  let endIdx = text.length;

  for (const marker of endMarkers) {
    const idx = text.indexOf(marker, startIdx + 10);

    if (idx !== -1 && idx < endIdx) {
      endIdx = idx;
    }
  }

  const section = text.substring(startIdx, endIdx);

  const lineRegex = /(\d{2})\/(\d{2})\s+(.+?)\s+([\d]{1,3}(?:\.\d{3})*,\d{2})/g;

  let match;

  while ((match = lineRegex.exec(section)) !== null) {
    const day = match[1];
    const month = match[2];
    let desc = match[3].trim();

    const valStr = match[4].replace(/\./g, '').replace(',', '.');
    const val = parseFloat(valStr);

    if (isNaN(val) || val <= 0) continue;

    if (
      /juros|multa|iof|cet|rotativo|financiado|pagamento|limite|saldo|total|encargo|taxa/i
        .test(desc)
    ) {
      continue;
    }

    desc = desc.replace(/\s+/g, ' ').trim();

    if (!desc) continue;

    let year = refYear;
    const mon = parseInt(month, 10);

    if (mon > refMonth + 1) {
      year = refYear - 1;
    }

    const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    const parcela = parseParcela(desc);
    const categoria = detectCategoria(desc);

    items.push({
      date,
      title: desc,
      amount: val,
      parcela,
      categoria
    });
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
// DRAG & DROP (fatura CSV/PDF)
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  setupDrop('upload-zone', 'csv-file', 'upload-label', (file) => {
    if (file.name.toLowerCase().endsWith('.pdf')) parsePDF(file);
    else { const r = new FileReader(); r.onload = e => parseCSV(e.target.result); r.readAsText(file,'UTF-8'); }
  });
  setupDrop('upload-zone-extrato', 'extrato-file', 'extrato-upload-label', (file) => {
    onExtratoFile(file);
  });
});

function setupDrop(zoneId, inputId, labelId, handler) {
  const zone = document.getElementById(zoneId);
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.pdf')) {
      document.getElementById(labelId).textContent = `📄 ${file.name}`;
      handler(file);
    }
  });
}

// =============================================
// IMPORTAR EXTRATO (gastos + receitas)
// =============================================
let extratoParsed = { gastos: [], receitas: [] };
let extratoTabAtiva = 'gastos';

function openImportExtratoModal() {
  extratoParsed = { gastos: [], receitas: [] };
  document.getElementById('extrato-file').value = '';
  document.getElementById('extrato-upload-label').textContent = 'Arraste o extrato aqui ou clique para selecionar';
  document.getElementById('extrato-preview').style.display = 'none';
  document.getElementById('btn-import-extrato').disabled = true;
  populateMonthSelect('extrato-mes', currentMes);
  openModal('modal-extrato');
}

function onExtratoSelect(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('extrato-upload-label').textContent = `📄 ${file.name}`;
  onExtratoFile(file);
}

async function onExtratoFile(file) {
  document.getElementById('extrato-upload-label').textContent = '⏳ Lendo arquivo...';
  try {
    if (file.name.toLowerCase().endsWith('.pdf')) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const ab = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
      let text = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const ct = await page.getTextContent();
        text += ct.items.map(i => i.str).join(' ') + '\n';
      }
      extratoParsed = parseExtratoText(text, 'pdf');
    } else {
      const text = await file.text();
      extratoParsed = parseExtratoCSV(text);
    }
    document.getElementById('extrato-upload-label').textContent = `📄 ${file.name}`;
    renderExtratoPrev();
  } catch(err) {
    showToast('Erro ao ler arquivo: ' + err.message, 'error');
    document.getElementById('extrato-upload-label').textContent = 'Arraste o extrato aqui ou clique para selecionar';
  }
}

// Parse extrato CSV — detecta débitos e créditos
// Suporta Nubank (date,title,amount — negativos = crédito)
// e formato genérico (data, descrição, valor, tipo)
function parseExtratoCSV(text) {
  const lines = text.trim().split('\n');
  const gastos = [], receitas = [];
  const header = lines[0].toLowerCase();
  const mesRef = document.getElementById('extrato-mes').value;


  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g)?.map(c => c.replace(/^"|"$/g,'').trim()) || line.split(',').map(c=>c.trim());
    if (cols.length < 3) continue;

    // Nubank: date, title, amount (negativo = pix/crédito recebido)
    if (header.includes('date') && header.includes('title')) {
      const [dateRaw, title, amtStr] = cols;
      const date = normalizarDataExtrato(dateRaw, mesRef);

      if (!date || !dataPertenceAoMes(date, mesRef)) continue;

      const val = parseValorBR(amtStr);
      if (isNaN(val)) continue
      if (val < 0) {
        // crédito (ex: pagamento fatura, pix recebido)
        receitas.push({ date, title, amount: Math.abs(val), categoria: detectCatReceita(title) });
      } else {
        gastos.push({ date, title, amount: val, categoria: detectCategoria(title) });
      }
    } else {
      // Formato genérico: tenta achar valor e sentido
      const [dateRaw, title, amtStr, tipo] = cols;
      const date = normalizarDataExtrato(dateRaw, mesRef);

      if (!date || !dataPertenceAoMes(date, mesRef)) continue;

      const valOriginal = parseValorBR(amtStr);
      const val = Math.abs(valOriginal);
      if (isNaN(val) || val === 0) continue;
      const isCredito =
      valOriginal > 0 &&
      (
          (tipo || '').toLowerCase().includes('créd') ||
          (tipo || '').toLowerCase().includes('receb') ||
          (tipo || '').toLowerCase().includes('entrada') ||
          !tipo
      );
      if (isCredito) {
        receitas.push({ date, title, amount: val, categoria: detectCatReceita(title) });
      } else {
        gastos.push({ date, title, amount: val, categoria: detectCategoria(title) });
      }
    }
  }
  return { gastos, receitas };
}

// Parse extrato PDF — texto livre

function parseExtratoText(text, _tipo) {
    const gastos = [];
    const receitas = [];

    const mesRef = document.getElementById('extrato-mes').value;

    const cleanText = String(text || '')
        .replace(/\*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    /*
        Captura linhas do Itaú nesse formato:

        04/05/2026 PIX TRANSF GABRIEL01/05 -100,00
        29/04/2026 REMUNERACAO/SALARIO 1.664,46

        Grupo 1: data
        Grupo 2: descrição
        Grupo 3: valor com ou sem sinal negativo
    */
    const re = /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(-?\s*\d{1,3}(?:\.\d{3})*,\d{2})(?=\s+\d{2}\/\d{2}\/\d{4}|\s+Aviso|\s*$)/g;

    let match;

    while ((match = re.exec(cleanText)) !== null) {
        const dateRaw = match[1];
        let desc = match[2].trim();
        const valorRaw = match[3];

        const date = normalizarDataExtrato(dateRaw, mesRef);
        if (!date) continue;

        // Filtra pelo mês selecionado no modal.
        // Ex: se selecionou 2026-05, só entra data 2026-05.
        if (!dataPertenceAoMes(date, mesRef)) continue;

        if (deveIgnorarLinhaExtrato(desc)) continue;
        if (deveIgnorarPagamentoFatura(desc)) continue;

        const valor = parseValorBR(valorRaw);
        if (isNaN(valor) || valor === 0) continue;

        desc = desc.replace(/\s+/g, ' ').trim();

        if (valor < 0) {
            gastos.push({
                date,
                title: desc,
                amount: Math.abs(valor),
                categoria: detectCategoria(desc)
            });
        } else {
            receitas.push({
                date,
                title: desc,
                amount: valor,
                categoria: detectCatReceita(desc)
            });
        }
    }

    return { gastos, receitas };
}


function parseValorBR(valorStr) {
    if (!valorStr) return 0;

    const clean = valorStr
        .replace(/\*/g, '')
        .replace(/\s/g, '')
        .replace(/\./g, '')
        .replace(',', '.');

    return parseFloat(clean);
}

function normalizarDataExtrato(dateStr, mesRefFallback) {
    if (!dateStr) return null;

    const clean = dateStr.trim();

    // Já está no formato YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
        return clean;
    }

    // Formato DD/MM/YYYY
    const full = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (full) {
        const [, dd, mm, yyyy] = full;
        return `${yyyy}-${mm}-${dd}`;
    }

    // Formato DD/MM
    const short = clean.match(/^(\d{2})\/(\d{2})$/);
    if (short) {
        const [, dd, mm] = short;
        const [yyyy] = mesRefFallback.split('-');
        return `${yyyy}-${mm}-${dd}`;
    }

    return null;
}

function dataPertenceAoMes(dateISO, mesRef) {
    if (!dateISO || !mesRef) return false;
    return dateISO.substring(0, 7) === mesRef;
}

function deveIgnorarLinhaExtrato(desc) {
    const d = (desc || '').toLowerCase();

    return (
        /saldo do dia/i.test(d) ||
        /saldo em conta/i.test(d) ||
        /limite da conta/i.test(d) ||
        /total contratado/i.test(d) ||
        /extrato conta/i.test(d) ||
        /lançamentos/i.test(d) ||
        /periodo de visualização/i.test(d) ||
        /período de visualização/i.test(d)
    );
}

function deveIgnorarPagamentoFatura(desc) {
    const d = (desc || '').toLowerCase();

    /*
        Importante:
        Se você já importa a fatura do cartão separada,
        pagamento de fatura no extrato bancário precisa ser ignorado,
        senão duplica despesa.
    */
    return (
        /fatura paga/i.test(d) ||
        /faturaitau/i.test(d) ||
        /fatura itau/i.test(d) ||
        /itau platinu/i.test(d) ||
        /itau multipl/i.test(d)
    );
}

function detectCatReceita(desc) {
  const d = (desc||'').toLowerCase();
  if (/salário|salario|folha|pagamento emp/i.test(d)) return 'Salário';
  if (/adiant/i.test(d)) return 'Adiantamento';
  if (/freela|freelance|serviço|honorário/i.test(d)) return 'Freelance';
  if (/rendimento|invest|aplicação|resgate/i.test(d)) return 'Investimentos';
  if (/pix|transfer/i.test(d)) return 'Transferência';
  return 'Outros';
}

function renderExtratoPrev() {
  const { gastos, receitas } = extratoParsed;
  const totalG = gastos.reduce((s,g) => s+g.amount, 0);
  const totalR = receitas.reduce((s,r) => s+r.amount, 0);

  document.getElementById('extrato-total-gastos').textContent = fmtBRL(totalG);
  document.getElementById('extrato-count-gastos').textContent = `${gastos.length} itens`;
  document.getElementById('extrato-total-receitas').textContent = fmtBRL(totalR);
  document.getElementById('extrato-count-receitas').textContent = `${receitas.length} itens`;
  document.getElementById('extrato-preview').style.display = 'block';
  document.getElementById('btn-import-extrato').disabled = (gastos.length + receitas.length) === 0;

  switchExtratoTab('gastos');
}

function switchExtratoTab(tab) {
  extratoTabAtiva = tab;
  document.getElementById('etab-gastos').classList.toggle('active', tab==='gastos');
  document.getElementById('etab-receitas').classList.toggle('active', tab==='receitas');
  const items = extratoParsed[tab];
  const tbody = document.getElementById('extrato-preview-list');
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px;">Nenhum item detectado</td></tr>`;
    return;
  }
  tbody.innerHTML = items.slice(0, 10).map((item, idx) => `
    <tr>
      <td>${item.date}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.title}</td>
      <td><span class="badge badge-categoria">${item.categoria}</span></td>
      <td style="text-align:right;color:${tab==='gastos'?'var(--red)':'var(--green)'};font-weight:600;">${fmtBRL(item.amount)}</td>
      <td><button onclick="removeExtratoItem('${tab}',${idx})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;">✕</button></td>
    </tr>`).join('');
  if (items.length > 10) {
    tbody.innerHTML += `<tr><td colspan="5" style="text-align:center;color:var(--muted);font-size:12px;">+ ${items.length-10} itens</td></tr>`;
  }
}

function removeExtratoItem(tab, idx) {
  extratoParsed[tab].splice(idx, 1);
  renderExtratoPrev();
}

async function importExtrato() {
  const mesRef = document.getElementById('extrato-mes').value;
  const { gastos, receitas } = extratoParsed;
  const btn = document.getElementById('btn-import-extrato');
  btn.innerHTML = '<span class="spinner"></span> Salvando...';
  btn.disabled = true;

  let ok = 0, erros = 0;

  if (gastos.length) {
    const rows = gastos.map(g => ({
      user_id: currentUser.id,
      descricao: g.title,
      categoria: g.categoria,
      valor: g.amount,
      data: g.date,
      mes_referencia: mesRef
    }));
    const { error } = await client.from('gastos').insert(rows);
    if (error) { erros++; console.error(error); } else ok += rows.length;
  }

  if (receitas.length) {
    const rows = receitas.map(r => ({
      user_id: currentUser.id,
      descricao: r.title,
      valor: r.amount,
      data: r.date,
      mes_referencia: mesRef
    }));
    const { error } = await client.from('receitas').insert(rows);
    if (error) { erros++; console.error(error); } else ok += rows.length;
  }

  btn.innerHTML = 'Salvar extrato';
  btn.disabled = false;

  if (erros) return showToast('Erro ao salvar alguns itens', 'error');
  showToast(`✅ ${ok} itens importados!`);
  closeModal('modal-extrato');
  await Promise.all([loadGastos(), loadReceitas()]);
  renderGastos();
}

// =============================================
// PLANEJAMENTO DE PAGAMENTO
// =============================================
const PLANNER_KEY = 'financeai_planner';

function loadPlannerConfig() {
  try { return JSON.parse(localStorage.getItem(PLANNER_KEY)) || {}; } catch { return {}; }
}
function savePlannerConfig(cfg) {
  localStorage.setItem(PLANNER_KEY, JSON.stringify(cfg));
}

function renderPlanejamento() {
    const cfg = loadPlannerConfig();

    const faturasMes = getFaturasDoMes(currentMes);
    const gastosMes = allGastos.filter(
        g => getMesRefFromGasto(g) === currentMes
    );
    const receitasMes = allReceitas.filter(
        r => getMesRefFromReceita(r) === currentMes
    );

    const totalFatura = faturasMes.reduce(
        (s, f) => s + Number(f.valor),
        0
    );

    const totalGastosManuais = gastosMes.reduce(
        (s, g) => s + Number(g.valor),
        0
    );

    const totalDespesas = totalFatura + totalGastosManuais;

    const totalReceitas = receitasMes.reduce(
        (s, r) => s + Number(r.valor),
        0
    );

    const salario = cfg.salario || totalReceitas || 0;
    const diaSalario = cfg.diaSalario || 5;
    const adiantamento = cfg.adiantamento || 0;
    const diaAdiant = cfg.diaAdiant || 20;
    const usaAdiant = cfg.usaAdiant !== false;

    const cartoesComVenc = allCartoes.map(c => ({
        ...c,
        totalMes: faturasMes
            .filter(f => f.cartao_id === c.id)
            .reduce((s, f) => s + Number(f.valor), 0)
    })).filter(c => c.totalMes > 0);

    let periodos = [];

    if (usaAdiant && adiantamento > 0) {
        const comAdiant = cartoesComVenc.filter(c => {
            const venc = c.vencimento;
            return venc >= diaAdiant || venc <= diaSalario;
        });

        const comSalario = cartoesComVenc.filter(c => !comAdiant.includes(c));

        const totalAdiant = comAdiant.reduce((s, c) => s + c.totalMes, 0);
        const totalSalario = comSalario.reduce((s, c) => s + c.totalMes, 0);

        /*
            Por padrão, jogo os gastos manuais no salário,
            porque normalmente eles são despesas do mês corrente.
        */
        const totalSalarioComGastos = totalSalario + totalGastosManuais;

        periodos = [
            {
                label: `Adiantamento (dia ${diaAdiant})`,
                valor: adiantamento,
                gasto: totalAdiant,
                sobra: adiantamento - totalAdiant,
                cartoes: comAdiant,
                gastosManuais: [],
                cor: '#5B6EF5',
                icone: '💳'
            },
            {
                label: `Salário (dia ${diaSalario})`,
                valor: salario - adiantamento,
                gasto: totalSalarioComGastos,
                sobra: (salario - adiantamento) - totalSalarioComGastos,
                cartoes: comSalario,
                gastosManuais: gastosMes,
                cor: '#10D98A',
                icone: '💵'
            }
        ];
    } else {
        periodos = [{
            label: `Salário (dia ${diaSalario})`,
            valor: salario,
            gasto: totalDespesas,
            sobra: salario - totalDespesas,
            cartoes: cartoesComVenc,
            gastosManuais: gastosMes,
            cor: '#10D98A',
            icone: '💵'
        }];
    }

    const container = document.getElementById('page-planejamento');

    container.innerHTML = `
        <div class="card" style="margin-bottom:20px;">
            <div class="section-header" style="margin-bottom:16px;">
                <h3>⚙️ Configurar salário e pagamentos</h3>
                <span style="font-size:12px;color:var(--muted);">
                    Salvo só no seu navegador — opcional
                </span>
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;">
                <div class="form-group" style="margin:0">
                    <label class="form-label">Salário bruto (R$)</label>
                    <input
                        type="number"
                        id="pl-salario"
                        class="form-input"
                        value="${salario || ''}"
                        placeholder="Ex: 5000"
                    >
                </div>

                <div class="form-group" style="margin:0">
                    <label class="form-label">Dia do salário</label>
                    <input
                        type="number"
                        id="pl-dia-salario"
                        class="form-input"
                        value="${diaSalario}"
                        min="1"
                        max="31"
                    >
                </div>

                <div class="form-group" style="margin:0">
                    <label class="form-label">Tem adiantamento?</label>
                    <select
                        id="pl-usa-adiant"
                        class="form-input"
                        onchange="toggleAdiantFields()"
                    >
                        <option value="sim" ${usaAdiant ? 'selected' : ''}>Sim</option>
                        <option value="nao" ${!usaAdiant ? 'selected' : ''}>Não</option>
                    </select>
                </div>

                <div class="form-group" style="margin:0" id="pl-adiant-group">
                    <label class="form-label">Valor adiantamento (R$)</label>
                    <input
                        type="number"
                        id="pl-adiantamento"
                        class="form-input"
                        value="${adiantamento || ''}"
                        placeholder="Ex: 2000"
                    >
                </div>

                <div class="form-group" style="margin:0" id="pl-dia-adiant-group">
                    <label class="form-label">Dia do adiantamento</label>
                    <input
                        type="number"
                        id="pl-dia-adiant"
                        class="form-input"
                        value="${diaAdiant}"
                        min="1"
                        max="31"
                    >
                </div>
            </div>

            <button
                class="btn btn-primary"
                style="margin-top:16px;"
                onclick="salvarPlanejamento()"
            >
                💾 Calcular divisão
            </button>
        </div>

        ${
            salario === 0
                ? `
                    <div class="empty-state" style="padding:40px">
                        <span class="empty-icon">📊</span>
                        <p>Preencha seu salário acima para ver a divisão de pagamentos</p>
                    </div>
                `
                : `
                    <div class="grid-4" style="margin-bottom:20px;">
                        <div class="card">
                            <div class="card-title">💵 Renda do mês</div>
                            <div class="card-value green">${fmtBRL(salario)}</div>
                        </div>

                        <div class="card">
                            <div class="card-title">🧾 Total faturas</div>
                            <div class="card-value red">${fmtBRL(totalFatura)}</div>
                        </div>

                        <div class="card">
                            <div class="card-title">🛍️ Gastos manuais</div>
                            <div class="card-value red">${fmtBRL(totalGastosManuais)}</div>
                        </div>

                        <div class="card">
                            <div class="card-title">✅ Sobra real</div>
                            <div class="card-value ${salario - totalDespesas >= 0 ? 'green' : 'red'}">
                                ${fmtBRL(salario - totalDespesas)}
                            </div>
                        </div>
                    </div>

                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin-bottom:20px;">
                        ${periodos.map(p => `
                            <div class="card" style="border-color:${p.cor}33;">
                                <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
                                    <div style="width:36px;height:36px;border-radius:10px;background:${p.cor}22;display:flex;align-items:center;justify-content:center;font-size:18px;">
                                        ${p.icone}
                                    </div>

                                    <div>
                                        <div style="font-weight:700;font-size:15px;">
                                            ${p.label}
                                        </div>
                                        <div style="font-size:12px;color:var(--muted);">
                                            Disponível: ${fmtBRL(p.valor)}
                                        </div>
                                    </div>
                                </div>

                                ${
                                    p.cartoes.length
                                        ? `
                                            <div style="font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;margin-bottom:8px;">
                                                Cartões
                                            </div>

                                            <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">
                                                ${p.cartoes.map(c => `
                                                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--surface2);border-radius:8px;">
                                                        <div style="display:flex;align-items:center;gap:8px;">
                                                            <span style="width:8px;height:8px;border-radius:50%;background:${c.cor};flex-shrink:0"></span>
                                                            <span style="font-size:13px;">${c.nome}</span>
                                                            <span style="font-size:11px;color:var(--muted);">
                                                                vence dia ${c.vencimento}
                                                            </span>
                                                        </div>

                                                        <span style="font-weight:600;color:var(--red);font-size:13px;">
                                                            ${fmtBRL(c.totalMes)}
                                                        </span>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        `
                                        : `
                                            <div style="color:var(--muted);font-size:13px;text-align:center;padding:12px;">
                                                Nenhuma fatura neste período
                                            </div>
                                        `
                                }

                                ${
                                    p.gastosManuais && p.gastosManuais.length
                                        ? `
                                            <div style="font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;margin:14px 0 8px;">
                                                Gastos manuais
                                            </div>

                                            <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">
                                                ${p.gastosManuais.slice(0, 8).map(g => `
                                                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--surface2);border-radius:8px;">
                                                        <div style="display:flex;flex-direction:column;">
                                                            <span style="font-size:13px;">${g.descricao}</span>
                                                            <span style="font-size:11px;color:var(--muted);">
                                                                ${g.categoria || 'Outros'} · ${fmtDate(g.data)}
                                                            </span>
                                                        </div>

                                                        <span style="font-weight:600;color:var(--red);font-size:13px;">
                                                            ${fmtBRL(g.valor)}
                                                        </span>
                                                    </div>
                                                `).join('')}

                                                ${
                                                    p.gastosManuais.length > 8
                                                        ? `
                                                            <div style="font-size:12px;color:var(--muted);text-align:center;padding:6px;">
                                                                + ${p.gastosManuais.length - 8} gastos manuais
                                                            </div>
                                                        `
                                                        : ''
                                                }
                                            </div>
                                        `
                                        : ''
                                }

                                <div style="border-top:1px solid var(--border);padding-top:12px;display:flex;justify-content:space-between;align-items:center;">
                                    <span style="font-size:13px;color:var(--muted);">
                                        Total de despesas
                                    </span>

                                    <span style="font-weight:700;color:var(--red);">
                                        ${fmtBRL(p.gasto)}
                                    </span>
                                </div>

                                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
                                    <span style="font-size:13px;color:var(--muted);">
                                        Sobra para outros gastos
                                    </span>

                                    <span style="font-weight:700;font-size:16px;color:${p.sobra >= 0 ? 'var(--green)' : 'var(--red)'};">
                                        ${fmtBRL(p.sobra)}
                                    </span>
                                </div>

                                ${
                                    p.valor > 0
                                        ? `
                                            <div class="progress-bar" style="margin-top:10px;">
                                                <div
                                                    class="progress-fill"
                                                    style="width:${Math.min(p.gasto / p.valor * 100, 100).toFixed(0)}%;background:${p.sobra >= 0 ? 'linear-gradient(90deg,var(--accent),var(--accent2))' : 'linear-gradient(90deg,var(--red),#FF6B8A)'}"
                                                ></div>
                                            </div>

                                            <div style="font-size:11px;color:var(--muted);margin-top:4px;">
                                                ${(p.gasto / p.valor * 100).toFixed(0)}% da renda comprometido
                                            </div>
                                        `
                                        : ''
                                }
                            </div>
                        `).join('')}
                    </div>

                    ${gerarDica(periodos, salario, totalDespesas)}
                `
        }
    `;

    toggleAdiantFields();
}

function gerarDica(periodos, salario, totalDespesas) {
  const pct = salario > 0 ? (totalDespesas / salario * 100) : 0;
  let dica = '', cor = '';

  if (pct === 0) return '';
  if (pct < 30) { dica = `Você está comprometendo apenas ${pct.toFixed(0)}% da renda com faturas. Ótimo controle! 🎉`; cor = 'var(--green)'; }
  else if (pct < 50) { dica = `${pct.toFixed(0)}% da renda vai para faturas. Está dentro do limite saudável, mas fique de olho.`; cor = 'var(--yellow)'; }
  else if (pct < 80) { dica = `⚠️ ${pct.toFixed(0)}% da renda comprometida com faturas. Considere reduzir parcelamentos.`; cor = 'var(--yellow)'; }
  else { dica = `🚨 ${pct.toFixed(0)}% da renda vai para faturas! Situação crítica — revise seus gastos urgentemente.`; cor = 'var(--red)'; }

  // Período mais crítico
  const mais = periodos.sort((a,b) => (b.gasto/b.valor)-(a.gasto/a.valor))[0];
  const dicaExtra = mais && mais.valor > 0 && (mais.gasto/mais.valor) > 0.7
    ? `<br><span style="font-size:12px;color:var(--muted);">O ${mais.label} está com ${(mais.gasto/mais.valor*100).toFixed(0)}% comprometido.</span>` : '';

  return `<div style="padding:16px 20px;border-radius:var(--radius);border:1px solid ${cor}44;background:${cor}11;margin-bottom:20px;">
    <span style="color:${cor};font-weight:600;">${dica}</span>${dicaExtra}
  </div>`;
}

function toggleAdiantFields() {
  const usa = document.getElementById('pl-usa-adiant').value === 'sim';
  document.getElementById('pl-adiant-group').style.display = usa ? '' : 'none';
  document.getElementById('pl-dia-adiant-group').style.display = usa ? '' : 'none';
}

function salvarPlanejamento() {
  const cfg = {
    salario:      parseFloat(document.getElementById('pl-salario').value) || 0,
    diaSalario:   parseInt(document.getElementById('pl-dia-salario').value) || 5,
    usaAdiant:    document.getElementById('pl-usa-adiant').value === 'sim',
    adiantamento: parseFloat(document.getElementById('pl-adiantamento')?.value) || 0,
    diaAdiant:    parseInt(document.getElementById('pl-dia-adiant')?.value) || 20,
  };
  savePlannerConfig(cfg);
  showToast('Planejamento salvo!');
  renderPlanejamento();
}

// =============================================
// START
// =============================================
init();
