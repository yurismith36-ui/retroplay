const id=new URLSearchParams(location.search).get("id");
const $=name=>document.getElementById(name);
const e={
  title:$("gameTitle"),side:$("sidebarTitle"),console:$("gameConsole"),
  desc:$("gameDescription"),meta:$("gameMeta"),load:$("loadingBox"),
  text:$("loadingText"),error:$("errorBox"),errorText:$("errorText"),
  full:$("fullscreenButton"),shell:$("playerShell")
};

const realFullscreen=()=>document.fullscreenElement||document.webkitFullscreenElement||null;
const pseudo=()=>document.body.classList.contains("pseudo-fullscreen");

function updateButton(){
  e.full.textContent=realFullscreen()||pseudo()?"✕ Sair da tela cheia":"⛶ Tela cheia";
}
function refresh(){
  setTimeout(()=>window.dispatchEvent(new Event("resize")),120);
  setTimeout(()=>window.dispatchEvent(new Event("resize")),420);
}
function hideLoading(){e.load.hidden=true}
function fail(message){
  hideLoading();
  e.errorText.textContent=message;
  e.error.hidden=false;
}
async function toggleFullscreen(){
  try{
    if(pseudo()){
      document.body.classList.remove("pseudo-fullscreen");
      updateButton();refresh();return;
    }
    if(realFullscreen()){
      if(document.exitFullscreen)await document.exitFullscreen();
      else if(document.webkitExitFullscreen)await document.webkitExitFullscreen();
      return;
    }
    if(e.shell.requestFullscreen){
      await e.shell.requestFullscreen();
      return;
    }
    if(e.shell.webkitRequestFullscreen){
      await e.shell.webkitRequestFullscreen();
      return;
    }
    document.body.classList.add("pseudo-fullscreen");
    window.scrollTo(0,0);updateButton();refresh();
  }catch(error){
    console.warn(error);
    document.body.classList.add("pseudo-fullscreen");
    window.scrollTo(0,0);updateButton();refresh();
  }
}

async function start(){
  if(!id)return fail("O endereço não informou qual jogo deve ser aberto.");
  try{
    const response=await fetch("data/games.json",{cache:"no-store"});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const games=await response.json();
    const game=games.find(item=>item.id===id);
    if(!game)return fail("Jogo não encontrado no catálogo.");

    document.title=`${game.nome} — RetroPlay`;
    e.title.textContent=e.side.textContent=game.nome;
    e.console.textContent=game.console;
    e.desc.textContent=game.descricao||"";
    e.meta.innerHTML=`
      <span>${game.ano||"Ano não informado"}</span>
      <span>${game.genero||"Gênero não informado"}</span>
      <span>${game.desenvolvedora||"Desenvolvedora não informada"}</span>
    `;
    e.text.textContent="Carregando o núcleo e a ROM.";

    window.EJS_player="#game";
    window.EJS_core=game.core||"snes";
    window.EJS_gameUrl=game.rom;
    window.EJS_gameName=game.nome;
    window.EJS_language="pt-BR";
    window.EJS_color="#66c0f4";
    window.EJS_backgroundColor="#000";
    window.EJS_alignStartButton="center";
    window.EJS_startOnLoaded=false;
    window.EJS_pathtodata="https://cdn.emulatorjs.org/stable/data/";
    window.EJS_ready=()=>{hideLoading();refresh()};
    window.EJS_onGameStart=()=>{hideLoading();refresh()};

    const loader=document.createElement("script");
    loader.src="https://cdn.emulatorjs.org/stable/data/loader.js";
    loader.async=true;
    loader.onerror=()=>fail("Não foi possível carregar o EmulatorJS.");
    document.body.appendChild(loader);
  }catch(error){
    console.error(error);
    fail("Falha ao carregar o catálogo ou a ROM.");
  }
}

e.full.onclick=toggleFullscreen;
document.addEventListener("fullscreenchange",()=>{updateButton();refresh()});
document.addEventListener("webkitfullscreenchange",()=>{updateButton();refresh()});
window.addEventListener("orientationchange",refresh);
updateButton();
start();
