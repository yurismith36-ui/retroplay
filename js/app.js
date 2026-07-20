
const state={games:[],console:"Todos",query:"",featured:null,favorites:new Set(JSON.parse(localStorage.getItem("retroplay-v7-favorites")||"[]"))};
const $=id=>document.getElementById(id);
function saveFavorites(){localStorage.setItem("retroplay-v7-favorites",JSON.stringify([...state.favorites]));}
function toggleFavorite(id){state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);saveFavorites();renderCatalog();renderFavorites();renderHero();}
function card(game){
 const favorite=state.favorites.has(game.id);
 return `<article class="game-card" data-game="${game.id}" tabindex="0">
 <div class="cover"><img src="${game.capa}" alt="Capa de ${game.nome}" loading="lazy">
 <div class="cover-overlay"><a class="round-play" href="player.html?id=${encodeURIComponent(game.id)}" aria-label="Jogar ${game.nome}">▶</a>
 <button class="heart ${favorite?"active":""}" data-favorite="${game.id}" type="button">${favorite?"♥":"♡"}</button></div></div>
 <div class="card-content"><h3>${game.nome}</h3><div class="card-meta"><span>${game.console}</span><span>${game.ano||""}</span></div>
 <p>${game.descricao||""}</p><div class="card-actions"><a class="play" href="player.html?id=${encodeURIComponent(game.id)}">▶ Jogar</a>
 <button class="favorite-text" data-favorite="${game.id}" type="button">${favorite?"♥":"♡"}</button></div></div></article>`;
}
function bindCards(container){if(!container)return;container.querySelectorAll("[data-favorite]").forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();toggleFavorite(b.dataset.favorite);});container.querySelectorAll("[data-game]").forEach(el=>{const f=()=>{state.featured=el.dataset.game;renderHero();};el.onmouseenter=f;el.onfocusin=f;});}
function filtered(){const q=state.query.toLocaleLowerCase("pt-BR");return state.games.filter(g=>(state.console==="Todos"||g.console===state.console)&&`${g.nome} ${g.console} ${g.genero||""} ${g.descricao||""}`.toLocaleLowerCase("pt-BR").includes(q));}
function renderCatalog(){const list=filtered(),grid=$("gamesGrid");grid.innerHTML=list.map(card).join("");bindCards(grid);$("resultCount").textContent=`${list.length} jogo${list.length===1?"":"s"}`;$("emptyState").hidden=list.length>0;}
function renderFavorites(){const list=state.games.filter(g=>state.favorites.has(g.id)),grid=$("favoritesGrid");grid.innerHTML=list.map(card).join("");bindCards(grid);$("favoritesEmpty").hidden=list.length>0;}
function renderConsoles(){const consoles=["Todos",...new Set(state.games.map(g=>g.console))];$("consoleList").innerHTML=consoles.map(c=>`<button class="console ${c===state.console?"active":""}" data-console="${c}">${c}</button>`).join("");document.querySelectorAll("[data-console]").forEach(b=>b.onclick=()=>{state.console=b.dataset.console;renderConsoles();renderCatalog();});}
function featuredGame(){return state.games.find(g=>g.id===state.featured)||state.games.find(g=>g.destaque)||state.games[0];}
function renderHero(){const g=featuredGame();if(!g)return;$("hero").style.backgroundImage=`linear-gradient(90deg,rgba(5,9,15,.98),rgba(5,9,15,.72) 46%,rgba(5,9,15,.12) 82%),linear-gradient(0deg,#080c12,transparent 40%),url("${g.banner}")`;$("heroConsole").textContent=g.console;$("heroDescription").textContent=g.descricao||"";$("heroMeta").innerHTML=`<span>${g.ano||"Ano não informado"}</span><span>${g.genero||"Gênero não informado"}</span><span>${g.desenvolvedora||""}</span>`;$("heroTitle").innerHTML=g.logo?`<img src="${g.logo}" alt="${g.nome}">`:g.nome;$("heroPlay").onclick=()=>location.href=`player.html?id=${encodeURIComponent(g.id)}`;$("heroFavorite").textContent=state.favorites.has(g.id)?"♥ Favoritado":"♡ Favoritar";$("heroFavorite").onclick=()=>toggleFavorite(g.id);}
function renderAll(){renderConsoles();renderCatalog();renderFavorites();renderHero();}
$("searchInput").oninput=e=>{state.query=e.target.value;renderCatalog();};
fetch("./dados/games.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}).then(games=>{if(!Array.isArray(games))throw new Error("Catálogo inválido");state.games=games;renderAll();}).catch(error=>{console.error(error);$("gamesGrid").innerHTML=`<div class="empty">Erro ao carregar o catálogo. Confirme se existe <strong>dados/games.json</strong>.</div>`;});
