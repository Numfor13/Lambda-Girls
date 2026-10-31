# Maps — 2026-10-31

The owner requested a free map API everywhere a map is needed, with Google preferred.

## Provider choice

- **Directory / multiple facility pins:** lazy-loaded Leaflet with standard OpenStreetMap raster tiles. No API key or payment account is needed. Public facility coordinates come from the saved directory.
- **Single facility / shared position:** use the **Google Maps Embed API** when `VITE_GOOGLE_MAPS_EMBED_API_KEY` is configured; otherwise use the same OpenStreetMap component. There is an explicit OpenStreetMap fallback for a Google embed that cannot load.
- **Directions:** Google Maps URLs with `api=1` and destination only, opening Google Maps in a browser or installed app. No Directions/Routes/Places/Maps JavaScript API is called.
- **Offline / tile failure:** retain the local coordinate overview, facility directory and phone actions. No fabricated streets, journey times or straight-line “routes” are displayed by the new map component.

Google states that [Maps Embed usage is free and unlimited](https://developers.google.com/maps/documentation/embed/usage-and-billing), but it [requires a Cloud API key and billing setup](https://developers.google.com/maps/documentation/embed/get-api-key). The app therefore works immediately with OpenStreetMap and does not require anyone to open a billing account. A Google key has not been provisioned by this change.

## Google configuration

1. In the owner’s Cloud project, enable **Maps Embed API**.
2. Restrict the browser key to that API and the actual website referrers (plus localhost during development).
3. Put `VITE_GOOGLE_MAPS_EMBED_API_KEY=<restricted browser key>` in gitignored `Frontend/.env.local` or the deployment environment.
4. Rebuild. Single-location views automatically prefer Google Embed.

Keep the key out of committed env files. The key appears in the browser by design; referrer/API restrictions matter. The [documented iframe referrer policy](https://developers.google.com/maps/documentation/embed/embedding-map) sends the site origin, without private page paths or queries.

## OpenStreetMap operation

The default URL is `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. `VITE_OSM_TILE_URL` can override it with a compatible provider; its attribution requirements must be reflected in the TileLayer.

Follow the [OSMF tile usage policy](https://operations.osmfoundation.org/policies/tiles/): visible contributor attribution, ordinary browser referrers and caching, no bulk downloads or prefetching, and no availability guarantee. The map requests only visible tiles. Existing PWA caching retains viewed tiles; it does not download a city or promise an offline street map. For larger traffic, use a suitable OSM tile host.

## Where it is used

The shared `design/components/FacilityMap.tsx` now supplies street maps to the facility directory (desktop aside and mobile Map view), facility detail, About’s real directory map, and the operator dispatch facility card. Operator emergency detail also has `LocationMap` for a shared position.

Precise shared positions require an explicit **Load location map** action before being sent to a provider. Personal origin coordinates used for distance sorting stay local; public facility maps do not include that origin. Existing geographic coordinates and phone actions remain visible offline.

The old standalone facility-map and rides pages remain unrouted; this does not enable backend-unsupported ride booking.

## Verification

Browser QA loaded OpenStreetMap street tiles and 40 public facility pins, reduced the map to five emergency facilities, opened a pin’s facility link, checked the offline overview toggle and Google destination URL. Directory/detail/About were checked at phone and four desktop/laptop sizes. Google Embed URL construction has regression coverage; rendering a real Google embed needs the owner’s configured key and was not exercised.
