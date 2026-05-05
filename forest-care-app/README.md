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
- Node.js 20+
- Docker ja Docker Compose (tietokantaa varten)

### 1. Käynnistä tietokanta (PostgreSQL + PostGIS)

```bash
cd forest-care-app
docker-compose up db -d
```

### 2. Käynnistä backend

```bash
cd backend
cp .env.example .env   # Muokkaa tarvittaessa
npm install
npm run migrate        # Luo tietokantataulut
npm run dev            # Käynnistä kehityspalvelin portilla 3001
```

### 3. Käynnistä frontend

```bash
cd frontend
cp .env.example .env   # Muokkaa tarvittaessa
npm install
npm run dev            # Käynnistä Vite portilla 5173
```

### 4. Avaa selaimessa

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

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
