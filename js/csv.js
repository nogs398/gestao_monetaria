async function importCSV(){

    const file = document.getElementById("csvFile").files[0];

    if(!file){
        alert("Selecione um CSV");
        return;
    }

    const text = await file.text();

    const linhas = text.split("\n");

    for(let i=1;i<linhas.length;i++){

        const cols = linhas[i].split(",");

        if(cols.length < 3) continue;

        const descricao = cols[1];
        const valor = Math.abs(parseFloat(cols[2]));
        const data = cols[0];

        await client.from("gastos").insert({
            user_id:user.id,
            descricao,
            valor,
            data,
            categoria:"Importado"
        });
    }

    alert("CSV importado");

    carregarDashboard();
}
