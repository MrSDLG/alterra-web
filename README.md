# Alterra volcano database

Static site, no build step. Open it over http (not as a file).

    python tools/serve.py        # http://127.0.0.1:5180
    node tools/build-data.mjs    # rebuild data/ from source/
    node tools/package.mjs       # copy the deployable files to dist/

Deploy the `dist/` folder (Netlify or any static host).

The globe uses MapLibre GL JS loaded from the jsDelivr CDN (see `index.html`); if it cannot load, or the browser only has software graphics (hardware acceleration off), the page falls back to the flat canvas map in `js/map.js`.

## Data

`source/gvp/` holds the Smithsonian GVP downloads (volcanoes, eruptions, photos, subfeatures);
`source/votw_data_v2.json` is the older database that fills in whatever the feeds lack.
Volcano data: Smithsonian Institution, Global Volcanism Program. Map imagery: Sentinel-2 cloudless by EOX (non-commercial licence).

## Game events

`events.json` maps a GVP volcano number to its events, in any order (the page sorts them):

    { "283030": [{ "type": "eruption", "title": "Eruption started", "detail": "Ash column 6.2 km", "at": "2026-10-23T12:00:00Z", "level": "high" }] }

They show up as orange rows in that volcano's eruption history.

Add `?map=globe` or `?map=flat` to the address to force one or the other.

Add `?lite` to turn off animations, the drifting dust and the dotted textures (used automatically without graphics hardware); `?lite=0` forces the full look.
