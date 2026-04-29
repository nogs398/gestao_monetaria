async function analisarFinancas(){

    const saldo = document.getElementById("saldo").innerText;

    const resposta = document.getElementById("iaResposta");

    const valor = parseFloat(
        saldo.replace("R$","")
    );

    if(valor < 0){

        resposta.className = "alert danger";

        resposta.innerHTML = `
            Seu orçamento está negativo.
            Evite novas compras.
        `;

        return;
    }

    if(valor < 1000){

        resposta.className = "alert";

        resposta.innerHTML = `
            Você ainda possui saldo,
            mas deve evitar parcelamentos.
        `;

        return;
    }

    resposta.className = "alert success";

    resposta.innerHTML = `
        Sua situação financeira está saudável.
        Você pode realizar compras com cautela.
    `;
}
