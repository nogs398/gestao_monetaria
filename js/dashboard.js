// Variáveis globais
let user;
let chartCat, chartMensal;

// ===== INICIALIZAÇÃO =====
async function init() {
  const { data } = await client.auth.getUser();
  user = data?.user;
  if (!user) { window.location.href = 'login.html'; return; }
  
  loadUserInfo();
  initMonthSelector();
  initColorSwatches();
  loadDashboard();
}

// ===== LOGOUT =====
async function logout() {
  await client.auth.signOut();
  window.location.href = 'login.html';
}

// ===== ADD RECEITA (chamado do botão no HTML) =====
async function addReceita() {
  const valor = prompt('Valor da receita:');
  if (!valor) return;
  const tipo = prompt('Tipo (salário, pix, outros):') || 'outros';
  await client.from('receitas').insert({ user_id: user.id, tipo, valor: parseFloat(valor), mes: currentMonth });
  showToast('Receita adicionada', 'success');
  loadDashboard();
}

// ===== ADD GASTO =====
async function addGasto() {
  const desc = prompt('Descrição:');
  if (!desc) return;
  const valor = prompt('Valor:');
  if (!valor) return;
  await client.from('gastos').insert({ user_id: user.id, descricao: desc, valor: parseFloat(valor), categoria: 'Outros', mes: currentMonth });
  showToast('Gasto adicionado', 'success');
  loadDashboard();
}

// ===== DASHBOARD =====
async function loadDashboard() {
  try {
    const receitasRes = await client.from('receitas').select('*').eq('user_id', user.id).eq('mes', currentMonth);
    const gastosRes = await client.from('gastos').select('*').eq('user_id', user.id).eq('mes', currentMonth);
    
    // Faturas pode não existir ainda
    let faturasRes = { data: [] };
    try {
      faturasRes = await client.from('faturas').select('*').eq('user_id', user.id).eq('pago', false);
    } catch(e) {}
    
    const receitas = receitasRes.data || [];
    const gastos = gastosRes.data || [];
    const faturas = faturasRes.data || [];
    
    const totalReceitas = receitas.reduce((s, r) => s + Number(r.valor || 0), 0);
    const totalGastos = gastos.reduce((s, g) => s + Number(g.valor || 0), 0);
    const totalFaturas = faturas.reduce((s, f) => s + Number(f.valor || 0), 0);
    const saldo = totalReceitas - totalGastos;
    
    const kpiSaldo = document.getElementById('kpi-saldo');
    if (kpiSaldo) kpiSaldo.textContent = 'R$ ' + saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    
    const kpiReceitas = document.getElementById('kpi-receitas');
    if (kpiReceitas) kpiReceitas.textContent = 'R$ ' + totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    
    const kpiFaturas = document.getElementById('kpi-faturas');
    if (kpiFaturas) kpiFaturas.textContent = 'R$ ' + totalFaturas.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    
    const kpiGastos = document.getElementById('kpi-gastos');
    if (kpiGastos) kpiGastos.textContent = 'R$ ' + totalGastos.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    
    // Gráfico categorias
    const cats = {};
    gastos.forEach(g => {
      const cat = g.categoria || 'Outros';
      cats[cat] = (cats[cat] || 0) + Number(g.valor || 0);
    });
    
    const chartCatEl = document.getElementById('chart-cat');
    if (chartCatEl && Object.keys(cats).length) {
      if (chartCat) chartCat.destroy();
      chartCat = new Chart(chartCatEl, {
        type: 'doughnut',
        data: { labels: Object.keys(cats), datasets: [{ data: Object.values(cats), backgroundColor: ['#5B6EF5','#8B5CF6','#10D98A','#F0456A','#F5A623','#3B82F6','#EC4899','#14B8A6'] }] }
      });
    }
    
    // Gráfico mensal
    const chartMensalEl = document.getElementById('chart-mensal');
    if (chartMensalEl) {
      const meses = [];
      const receitasMes = [];
      const gastosMes = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        const mes = d.toISOString().slice(0, 7);
        meses.push(d.toLocaleDateString('pt-BR', { month: 'short' }));
        receitasMes.push(0);
        gastosMes.push(0);
      }
      
      if (chartMensal) chartMensal.destroy();
      chartMensal = new Chart(chartMensalEl, {
        type: 'bar',
        data: {
          labels: meses,
          datasets: [
            { label: 'Receitas', data: receitasMes, backgroundColor: '#10D98A' },
            { label: 'Gastos', data: gastosMes, backgroundColor: '#F0456A' }
          ]
        },
        options: { responsive: true, scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' } }, y: { grid: { color: 'rgba(255,255,255,0.05)' } } } }
      });
    }
    
    // Top gastos
    const topGastosList = document.getElementById('top-gastos-list');
    if (topGastosList) {
      const topGastos = [...gastos].sort((a, b) => Number(b.valor || 0) - Number(a.valor || 0)).slice(0, 5);
      topGastosList.innerHTML = topGastos.length ? topGastos.map(g => 
        '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">' +
          '<span>' + (g.descricao || g.titulo || 'Sem descrição') + '</span>' +
          '<span style="color:var(--red);">R$ ' + Number(g.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</span></div>'
      ).join('') : '<div style="color:var(--muted);padding:16px;text-align:center;">Nenhum gasto registrado</div>';
    }
  } catch(e) { console.error('loadDashboard error:', e); }
}

// ===== FATURAS =====
async function loadFaturas() {
  try {
    const faturasRes = await client.from('faturas').select('*').eq('user_id', user.id);
    const faturas = faturasRes.data || [];
    
    // Cartões pode não existir
    let cartoesRes = { data: [] };
    try {
      cartoesRes = await client.from('cartoes').select('*').eq('user_id', user.id);
    } catch(e) {}
    const cartoes = cartoesRes.data || [];
    
    const faturasList = document.getElementById('faturas-list');
    if (faturasList) {
      faturasList.innerHTML = faturas.length ? faturas.map(f => {
        const cartao = cartoes.find(c => c.id === f.cartao_id);
        return '<div style="padding:16px;background:var(--surface2);border-radius:12px;border-left:4px solid ' + (cartao?.cor || '#5B6EF5') + ';margin-bottom:12px;">' +
          '<div style="font-weight:600;">' + (f.nome || f.descricao || 'Fatura') + '</div>' +
          '<div style="font-size:12px;color:var(--muted);margin-top:4px;">Vencimento: ' + (f.vencimento || f.venc || '-') + '</div>' +
          '<div style="font-size:18px;font-weight:700;margin-top:8px;color:var(--red);">R$ ' + Number(f.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</div>' +
          '<button style="margin-top:8px;padding:6px 12px;background:var(--surface);border:none;border-radius:6px;color:var(--text);cursor:pointer;" onclick="toggleFaturaPago(\'' + f.id + '\',' + (f.pago || false) + ')">' + (f.pago ? 'Marcar pendente' : 'Marcar pago') + '</button>' +
        '</div>';
      }).join('') : '<div style="color:var(--muted);padding:32px;text-align:center;">Nenhuma fatura registrada</div>';
    }
    
    const cartoesList = document.getElementById('cartoes-list');
    if (cartoesList) {
      cartoesList.innerHTML = cartoes.length ? cartoes.map(c => 
        '<div style="padding:16px;background:var(--surface2);border-radius:12px;border-top:4px solid ' + c.cor + ';margin-bottom:12px;">' +
          '<div style="font-weight:600;">' + (c.nome || 'Cartão') + '</div>' +
          '<div style="font-size:12px;color:var(--muted);">' + (c.bandeira || 'Visa') + '</div>' +
          '<div style="margin-top:8px;">Limite: R$ ' + Number(c.limite || 0).toLocaleString('pt-BR') + '</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:4px;">Venc: ' + (c.vencimento || '-') + ' | Fech: ' + (c.fechamento || '-') + '</div>' +
          '<div style="display:flex;gap:8px;margin-top:12px;">' +
            '<button style="padding:6px 12px;background:var(--accent);border:none;border-radius:6px;color:white;cursor:pointer;" onclick="openCartaoModal(' + JSON.stringify(c).replace(/"/g, '\\"') + ')">Editar</button>' +
            '<button style="padding:6px 12px;background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--muted);cursor:pointer;" onclick="deleteCartao(\'' + c.id + '\')">Excluir</button>' +
          '</div>' +
        '</div>'
      ).join('') : '<div style="color:var(--muted);padding:32px;text-align:center;">Nenhum cartão cadastrado</div>';
    }
  } catch(e) { console.error('loadFaturas error:', e); }
}

async function toggleFaturaPago(id, pago) {
  try {
    await client.from('faturas').update({ pago: !pago }).eq('id', id);
    loadFaturas();
  } catch(e) { console.error(e); }
}

async function deleteCartao(id) {
  try {
    await client.from('cartoes').delete().eq('id', id);
    showToast('Cartão removido', 'success');
    loadFaturas();
  } catch(e) { console.error(e); }
}

// ===== PARCELAS =====
async function loadParcelas() {
  try {
    const gastosRes = await client.from('gastos').select('*').eq('user_id', user.id);
    const gastos = gastosRes.data || [];
    
    // Filtrar apenas gastos com parcelas no título
    const parcelas = gastos.filter(g => {
      const desc = (g.descricao || g.titulo || '').toLowerCase();
      return desc.includes('/') && (desc.includes('parcela') || desc.match(/\d+\/\d+/));
    });
    
    const parcelasList = document.getElementById('parcelas-list');
    if (parcelasList) {
      parcelasList.innerHTML = parcelas.length ? parcelas.map(g => 
        '<div style="display:flex;justify-content:space-between;padding:12px;background:var(--surface2);border-radius:8px;margin-bottom:8px;">' +
          '<div><strong>' + (g.descricao || g.titulo) + '</strong><br><small style="color:var(--muted);">' + (g.data || '') + '</small></div>' +
          '<div style="color:var(--red);font-weight:600;">R$ ' + Number(g.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</div>' +
        '</div>'
      ).join('') : '<div style="color:var(--muted);padding:32px;text-align:center;">Nenhuma parcela futura registrada</div>';
    }
  } catch(e) { console.error('loadParcelas error:', e); }
}

// ===== CARTÕES =====
async function loadCartoes() {
  try {
    const cartoesRes = await client.from('cartoes').select('*').eq('user_id', user.id);
    const cartoes = cartoesRes.data || [];
    
    const cartoesPageList = document.getElementById('cartoes-page-list');
    if (cartoesPageList) {
      cartoesPageList.innerHTML = cartoes.length ? cartoes.map(c => 
        '<div style="padding:20px;background:var(--surface2);border-radius:12px;border-left:6px solid ' + c.cor + ';margin-bottom:16px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<strong style="font-size:18px;">' + (c.nome || 'Cartão') + '</strong>' +
            '<span style="padding:4px 8px;background:var(--surface);border-radius:4px;font-size:12px;">' + (c.bandeira || 'Visa') + '</span>' +
          '</div>' +
          '<div style="font-size:13px;color:var(--muted);margin-top:8px;">Vencimento: ' + (c.vencimento || '-') + ' | Fechamento: ' + (c.fechamento || '-') + '</div>' +
          '<div style="margin-top:12px;font-size:16px;color:var(--green);">Limite: R$ ' + Number(c.limite || 0).toLocaleString('pt-BR') + '</div>' +
          '<button style="margin-top:12px;padding:8px 16px;background:var(--accent);border:none;border-radius:6px;color:white;cursor:pointer;" onclick="openCartaoModal(' + JSON.stringify(c).replace(/"/g, '\\"') + ')">Editar</button>' +
        '</div>'
      ).join('') : '<div style="color:var(--muted);padding:32px;text-align:center;">Nenhum cartão cadastrado. Use o botão acima para adicionar.</div>';
    }
  } catch(e) { console.error('loadCartoes error:', e); }
}

// ===== RECEITAS =====
async function loadReceitas() {
  try {
    const receitasRes = await client.from('receitas').select('*').eq('user_id', user.id);
    const receitas = receitasRes.data || [];
    
    const receitasList = document.getElementById('receitas-list');
    if (receitasList) {
      receitasList.innerHTML = receitas.length ? receitas.map(r => 
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--surface2);border-radius:8px;margin-bottom:8px;">' +
          '<div><strong>' + (r.tipo || 'Receita') + '</strong><br><small style="color:var(--muted);">' + (r.mes || currentMonth) + '</small></div>' +
          '<div style="color:var(--green);font-weight:600;font-size:18px;">R$ ' + Number(r.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</div>' +
          '<button style="padding:4px 8px;background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--muted);cursor:pointer;" onclick="deleteItem(\'' + r.id + '\',\'receitas\')">×</button>' +
        '</div>'
      ).join('') : '<div style="color:var(--muted);padding:32px;text-align:center;">Nenhuma receita registrada</div>';
    }
    
    const total = receitas.reduce((s, r) => s + Number(r.valor || 0), 0);
    const kpiEl = document.getElementById('kpi-receitas-total');
    if (kpiEl) kpiEl.textContent = 'R$ ' + total.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  } catch(e) { console.error('loadReceitas error:', e); }
}

// ===== GASTOS =====
async function loadGastos() {
  try {
    const gastosRes = await client.from('gastos').select('*').eq('user_id', user.id).eq('mes', currentMonth);
    const gastos = gastosRes.data || [];
    const sorted = [...gastos].sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0));
    
    const gastosList = document.getElementById('gastos-list');
    if (gastosList) {
      gastosList.innerHTML = sorted.length ? sorted.map(g => 
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--surface2);border-radius:8px;margin-bottom:8px;">' +
          '<div><strong>' + (g.descricao || g.titulo || 'Sem descrição') + '</strong><br><small style="color:var(--muted);">' + (g.categoria || 'Outros') + ' • ' + (g.data || '') + '</small></div>' +
          '<div style="color:var(--red);font-weight:600;">-R$ ' + Number(g.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</div>' +
          '<div style="display:flex;gap:4px;">' +
            '<button style="padding:4px 8px;background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--muted);cursor:pointer;" onclick="openCategoriaModal(' + JSON.stringify(g).replace(/"/g, '\\"') + ')">Cat</button>' +
            '<button style="padding:4px 8px;background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--muted);cursor:pointer;" onclick="deleteItem(\'' + g.id + '\',\'gastos\')">×</button>' +
          '</div>' +
        '</div>'
      ).join('') : '<div style="color:var(--muted);padding:32px;text-align:center;">Nenhum gasto registrado</div>';
    }
    
    const total = gastos.reduce((s, g) => s + Number(g.valor || 0), 0);
    const kpiEl = document.getElementById('kpi-gastos-total');
    if (kpiEl) kpiEl.textContent = 'R$ ' + total.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  } catch(e) { console.error('loadGastos error:', e); }
}

// Delete genérico
async function deleteItem(id, tipo) {
  try {
    await client.from(tipo).delete().eq('id', id);
    showToast('Item removido', 'success');
    if (tipo === 'receitas') loadReceitas();
    else if (tipo === 'gastos') loadGastos();
  } catch(e) { console.error(e); }
}

// Inicializa
init();
