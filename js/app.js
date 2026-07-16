const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const searchInput = $("#searchInput");
const allGames = $("#allGames");
const featuredGames = $("#featuredGames");
const recentGames = $("#recentGames");
const favoriteGames = $("#favoriteGames");
const favoriteEmpty = $("#favoriteEmpty");
const searchEmpty = $("#searchEmpty");
const resultCount = $("#resultCount");

const heroBackground = $("#heroBackground");
const heroTitle = $("#heroTitle");
const heroText = $("#heroText");
const heroTag = $("#heroTag");
const heroDetails = $("#heroDetails");
const heroFavorite = $("#heroFavorite");
const heroDots = $("#heroDots");

const modal = $("#gameModal");
const modalArt = $("#modalArt");
const modalIcon = $("#modalIcon");
const modalConsole = $("#modalConsole");
const modalTitle = $("#modalTitle");
const modalDescription = $("#modalDescription");
const modalMetadata = $("#modalMetadata");
const modalPlay = $("#modalPlay");
const modalFavorite = $("#modalFavorite");

let selectedConsole = "Todos";
let heroIndex = 0;
let selectedGame = null;

const savedFavorites = JSON.parse(localStorage.getItem("retroplay-favorites") || "[]");
const favorites = new Set(savedFavorites);

function normalize(text){
  return text.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}

function saveFavorites(){
  localStorage.setItem("retroplay-favorites",JSON.stringify([...favorites]));
}

function isFavorite(id){
  return favorites.has(id);
}

function toggleFavorite(id){
  isFavorite(id) ? favorites.delete(id) : favorites.add(id);
  saveFavorites();
  renderAll();
  updateHero();
  if(selectedGame?.id===id) updateModalFavorite();
}

function card(game){
  return `
    <article class="game-card">
      <div class="game-cover" style="--start:${game.colors[0]};--end:${game.colors[1]}">
        <span class="console-badge">${game.console}</span>
        <button class="favorite-button ${isFavorite(game.id)?"active":""}" data-favorite="${game.id}">
          ${isFavorite(game.id)?"♥":"♡"}
        </button>
        <span class="game-icon">${game.icon}</span>
      </div>
      <div class="game-info">
        <h3>${game.title}</h3>
        <p>${game.description}</p>
        <button class="details-button" data-details="${game.id}">Ver detalhes</button>
      </div>
    </article>
  `;
}

function bind(container){
  container.querySelectorAll("[data-favorite]").forEach(button=>{
    button.onclick=()=>toggleFavorite(button.dataset.favorite);
  });

  container.querySelectorAll("[data-details]").forEach(button=>{
    button.onclick=()=>openGame(button.dataset.details);
  });
}

function renderInto(container,list){
  container.innerHTML=list.map(card).join("");
  bind(container);
}

function getFilteredGames(){
  const query=normalize(searchInput.value.trim());

  return games.filter(game=>{
    const matchesConsole=selectedConsole==="Todos"||game.console===selectedConsole;
    const text=normalize(`${game.title} ${game.console} ${game.description} ${game.genre}`);
    return matchesConsole&&text.includes(query);
  });
}

function renderCatalog(){
  const filtered=getFilteredGames();
  renderInto(allGames,filtered);
  resultCount.textContent=`${filtered.length} jogo${filtered.length===1?"":"s"}`;
  searchEmpty.hidden=filtered.length!==0;
}

function renderAll(){
  renderInto(featuredGames,games.filter(game=>game.featured));
  renderInto(recentGames,[...games].sort((a,b)=>b.added-a.added));
  const favoriteList=games.filter(game=>isFavorite(game.id));
  renderInto(favoriteGames,favoriteList);
  favoriteEmpty.hidden=favoriteList.length!==0;
  renderCatalog();
}

function updateHero(){
  const list=games.filter(game=>game.featured);
  const game=list[heroIndex%list.length];

  heroBackground.style.background=`linear-gradient(135deg,${game.colors[0]},${game.colors[1]})`;
  heroTitle.textContent=game.title;
  heroText.textContent=game.description;
  heroTag.textContent=`${game.console} • ${game.genre}`;
  heroFavorite.textContent=isFavorite(game.id)?"♥ Favoritado":"♡ Favoritar";
  heroDetails.onclick=()=>openGame(game.id);
  heroFavorite.onclick=()=>toggleFavorite(game.id);

  heroDots.innerHTML=list.map((_,index)=>
    `<button class="hero-dot ${index===heroIndex?"active":""}" data-index="${index}"></button>`
  ).join("");

  heroDots.querySelectorAll("[data-index]").forEach(button=>{
    button.onclick=()=>{
      heroIndex=Number(button.dataset.index);
      updateHero();
    };
  });
}

function openGame(id){
  const game=games.find(item=>item.id===id);
  if(!game)return;

  selectedGame=game;
  modalArt.style.background=`linear-gradient(145deg,${game.colors[0]},${game.colors[1]})`;
  modalIcon.textContent=game.icon;
  modalConsole.textContent=game.console;
  modalTitle.textContent=game.title;
  modalDescription.textContent=game.description;
  modalMetadata.innerHTML=`
    <span>Ano: ${game.year}</span>
    <span>Gênero: ${game.genre}</span>
    <span>Desenvolvedora: ${game.developer}</span>
  `;

  modalPlay.onclick=()=>{
    alert("Na próxima etapa este botão será conectado ao emulador e a um jogo permitido.");
  };

  modalFavorite.onclick=()=>toggleFavorite(game.id);
  updateModalFavorite();

  modal.hidden=false;
  document.body.classList.add("modal-open");
}

function updateModalFavorite(){
  if(!selectedGame)return;
  modalFavorite.textContent=isFavorite(selectedGame.id)?"♥ Favoritado":"♡ Favoritar";
}

function closeModal(){
  modal.hidden=true;
  selectedGame=null;
  document.body.classList.remove("modal-open");
}

$$("[data-close]").forEach(element=>element.onclick=closeModal);

document.addEventListener("keydown",event=>{
  if(event.key==="Escape"&&!modal.hidden)closeModal();
});

$$(".console").forEach(button=>{
  button.onclick=()=>{
    selectedConsole=button.dataset.console;
    $$(".console").forEach(item=>item.classList.remove("active"));
    button.classList.add("active");
    renderCatalog();
  };
});

searchInput.oninput=renderCatalog;

renderAll();
updateHero();

setInterval(()=>{
  const total=games.filter(game=>game.featured).length;
  heroIndex=(heroIndex+1)%total;
  updateHero();
},6000);
