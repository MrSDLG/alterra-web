import { data } from './store.js';
import { num } from './util.js';

export function renderAbout(host) {
  const erupting = data.rows.filter(r => r.tier === 0).length;
  host.innerHTML = `
    <div class="ovwrap">
      <header class="ovhead"><h1 class="dtitle">ABOUT</h1></header>
      <div class="ovgrid">
        <section class="card frame">
          <h2>WHAT THIS IS</h2>
          <p>A map and database of the world’s volcanoes for players of Alterra: ${num(data.rows.length)} volcanoes in ${num(data.countries.length)} countries, taken from the Smithsonian’s Volcanoes of the World records.</p>
          <p>Each volcano has its photo where one exists, its eruption history and its features: cones, craters and domes. Events from the game are planned to appear in each volcano’s history too.</p>
        </section>
        <section class="card frame">
          <h2>HOW TO USE IT</h2>
          <ul class="howto">
            <li><b>Search</b> a name, country or type. Press <kbd>/</kbd> to jump to the search box.</li>
            <li><b>Click a volcano</b> on the map to see its photo, height and last eruption. “Expand full view” opens its whole page.</li>
            <li><b>Red</b> volcanoes are erupting, <b>cyan</b> ones are not. ${num(erupting)} were erupting at the Smithsonian’s last update${data.asOf ? ` (${data.asOf})` : ''}; one that started later is not marked yet.</li>
            <li><b>Filters</b> narrow the map by status, type, country or height. <b>List</b> shows the same volcanoes as a list.</li>
          </ul>
        </section>
      </div>
      <section class="card frame" id="credits">
        <h2>CREDITS</h2>
        <div class="credits">
          <div><span class="fl">VOLCANO DATA</span><p>Smithsonian Institution, Global Volcanism Program, <a class="ext" href="https://volcano.si.edu" target="_blank" rel="noopener noreferrer">Volcanoes of the World</a>: locations, heights, descriptions, eruption records, features and photos.</p></div>
          <div><span class="fl">PHOTOS</span><p>Each photo is credited under the image. They belong to their photographers and come from the GVP photo collection.</p></div>
          <div><span class="fl">MAP IMAGERY</span><p><a class="ext" href="https://s2maps.eu" target="_blank" rel="noopener noreferrer">Sentinel-2 cloudless</a> by EOX IT Services GmbH. Contains modified Copernicus Sentinel data 2024. Non-commercial use.</p></div>
          <div><span class="fl">GLOBE</span><p><a class="ext" href="https://maplibre.org" target="_blank" rel="noopener noreferrer">MapLibre GL JS</a> draws the globe (BSD 3-clause licence).</p></div>
          <div><span class="fl">FONTS</span><p>Chakra Petch and Barlow Semi Condensed, from Google Fonts (SIL Open Font License).</p></div>
          <div><span class="fl">THE GAME</span><p>Alterra is made by Weaweosa and published by SDLG Studios.</p></div>
        </div>
      </section>
    </div>`;
}
