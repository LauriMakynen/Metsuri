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
