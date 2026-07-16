const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const searchInput=$("#searchInput");
const gamesGrid=$("#gamesGrid");
const favoritesGrid=$("#favoritesGrid");
const favoritesEmpty=$("#favoritesEmpty");
const emptyState=$("#emptyState");
const resultCount=$("#resultCount");

const heroBg=$("#heroBg");
const heroArt=$("#heroArt");
const heroConsole=$("#heroConsole");
const heroTitle=$("#heroTitle");
const heroRating=$("#heroRating");
const heroDescription=$("#heroDescription");
const heroMeta=$("#heroMeta");
const heroDetails=$("#heroDetails");
const heroFavorite=$("#heroFavorite");
const heroDots=$("#heroDots");

const modal=$("#gameModal");
const modalArt=$("#modalArt");
const modalConsole=$("#modalConsole");
const modalTitle=$("#modalTitle");
const modalRating=$("#modalRating");
const modalDescription=$("#modalDescription");
const modalMeta=$("#modalMeta");
const modalAbout=$("#modalAbout");
const modalGallery=$("#modalGallery");
const relatedGames=$("#relatedGames");
const modalPlay=$("#modalPlay");
const modalFavorite=$("#modalFavorite");

let selectedConsole="Todos";
let heroIndex=0;
let selectedGame=null;
const favorites=new Set(JSON.parse(localStorage.getItem("retroplay-favorites")||"[]"));

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
  isFavorite(id)?favorites.delete(id):favorites.add(id);
  saveFavorites();
  renderAll();
  updateHero();
  if(selectedGame?.id===id) updateModalFavorite();
}

function card(game){
  return `
    <article class="game-card">
      <div class="game-cover" style="--start:${game.colors[0]};--end:${game.colors[1]}">
        <button class="favorite ${isFavorite(game.id)?"active":""}" data-favorite="${game.id}">
          ${isFavorite(game.id)?"♥":"♡"}
        </button>
        <span class="game-icon">${game.icon}</span>
      </div>
      <div class="game-info">
        <h3>${game.title}</h3>
        <p>${game.description}</p>
        <div class="card-meta">
          <span>${game.console}</span>
          <span>★ ${game.rating}</span>
        </div>
        <button class="details" data-details="${game.id}">Ver detalhes</button>
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

function getFiltered(){
  const query=normalize(searchInput.value.trim());

  return games.filter(game=>{
    const matchConsole=selectedConsole==="Todos"||game.console===selectedConsole;
    const haystack=normalize(`${game.title} ${game.console} ${game.genre} ${game.description}`);
    return matchConsole&&haystack.includes(query);
  });
}

function renderCatalog(){
  const filtered=getFiltered();
  renderInto(gamesGrid,filtered);
  resultCount.textContent=`${filtered.length} jogo${filtered.length===1?"":"s"}`;
  emptyState.hidden=filtered.length!==0;
}

function renderFavorites(){
  const list=games.filter(game=>isFavorite(game.id));
  renderInto(favoritesGrid,list);
  favoritesEmpty.hidden=list.length!==0;
}

function renderAll(){
  renderCatalog();
  renderFavorites();
}

function updateHero(){
  const featured=games.filter(game=>game.featured);
  const game=featured[heroIndex%featured.length];

  heroBg.style.background=`linear-gradient(135deg,${game.colors[0]},${game.colors[1]})`;
  heroArt.textContent=game.icon;
  heroConsole.textContent=game.console;
  heroTitle.textContent=game.title;
  heroRating.textContent=game.rating;
  heroDescription.textContent=game.description;
  heroMeta.innerHTML=`
    <span>${game.year}</span>
    <span>${game.genre}</span>
    <span>${game.developer}</span>
  `;
  heroFavorite.textContent=isFavorite(game.id)?"♥ Favoritado":"♡ Favoritar";
  heroDetails.onclick=()=>openGame(game.id);
  heroFavorite.onclick=()=>toggleFavorite(game.id);

  heroDots.innerHTML=featured.map((_,index)=>
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
  modalArt.textContent=game.icon;
  modalConsole.textContent=game.console;
  modalTitle.textContent=game.title;
  modalRating.textContent=game.rating;
  modalDescription.textContent=game.description;
  modalAbout.textContent=game.about;
  modalMeta.innerHTML=`
    <span>Ano: ${game.year}</span>
    <span>Gênero: ${game.genre}</span>
    <span>Desenvolvedora: ${game.developer}</span>
  `;

  modalGallery.innerHTML=[1,2,3].map((n,index)=>
    `<div class="gallery-item" style="--g1:${game.colors[index%2]};--g2:${game.colors[(index+1)%2]}">${game.icon}</div>`
  ).join("");

  const related=games.filter(item=>item.id!==game.id && (item.console===game.console || item.genre===game.genre)).slice(0,3);
  relatedGames.innerHTML=related.map(item=>
    `<button data-related="${item.id}"><strong>${item.title}</strong><br><small>${item.console} • ${item.genre}</small></button>`
  ).join("");

  relatedGames.querySelectorAll("[data-related]").forEach(button=>{
    button.onclick=()=>openGame(button.dataset.related);
  });

  modalPlay.onclick=()=>{
    alert("Na próxima etapa este botão será ligado ao emulador e a um jogo permitido.");
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
},6500);
