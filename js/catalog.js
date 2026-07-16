async function carregarJogos() {
    try {
        const resposta = await fetch("data/games.json");

        if (!resposta.ok) {
            throw new Error("Não foi possível carregar games.json");
        }

        const jogos = await resposta.json();

        console.log("Jogos carregados:", jogos);

        // Nas próximas etapas vamos criar os cards aqui.

    } catch (erro) {
        console.error(erro);
    }
}

carregarJogos();