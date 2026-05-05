# Metsuri – Metsänhoitosovellus MVP

Metsänhoitokarttasovellus web- ja mobiilikäyttöön.

## Teknologiat

| Kerros | Teknologia |
|--------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Kartta | Leaflet + leaflet-draw |
| Backend | Node.js + Express + TypeScript |
| Tietokanta | PostgreSQL + PostGIS |
| Tiedonsiirto | GeoJSON |
| Autentikointi | JWT (jsonwebtoken + bcryptjs) |

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
| PUT | `/api/properties/:id` | Päivitä kiinteistö |
| DELETE | `/api/properties/:id` | Poista kiinteistö |

### Karttamerkinnät
| Metodi | Polku | Kuvaus |
|--------|-------|--------|
| GET | `/api/markings` | Hae kaikki merkinnät |
| POST | `/api/markings` | Luo merkintä |
| PUT | `/api/markings/:id` | Päivitä merkintä |
| DELETE | `/api/markings/:id` | Poista merkintä |

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
properties (id, user_id, name, geometry[PostGIS], created_at)
markings (id, user_id, property_id, type, geometry_type, title, description, geometry[PostGIS], created_at, updated_at)
```

---

## Docker – koko sovellus kerralla

```bash
cd forest-care-app
docker-compose up
```

Tämä käynnistää tietokannan ja backendin. Frontend käynnistetään erikseen `npm run dev`:llä kehitysvaiheessa.
