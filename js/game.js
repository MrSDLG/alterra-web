const STEAM = 'https://store.steampowered.com/app/4144980/Alterra/';
const HEADER = 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/4144980/443cc22efdf4235d80248ee33fddefde6df743af/header.jpg';

export function renderGame(host) {
  host.innerHTML = `
    <div class="gwrap">
      <section class="ghero">
        <div class="hero-copy">
          <span class="eyebrow">COMING TO STEAM · FREE TO PLAY</span>
          <h1 class="dtitle">ALTERRA</h1>
          <p class="lead">Explore a living recreation of Earth built from real world data. Travel across mountains, seas and deserts without limits.</p>
          <p class="dim">Free of objectives and full of calm.</p>
          <div class="cta">
            <a class="btn hot big snd" href="${STEAM}" target="_blank" rel="noopener noreferrer">WISHLIST ON STEAM <span>▸</span></a>
            <a class="link snd" href="#/">BACK TO THE VOLCANO MAP</a>
          </div>
        </div>
        <a class="shot frame" href="${STEAM}" target="_blank" rel="noopener noreferrer" aria-label="Alterra on Steam">
          <img src="${HEADER}" alt="Alterra" referrerpolicy="no-referrer">
        </a>
      </section>

      <div class="facts frame strip">
        <div class="fact"><span class="fl">RELEASE</span><span class="fv">To be announced</span></div>
        <div class="fact"><span class="fl">PRICE</span><span class="fv">Free to play</span></div>
        <div class="fact"><span class="fl">PLATFORM</span><span class="fv">Windows</span></div>
        <div class="fact"><span class="fl">DEVELOPER</span><span class="fv">Weaweosa</span></div>
        <div class="fact"><span class="fl">PUBLISHER</span><span class="fv">SDLG Studios</span></div>
      </div>

      <div class="ovgrid three">
        <section class="card frame"><h2>A REAL EARTH</h2><p>Every mountain, desert and ocean you see is built from real world data, shaped to feel alive and endless.</p></section>
        <section class="card frame"><h2>NO OBJECTIVES</h2><p>Move freely, climb hills, fly over valleys or just stop and look around. There are no missions, only you and the planet.</p></section>
        <section class="card frame"><h2>GROWING OVER TIME</h2><p>Planned for later: natural disasters, survival elements and multiplayer, so people can explore together.</p></section>
      </div>

    </div>`;
  const img = host.querySelector('img');
  img.addEventListener('error', () => { img.closest('.shot').hidden = true; });
}
