let user;

async function init(){

    const response = await client.auth.getUser();

    user = response.data.user;

    if(!user){
        window.location.href = "login.html";
        return;
    }

    carregarDashboard();
}

async function logout(){
    await client.auth.signOut();
    window.location.href = "login.html";
}

async function addReceita(){

    const tipo = document.getElementById("tipoReceita").value;
    const valor = document.getElementById("valorReceita").value;

    await client.from("receitas").insert({
        user_id:user.id,
        tipo,
        valor
    });

    carregarDashboard();
}

async function addGasto(){

    const descricao = document.getElementById("descricao").value;
    const categoria = document.getElementById("categoria").value;
    const valor = document.getElementById("valorGasto").value;
    const data = document.getElementById("dataGasto").value;

    await client.from("gastos").insert({
        user_id:user.id,
        descricao,
        categoria,
        valor,
        data
    });

    carregarDashboard();
}

async function addFatura(){

    const nome = document.getElementById("fatNome").value;
    const valor = document.getElementById("fatValor").value;
    const vencimento = document.getElementById("fatVenc").value;
    const fechamento = document.getElementById("fatFech").value;

    await client.from("faturas").insert({
        user_id:user.id,
        nome,
        valor,
        vencimento,
        fechamento,
        tipo:"cartao"
    });

    carregarDashboard();
}

async function carregarDashboard(){

    const receitas = await client
    .from("receitas")
    .select("*")
    .eq("user_id", user.id);

    const gastos = await client
    .from("gastos")
    .select("*")
    .eq("user_id", user.id);

    const faturas = await client
    .from("faturas")
    .select("*")
    .eq("user_id", user.id)
    .eq("pago", false);

    let totalReceitas = 0;
    let totalGastos = 0;
    let totalFaturas = 0;

    receitas.data.forEach(r => {
        totalReceitas += Number(r.valor);
    });

    gastos.data.forEach(g => {
        totalGastos += Number(g.valor);
    });

    faturas.data.forEach(f => {
        totalFaturas += Number(f.valor);
    });

    const saldo = totalReceitas - totalGastos - totalFaturas;

    document.getElementById("saldo").innerHTML = `R$ ${saldo.toFixed(2)}`;

    document.getElementById("gastosTotal").innerHTML = `R$ ${totalGastos.toFixed(2)}`;

    document.getElementById("faturasTotal").innerHTML = `R$ ${totalFaturas.toFixed(2)}`;

    criarGrafico(gastos.data);
}

function criarGrafico(gastos){

    const categorias = {};

    gastos.forEach(g => {

        if(!categorias[g.categoria]){
            categorias[g.categoria] = 0;
        }

        categorias[g.categoria] += Number(g.valor);
    });

    const ctx = document.getElementById('grafico');

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categorias),
            datasets: [{
                data: Object.values(categorias)
            }]
        }
    });
}

init();
