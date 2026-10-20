# Metsuri – Metsänhoitosovellus MVP

Metsänhoitokarttasovellus web- ja mobiilikäyttöön.

## Teknologiat

| Kerros | Teknologia |
|--------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Kartta | Leaflet + leaflet-draw + Turf.js |
| Backend | Node.js + Express + TypeScript |
| Tietokanta | PostgreSQL + PostGIS |
| Tiedonsiirto | GeoJSON |
| Autentikointi | JWT (jsonwebtoken + bcryptjs) |
| Mittaukset | Turf.js (etäisyys, pinta-ala) |

---

## Projektirakenne

```
forest-care-app/
├── backend/          # Node.js + Express API
│   ├── src/
│   │   ├── db/       # Tietokantayhteys ja migraatiot
│   │   ├── middleware/  # JWT-autentikointi
│   │   ├── routes/   # API-reitit (auth, properties, markings)
│   │   └── index.ts  # Palvelimen käynnistys
│   ├── Dockerfile
│   └── package.json
├── frontend/         # React-sovellus
│   ├── src/
│   │   ├── components/  # MarkingForm, PrivateRoute
│   │   ├── hooks/    # useAuth (context)
│   │   ├── pages/    # LoginPage, RegisterPage, MapPage
│   │   ├── services/ # API-kutsut
│   │   └── types/    # TypeScript-tyypit
│   └── package.json
├── database/
│   └── init.sql      # Tietokantarakenne
└── docker-compose.yml
```

---

## API-reitit

### Autentikointi
| Metodi | Polku | Kuvaus |
|--------|-------|--------|
| POST | `/api/auth/register` | Rekisteröidy |
| POST | `/api/auth/login` | Kirjaudu sisään |

### Metsäkiinteistöt
| Metodi | Polku | Kuvaus |
|--------|-------|--------|
| GET | `/api/properties` | Hae kaikki kiinteistöt |
| POST | `/api/properties` | Luo kiinteistö |
| POST | `/api/properties/import` | Tuo kiinteistö kiinteistötunnushausta |
| GET | `/api/properties/:id/markings` | Hae valitun kiinteistön merkinnät |
| GET | `/api/properties/:id/forest-data` | Metsävaratiedot (placeholder) |
| GET | `/api/properties/:id/valuation` | Arviolaskenta (placeholder) |
| PUT | `/api/properties/:id` | Päivitä kiinteistö |
| DELETE | `/api/properties/:id` | Poista kiinteistö |

### Karttamerkinnät
| Metodi | Polku | Kuvaus |
|--------|-------|--------|
| GET | `/api/markings` | Hae kaikki merkinnät |
| GET | `/api/markings?propertyId=123` | Hae yhden kiinteistön merkinnät |
| POST | `/api/markings` | Luo merkintä |
| PUT | `/api/markings/:id` | Päivitä merkintä |
| DELETE | `/api/markings/:id` | Poista merkintä |

### Kiinteistötunnushaku ja karttatasot
| Metodi | Polku | Kuvaus |
|--------|-------|--------|
| GET | `/api/cadastre/search/:propertyCode` | Hae kiinteistö kiinteistötunnuksella |
| GET | `/api/map/layers` | Hae karttatasojen asetukset |
| GET | `/api/map/tiles/:style/:z/:x/:y` | MML-tiiliproxy (`maastokartta`, `peruskartta`, `ortokuva`) |

---

## Ominaisuudet

### Karta ja navigaatio
- ✅ **Maanmittauslaitoksen (MML) karttatasot** – maastokartta, peruskartta, ortokuva, kiinteistörajat
- ✅ **Mittakaavaviiva** – kartan vasemmassa alakulmassa
- ✅ **Responsiiviinen zoomihallinnan** – mobiilissa helppokäyttöinen

### Etäisyyden mittaus
- ✅ **Mittanauhatyökalu (📐 Mittaa)** – klikkaa kaksi pistettä
- ✅ **Automaattinen etäisyyden laskenta** – Turf.js + WGS84-geographia
- ✅ **Etäisyyden näyttö** – metreinä (<1 km) tai kilometreinä (≥1 km)
  - Esimerkki: "245 m" tai "1.42 km"
- ✅ **Visuaalinen merkintä** – punainen viiva ja pisteet kartalla
- ✅ **Mittaus-paneeli** – näyttää pisteiden määrän ja etäisyyden
- ✅ **Mittauksen tyhjennys/reset** – uusi mittaus samalla työkalulla

### Pinta-alalaskenta
- ✅ **Automaattinen pinta-ala polygoneille** – kun merkintä tallennetaan
- ✅ **Turf.js-laskenta** – oikea maantieteellinen pinta-ala WGS84-koordinaateilla
- ✅ **Hehtaari-yksikkö** – 1 ha = 10 000 m²
- ✅ **Tietokantaan tallennus** – `area_ha`-sarake markings-taulussa
- ✅ **Merkintöjen tiedoissa näkyvä pinta-ala**
  - Polygonimerkintä: "📐 0.52 ha"
  - Pisteille/viivoille: ei näytetään (NULL)

### Metsänhoitomerkinnät
- ✅ **Viisi merkintätyyppiä**
  - Vesakonhoito (🟨 keltainen)
  - Istutus (🟩 vihreä)
  - Harvennus (🟦 sininen)
  - Avohakkuu (🟥 punainen)
  - Muu työ (🟪 violetti)
- ✅ **Geometrian valinta** – piste, viiva, alue
- ✅ **Merkinnän nimeäminen ja kuvaus**
- ✅ **Pinta-alan näyttö aluemerkinnöille**

### Toimenpiteen päivämäärä ja seurantasuositus
- ✅ Käyttäjä valitsee merkinnälle toimenpiteen päivämäärän (YYYY-MM-DD)
- ✅ Sovellus laskee automaattisesti suuntaa-antavan tarkastusvälin merkintätyypin perusteella
- ✅ Merkinnän tiedoissa näytetään:
  - Toimenpiteen päivämäärä
  - Seurantasuosituksen teksti
  - Seuraavan tarkastuksen aikaväli
- ℹ️ Suositukset ovat alustavia oletuksia, eivät virallinen metsäarvio
- 🔧 Jatkossa suosituksia voidaan tarkentaa metsätyypin, puulajin, kasvupaikan ja metsävaratiedon perusteella

### Kiinteistöhallinta
- ✅ **Kiinteistöjen haku kiinteistötunnuksella** – MML-integraatio
- ✅ **Kiinteistöjen tuominen kartasta** – klikkaa rajaa ja nimeä
- ✅ **Kiinteistöjen luominen kartalla** – piirräväline
- ✅ **Kiinteistöjen valinta ja korostus**

### Autentikointi ja tietoturva
- ✅ **Käyttäjärekisteröinti** – email + salasana
- ✅ **JWT-autentikointi** – turvallinen sessio
- ✅ **Vierailijamoodi** – testaus ilman kirjautumista (väliaikainen data)
- ✅ **Salasanakryptiikka** – bcryptjs

### Mobiilikäyttö
- ✅ **Kosketusnäyttöjen tuki** – klikkaus → painallus
- ✅ **Responsiivinen käyttöliittymä** – tabletti ja puhelin
- ✅ **Sivupalkki responsiivisena** – slide-in bottom sheet mobiilissa
- ✅ **Zoomihallinnan** – kaksoissormi zoomaus

---

## Paikallinen kehitys

### Vaatimukset
- Node.js 20.19+ (tai 22.12+)
- Docker + Docker Compose
- npm

### Pikakäynnistys (suositeltu)

Aja WSL:n / Linuxin terminaalissa:

```bash
cd forest-care-app
./start.sh
```

Skripti tarkistaa Dockerin ja Node-version, luo puuttuvat `.env`-tiedostot esimerkeistä (satunnaisella `JWT_SECRET`illä), asentaa riippuvuudet tarvittaessa, käynnistää tietokannan, ajaa migraatiot ja käynnistää backendin ja frontendin samaan terminaaliin. `Ctrl+C` sammuttaa palvelimet.

| Komento | Kuvaus |
|---------|--------|
| `./start.sh` | Käynnistä kaikki |
| `./start.sh phone` | Käynnistä niin, että sovelluksen voi avata puhelimella (HTTPS) |
| `./start.sh stop` | Pysäytä tietokantakontti |
| `./start.sh seed` | Luo testitunnukset (ei poista mitään) |
| `./start.sh reset-db` | Tyhjennä tietokanta ja luo testitunnukset (kysyy vahvistuksen) |

### Testitunnukset

`./start.sh seed` (tai `reset-db`) luo tunnukset:

- `admin@metsuri.test` – metsänomistaja, jolla valmis Testipalsta, merkinnät ja avoin työpyyntö
- `omistaja2@metsuri.test`, `omistaja3@metsuri.test` – metsänomistajia, joilla työpyyntöjä eri puolilla Suomea
- `yrittaja@metsuri.test`, `yrittaja2@metsuri.test` – työn tarjoajia, joilla valmiita tarjouksia

Työpyynnössä omistaja valitsee **puukaupan** (ostaja maksaa omistajalle, korkein tarjous paras)
tai **palvelutyön** (omistaja maksaa tekijälle, edullisin tarjous paras). Paras tarjous näytetään
kaikille nimettömänä.

Salasana on `backend/.env`-tiedostossa kohdassa `SEED_PASSWORD` (arvotaan automaattisesti).
Voit vaihtaa sen ja ajaa `./start.sh seed` uudelleen.

### Salasanan palautus ja sähköpostit

Kirjautumissivun **"Salasana unohtunut?"** lähettää kertakäyttöisen linkin, joka on voimassa 30 minuuttia.
Kehityksessä viestit eivät lähde oikeasti, vaan ne näkyvät Mailpitissa: **http://localhost:8025**
(käynnistyy `./start.sh`:n mukana). Salasanan vaihto kirjaa käyttäjän ulos kaikilta laitteilta.

Tuotannossa aseta `backend/.env`:iin oikean sähköpostipalvelun SMTP-tiedot (`SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, esim. Resend tai Brevo) ja `FRONTEND_URL` julkiseen osoitteeseen,
koska linkit muodostetaan siitä.

### Testaus puhelimella

Puhelimen pitää olla samassa WLANissa kuin kone. GPS toimii puhelimen selaimessa vain HTTPS:llä,
joten `phone`-tila käyttää itse tehtyä sertifikaattia – selain varoittaa siitä, ja varoitus hyväksytään
("Lisätiedot" → "Siirry sivustolle").

**Kerran tehtävät Windows-asetukset** (WSL2 näkyy muuten vain koneen sisällä):

1. Luo tiedosto `%USERPROFILE%\.wslconfig`, sisältö:
   ```ini
   [wsl2]
   networkingMode=mirrored
   ```
2. Käynnistä WSL uudelleen PowerShellissä: `wsl --shutdown` (myös Docker Desktop käynnistyy uudelleen).
3. Salli yhteydet porttiin 5173 – PowerShell **järjestelmänvalvojana**:
   ```powershell
   New-NetFirewallHyperVRule -Name Metsuri5173 -DisplayName "Metsuri dev 5173" -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -Protocol TCP -LocalPorts 5173
   ```
4. Varmista, että WLAN-verkon profiili on Windowsissa **Yksityinen** (ei Julkinen).

Sen jälkeen: `./start.sh phone` ja avaa puhelimella skriptin tulostama osoite (`https://192.168.x.x:5173`).

Alla samat vaiheet käsin.

### Ensimmäinen käyttöönotto

1. Käynnistä tietokanta:

```bash
cd forest-care-app
docker compose up -d db
```

2. Ota backend käyttöön:

```bash
cd backend
cp .env.example .env
npm install
npm run migrate
```

3. Ota frontend käyttöön:

```bash
cd ../frontend
cp .env.example .env
npm install
```

4. Käynnistä kehityspalvelimet kahdessa eri terminaalissa:

```bash
# Terminaali 1
cd forest-care-app/backend
npm run dev

# Terminaali 2
cd forest-care-app/frontend
npm run dev
```

5. Avaa selaimessa:
- Frontend: http://localhost:5173
- Backend health: http://localhost:3001/health

### Seuraavan kerran käynnistys (nopea rutiini)

Kun riippuvuudet ja .env-tiedostot on jo tehty, käytä tätä:

```bash
# Projektin juuressa
cd forest-care-app
docker compose up -d db

# Terminaali 1
cd backend
npm run migrate
npm run dev

# Terminaali 2
cd ../frontend
npm run dev
```

Kun lopetat työskentelyn:

```bash
# Projektin juuressa
docker compose stop
```

## Miten jatkan kehitystä

Suositeltu etenemisjärjestys joka kerta:

1. Vedä uusimmat muutokset ja käynnistä sovellus nopealla rutiinilla.
2. Testaa perusflow heti alussa:
	 - Rekisteröinti
	 - Kirjautuminen
	 - Suojattu datahaku (esim. properties/markings)
3. Tee muutos pieninä paloina:
	 - Backend-reitti tai logiikka
	 - Frontend-kutsu palveluun
	 - UI-muutos
4. Aja vähintään nämä tarkistukset ennen committia:
	 - Backend käynnistyy ilman virheitä
	 - Frontend käynnistyy ilman virheitä
	 - Muutettu toiminto toimii selaimessa
5. Kirjoita commit-viesti muodossa: feat/fix/chore + lyhyt kuvaus.

## Yleisimmät ongelmat

- Jos saat virheen "client password must be a string":
	- tarkista että backend/.env on olemassa
	- tarkista että DATABASE_URL on asetettu

## MML API-avain ja mock-data

Backend tukee Maanmittauslaitoksen avainta ilman kovakoodausta.

- Lisää backendiin:
	- `MML_API_KEY=<avaimesi>`
	- `MML_CADASTRE_API_URL=<rajapinnan URL, jossa {propertyCode}>`
- **Jos MML-asetuksia ei ole, kiinteistöhaku palauttaa virheen tuotannossa:**
  `"Kiinteistöhaku ei ole käytettävissä ilman MML API -asetuksia."`
- Kehityksessä (`NODE_ENV=development`) haku käyttää automaattisesti mock-geometriaa
  selkeällä varoituksella lokissa – tämä on vain kehitysaikana, ei tuotantokäyttöön.

Frontendissä voi käyttää vaihtoehtoisesti suoraa MML-tiilikutsua:

- `VITE_MML_API_KEY=<avaimesi>`

Jos backendin MML-avain on asetettu, frontend käyttää ensisijaisesti backendin `/api/map/tiles/...`-proxya, jolloin avain ei näy selaimen tile-URL:issa.

## Karttatasojen vaihto

Map-näkymässä voi vaihtaa tasoa:

- **Maastokartta** – MML maastokartta (tai OSM, jos MML-avainta ei ole)
- **Ortokuva** – MML ortokuva / Esri World Imagery
- **Kiinteistörajat** – MML kiinteistörajat ja tunnukset overlay-tasona

Kiinteistörajat-painike näkyy vain, jos MML API -avain on asetettu (backend tai frontend).
Taso tulee pohjakartan päälle läpinäkyvänä kerroksena — se ei korvaa maastokarttaa tai ortokuvaa.

Tasovalitsin on sijoitettu kartan oikeaan yläkulmaan niin, ettei se peitä alareunan piirtotyökaluja mobiilissa.

## Kiinteistötunnushaku

Tuettu syötemuoto on esimerkiksi `145-410-43-16`.

Käytös:

- virheellinen formaatti: `Kiinteistötunnus on väärässä muodossa`
- ei tulosta: `Kiinteistöä ei löytynyt`
- MML-rajapintaa ei ole määritelty: `Kiinteistöhaku ei ole käytettävissä ilman MML API -asetuksia`
- rajapintavirhe: `Kiinteistön haku epäonnistui`

Hakutuloksen voi tallentaa omiin kiinteistöihin painikkeella `Tallenna omiin kiinteistöihin`.
Saman tunnuksen tuplistallentaminen estetään (409-virhe näytetään käyttäjälle).

## Metsävaratiedot ja arvio

### forest-data (`GET /api/properties/:id/forest-data`)

Palauttaa kiinteistön puustotiedot (mänty, kuusi, koivu, muut, yhteensä m³).

**Tila:** Ei vielä kytketty Metsäkeskuksen avoimeen metsätietorajapintaan.
Reitti on olemassa ja tietomalli valmis – integrointia varten katso
`backend/src/services/forestDataService.ts`.

Vastaus, kun dataa ei ole:
```json
{ "status": "not_available", "message": "Metsävaratietoja ei ole vielä saatavilla tälle kiinteistölle.", "data": null }
```

### valuation (`GET /api/properties/:id/valuation`)

Palauttaa kiinteistön arviolaskennan (puuston arvo, maapohja, yhteensä €).

**Tila:** Ei vielä kytketty. Arviolaskenta vaatii puustotiedot ja alueelliset kantohintaindeksit.
Tietomalli (`forest_valuation`-taulu) on luotu tulevaa toteutusta varten.

Vastaus, kun dataa ei ole:
```json
{ "status": "not_available", "message": "Arviota ei voida laskea ilman puustotietoja.", "data": null }
```

**Laskennan logiikka (tuleva toteutus):**
`estimated_value_eur = Σ (puulajikohtainen m³ * alueellinen kantohinta €/m³) + maapohjan arvio €`

- Jos saat virheen "npm not recognized" Windows PowerShellissa:
	- aja komennot WSL:n puolella (Ubuntu-terminaali)

- Jos frontend build/dev kaatuu Node-versioon:
	- päivitä Node versioon 20.19+ (tai 22.12+)

---

## Merkintätyypit

| Tyyppi | Kuvaus |
|--------|--------|
| `vesakonhoito` | Vesakonhoito |
| `istutus` | Istutus |
| `harvennus` | Harvennus |
| `avohakkuu` | Avohakkuu |
| `muu_tyo` | Muu työ |

## Geometriatyypit merkinnöille

| Tyyppi | Kuvaus |
|--------|--------|
| `point` | Pistekohde |
| `line` | Viiva/reitti |
| `area` | Alue |
| `note` | Tekstimuistiinpano |

---

## Tietokantataulut

```sql
users (id, email, password_hash, created_at)

properties (
  id, user_id, name,
  property_code TEXT,          -- kiinteistötunnus, esim. 145-410-43-16
  source TEXT DEFAULT 'manual',-- 'manual' | 'cadastre'
  area_ha NUMERIC,             -- pinta-ala hehtaareissa (valinnainen)
  geometry GEOMETRY(4326),     -- PostGIS-polygoni
  created_at, updated_at
)
-- Uniikki rajoite: sama käyttäjä ei voi tallentaa samaa kiinteistötunnusta kahdesti
-- UNIQUE INDEX (user_id, property_code) WHERE property_code IS NOT NULL

markings (
  id, user_id,
  property_id INTEGER,         -- viittaa properties.id (SET NULL jos kiinteistö poistetaan)
  type VARCHAR(50),            -- vesakonhoito | istutus | harvennus | avohakkuu | muu_tyo
  geometry_type VARCHAR(20),   -- point | line | area | note
  title, description,
  geometry GEOMETRY(4326),     -- PostGIS-geometria
  created_at, updated_at
)
```

---

## Docker – koko sovellus kerralla

```bash
cd forest-care-app
docker-compose up
```

Tämä käynnistää tietokannan ja backendin. Frontend käynnistetään erikseen `npm run dev`:llä kehitysvaiheessa.

---

## Vercel & Production Deployment

### Yleiskatsaus

Metsuri-sovellus voidaan deployata tuotantoon seuraavalla tavalla:

- **Frontend**: [Vercel](https://vercel.com) (React + Vite)
- **Backend**: [Railway](https://railway.app), [Render](https://render.com), tai [Fly.io](https://fly.io) (Node.js + Express)
- **Database**: [Neon](https://neon.tech), [Supabase](https://supabase.com), tai [AWS RDS](https://aws.amazon.com/rds/) (PostgreSQL + PostGIS)

**Katso yksityiskohtaiset ohjeet**: [DEPLOYMENT.md](./DEPLOYMENT.md)

### Yleisimmät Vercel-ongelmat

| Ongelma | Syy | Ratkaisu |
|---------|-----|----------|
| **404 /map ja muista React Router -reiteistä** | Vercel ei tiedä SPA-rewritingistä | Tarkista `frontend/vercel.json` on olemassa ja sisältää rewrite-säännöt |
| **"VITE_API_URL is missing" konsolissa** | Environment variable ei asetettu | Lisää `VITE_API_URL` Vercelin Environment Variables -kohtaan |
| **Frontend latautuu mutta API-kutsut eivät toimi** | Väärä backend URL tai backend pois käytöstä | Varmista `VITE_API_URL` osoittaa oikeaan backendiin (ei localhost:3001) |
| **Kirjautuminen epäonnistuu** | Backend ei ole julkisesti saavutettavissa tai CORS-virhe | Varmista backend-palvelun URL on olemassa ja `FRONTEND_URL` backendissa osoittaa Vercel-domainiin |
| **"Cannot read property 'token'" login jälkeen** | Backend API ei vastaa | Tarkista backend-palvelun status: `curl https://your-backend-url/api/health` |
| **CORS-virhe: "Not allowed by CORS"** | Backend ei tunne Vercel-domainia | Aseta backendissa `FRONTEND_URL=https://your-domain.vercel.app` |
| **Frontend build epäonnistuu Vercelissä** | TypeScript-virhe tai väärä build-komento | Varmista `npm run build` onnistuu paikallisesti (`npm run build` → `tsc -b && vite build`) |

### Quick Start – Deployment Checklist

**Frontend (Vercel)**:
1. Yhdistä GitHub repository Verceliin
2. Root Directory: `frontend`
3. Framework: `Vite`
4. Build Command: `npm run build`
5. Environment Variable: `VITE_API_URL=https://your-backend-url.com`
6. Deploy ✓

**Backend (Railway/Render/Fly.io)**:
1. Yhdistä GitHub repository palveluun
2. Root Directory: `backend`
3. Build Command: `npm install && npm run build`
4. Start Command: `npm start`
5. Environment Variables:
   - `DATABASE_URL` (production PostgreSQL + PostGIS)
   - `JWT_SECRET` (vahva salasana)
   - `FRONTEND_URL` (Vercel-domain)
   - `MML_API_KEY` (valinnainen)
6. Deploy ✓

**Database**:
1. Luo PostgreSQL-instanssi (PostgreSQL 13+)
2. Ota PostGIS-extension käyttöön: `CREATE EXTENSION postgis;`
3. Aja migraatiot: `npm run migrate`
4. Kopioi connection string → `DATABASE_URL` backendissa

### Production Best Practices

1. **Salasanaturvallisuus**:
   - Käytä vahvoja salasanoja (JWT_SECRET vähintään 32 merkkiä)
   - Älä laita salasanoja version controliin
   - Kierrätä salasanoja säännöllisesti

2. **HTTPS**:
   - Vercel tarjoaa HTTPS automaattisesti
   - Backend-palvelun pitää käyttää HTTPS:ää
   - Database-yhteys suojaa SSL-sertifikaatilla

3. **Monitoring**:
   - Seuraa backend-logia deployment-palvelun dashboardissa
   - Tarkista database-logi säännöllisesti
   - Ota error tracking käyttöön (esim. Sentry)

4. **Backups**:
   - Database-backup päivittäin (useimmat pilvipalvelut tekevät tämän automaattisesti)
   - Testaa restoration säännöllisesti

5. **Seuranta**:
   - Frontend: Vercel Analytics (automaattinen)
   - Backend: Deployment-palvelun CPU/memory -seuranta
   - Database: Connection pooling ja query performance

Yksityiskohtaisemmat ohjeet: **[DEPLOYMENT.md](./DEPLOYMENT.md)**


## Haaramalli (Branch workflow)

Projektissa käytetään seuraavaa haaramallia (Branch workflow):

1. Jokainen ryhmän jäsen tekee muutoksensa omaan, jäsenen mukaan nimettyyn `henkilökohtaiseen haaraan`.
2. `Henkilökohtaiset haarat` yhdistetään `dev`-haaraan, jossa muutokset integroidaan.
3. Kun kokonaisuus on valmis testattavaksi, `dev` yhdistetään `pre-main`-haaraan. Siellä testataan lähes valmis kokonaisuus.
4. Kun `pre-main`-haaran testit menevät läpi, se voidaan yhdistää `main`-haaraan. `main` on tuotantohaara.

Vain projektin johtajalla on oikeus tehdä haarojen yhdistämisiä. Tämä koskee kaikkia yllä kuvattuja yhdistämisiä.

## Yhteiset koodauskäytännöt

Näitä vähimmäiskäytäntöjä noudatetaan kaikessa projektin kehitystyössä.

### Koodin kirjoittaminen

- Tee yksi rajattu, yhtenäinen muutos kerrallaan. Suosi olemassa olevia rakenteita, apufunktioita ja nimeämistapoja uuden rinnakkaisen ratkaisun sijaan.
- Kirjoita koodi TypeScriptillä ja määrittele tyypit niin, että virheelliset arvot ja tilanteet huomataan. Vältä `any`-tyyppiä ja tyyppivirheiden ohittamista.
- Pidä käyttöliittymän komponentit, API-kutsut ja palvelinpuolen liiketoimintalogiikka omissa nykyisten projektikäytäntöjen mukaisissa kerroksissaan.
- Näytä virhetilanteet selkeästi. Älä peitä virheitä tyhjillä tai oletusarvoisilla onnistumisvastauksilla.
- Säilytä käyttöliittymän suomenkieliset tekstit ja responsiivinen toiminta.
- Kysy projektiryhmältä ennen uuden riippuvuuden tai ulkoisen palvelun lisäämistä.
- Älä lisää salasanoja, API-avaimia tai muita salaisuuksia koodiin tai versionhallintaan. Käytä ympäristömuuttujia.
- Jos muutos vaikuttaa tietokannan rakenteeseen, päivitä tietokannan skeema ja tarvittavat migraatiot projektin nykyisen käytännön mukaisesti.
- Päivitä tähän liittyvä dokumentaatio, kun toiminta tai käyttöönotto-ohje muuttuu.

### Tietoturva ja metsätiedot

- Tarkista kirjautuminen ja käyttäjän oikeus käsitellä pyydettyä kiinteistöä tai merkintää palvelimella; käyttöliittymän piilotus ei yksin riitä käyttöoikeuden tarkistukseksi.
- Käytä tietokantakyselyissä parametrisoituja arvoja. Älä liitä käyttäjän syötettä suoraan SQL-kyselyyn.
- Käsittele paikkatietoja ja mittayksiköitä johdonmukaisesti nykyisten GeoJSON-, koordinaatti- ja pinta-alakäytäntöjen mukaisesti.
- Älä esitä paikkamerkki-, mock- tai alustavia metsänhoitosuosituksia varmennettuina tietoina. Älä keksi metsäalan sääntöjä; varmista vaatimukset ennen niiden toteuttamista.

### Tarkistukset ja muutosten toimittaminen

- Aja muutokseen sopivat tarkistukset ennen kuin pyydät sen yhdistämistä:
  - Frontend: `cd frontend && npm run lint` ja `npm run build`
  - Backend: `cd backend && npm run build`
- Testaa muutettu käyttöliittymätoiminto tai API-kulku käsin, jos paikallinen ympäristö on käytettävissä. Kerro selkeästi, jos tarkistusta ei voitu ajaa.
- Älä ilmoita testien menneen läpi, ellei niitä ole ajettu. Pakettien nykyisissä `package.json`-tiedostoissa ei ole automaattista testikomentoa.
- Tee commit-viestistä lyhyt ja kuvaava; käytä etuliitettä `feat`, `fix` tai `chore` muutoksen luonteen mukaan.
- Noudata yllä kuvattua haaramallia. Tee muutokset omassa henkilökohtaisessa haarassasi ja jätä haarojen yhdistäminen projektin johtajalle.