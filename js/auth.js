async function register(){

    const email = document.getElementById("email").value;
    const senha = document.getElementById("senha").value;

    const { error } = await client.auth.signUp({
        email,
        password: senha
    });

    if(error){
        alert(error.message);
        return;
    }

    alert("Conta criada");
}

async function login(){

    const email = document.getElementById("email").value;
    const senha = document.getElementById("senha").value;

    const { error } = await client.auth.signInWithPassword({
        email,
        password: senha
    });

    if(error){
        alert(error.message);
        return;
    }

    window.location.href = "dashboard.html";
}
