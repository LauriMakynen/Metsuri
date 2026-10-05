# Metsuri – ohjeet Claudelle

Metsänhoitosovellus: metsänomistaja merkitsee palstalleen tehdyt työt, tekee GPS-aktiviteetteja ja
julkaisee työpyyntöjä; työn tarjoajat (yrittäjät, yritykset, yhdistykset) tarjoavat niihin hintaa.
Koodi on kansiossa `forest-care-app/` (React + Vite + Leaflet / Express + TypeScript / PostgreSQL + PostGIS).

## Kieli ja tyyli
- Käyttäjälle näkyvä teksti suomeksi. Koodi, muuttujat ja kommentit englanniksi.
- Commit-viestit suomeksi muodossa `feat: …` / `fix: …` / `chore: …`.

## Ajaminen
- Kaikki käynnistyy: `cd forest-care-app && ./start.sh` (frontend :5173, backend :3001, Mailpit :8025).
  Muut: `./start.sh phone | seed | stop | reset-db` (ks. README).
- **Käyttäjä pitää usein sovellusta itse käynnissä** osoitteessa http://localhost:5173. Tarkista portit
  ennen käynnistystä; älä käynnistä toista instanssia. Backend (ts-node-dev) ja Vite latautuvat muutoksista itse.
- Uudet sarakkeet/taulut vaativat `npm run migrate` (backendissä) myös käynnissä olevalle sovellukselle.

## Ympäristö (Windows + WSL)
- WSL:n ei-interaktiivinen shell käyttää järjestelmän Node 18:aa → aja npm/npx aina
  `wsl -e bash -ic "…"` (lataa nvm:n Node 24:n).
- PowerShell sotkee lainausmerkit: kirjoita monimutkaiset komennot skriptiksi
  `\\wsl.localhost\Ubuntu\tmp\…sh` ja aja `wsl -e bash -ic "bash /tmp/…sh"`, poista lopuksi.
- **`git push`/`fetch` jää Clauden shellissä SSH-salasanaan jumiin** → pyydä käyttäjää ajamaan ne.

## Git-työtapa (kolme kehittäjää: Lauri, Eemil, Reetta)
- Haarat: henkilökohtainen haara (`Lauri`, `Eemil`, `Reetta`) → `dev` → `pre-main` → `main`.
  Testattu kokonaisuus viedään `dev`istä `pre-main`iin ja sieltä julkaisuun `main`iin.
- **Claude työskentelee aina sen kehittäjän omassa haarassa, jonka kanssa istunto on**
  (Laurin kanssa `Lauri`). Tarkista `git branch --show-current` ennen ensimmäistä muutosta.
  Älä commitoi suoraan `dev`-, `pre-main`- tai `main`-haaraan.
- Ennen uuden työn aloittamista pyydä käyttäjää hakemaan muiden muutokset ja päivittämään oma
  haara `dev`istä (`git fetch` ja `git merge origin/dev`), jotta työ alkaa tuoreimmasta versiosta.
- Claude commitoi omaan haaraan paikallisesti; käyttäjä pushaa sen ja tekee pull requestin `dev`iin,
  jossa muut kehittäjät voivat katselmoida sen.
- Muiden työ voi muuttaa migraatioita (`migrate.ts`) ja testidataa (`seed.ts`) – tarkista ne
  `dev`in päivittämisen jälkeen ja aja `npm run migrate`.

## Tietokanta
- Ainoa ajettava migraatio on `backend/src/db/migrate.ts` (idempotentti: `IF NOT EXISTS`, backfill).
  `database/init.sql` ja `database/migrations/*.sql` ovat vanhoja, eivät ajossa.
- Testidata: `backend/src/db/seed.ts`. Tunnukset `admin@`, `omistaja2@`, `omistaja3@`, `yrittaja@`,
  `yrittaja2@metsuri.test`; salasana `SEED_PASSWORD` tiedostossa `backend/.env` – **älä tulosta sitä**.
- **Älä aja `reset-db`:tä tai poista dataa itse** – käyttäjä ajaa sen.
- PostgreSQL `NUMERIC` (area_ha, eurot) tulee merkkijonona → normalisoi `forestService.ts`:ssä
  (`normalizeNumber`). Unohtunut normalisointi kaatoi kerran koko karttasivun (`toFixed`).

## Toimialamalli
- `markings` = **tehdyt työt** ("Tehdyt työt" sivupalkissa).
- `work_requests` = **suunniteltu työ**: oma alue, tyyppi, `pricing` (`owner_receives` = puukauppa,
  korkein tarjous paras; `owner_pays` = palvelutyö, edullisin paras) ja omistajan `target_price_eur`.
- `work_request_bids`: tarjoukset. Julkiset rajapinnat **eivät koskaan paljasta omistajan tai
  tarjoajan henkilöllisyyttä** (vain paras tarjous, määrä, katsojan oma tarjous).
- Vierailija = demotila: valmis demopalsta (`utils/demoData.ts`), ei tallenna backendiin.

## Frontendin sudenkuopat
- API kutsutaan samasta osoitteesta (Viten proxy `/api`); `VITE_API_URL` vain tuotannossa.
- React StrictMode luo Leaflet-kartan kahdesti: tarkista kerroksissa `map.hasLayer(layer)` ennen uudelleenkäyttöä.
- Muiden käyttäjien tekstit (otsikot, lisätiedot) karttapopuppeihin `textContent`illa, ei HTML-merkkijonona.
- Mobiilikäyttö on tärkeää: testaa myös 375 px leveydellä.

## Ennen committia
- Backend: `npx tsc --noEmit`. Frontend: `npm run build` ja `npx eslint <muutetut tiedostot>`.
- Tunnetut vanhat lint-virheet: `MapPage.tsx` 4 kpl (react-hooks/set-state-in-effect), `useAuth.tsx` 1 – älä
  laske niitä uusiksi, mutta älä lisää uusia.
- Testaa muutokset selaimessa: kirjaudu asettamalla token `localStorage`en (hae token login-API:sta
  skriptissä tulostamatta salasanaa). Leaflet-draw-piirto onnistuu automaatiossa vain lähettämällä
  `mousedown`/`mouseup` `.leaflet-mouse-marker`-elementille; mobiiliemulaatiossa piirto ei toimi.
- Siivoa testidata (testitarjoukset, -pyynnöt) ja palauta testisalasanat (`npm run seed`) testin jälkeen.

## Avoimet asiat
- Julkaisu (Vercel + Render/Railway + Neon/Supabase, ks. `forest-care-app/DEPLOYMENT.md`).
- MML-API-avain on `frontend/.env(.example)`:ssa ja `frontend/.env` on gitissä → siirrä backendiin ennen julkaisua.
- Tarjouksen hyväksyntä / yhteydenotto omistajan ja tarjoajan välillä puuttuu.
