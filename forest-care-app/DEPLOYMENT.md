# Metsuri – Deployment Guide

Tämä dokumentaatio kuvaa kuinka deployata Metsuri-sovellus tuotantoon.

## Projektin rakenne

```
forest-care-app/
├── frontend/          # React + Vite (hostaa Vercelissä)
├── backend/           # Node.js + Express (hostaa erillisessä palvelussa)
└── database/          # PostgreSQL + PostGIS (hostaa pilvipalvelimessa)
```

## Architecture

**Frontend**: Vercel  
**Backend**: Railway, Render, Fly.io, tai vastaava Node.js -palvelu  
**Database**: Neon, Supabase, AWS RDS, tai vastaava PostgreSQL + PostGIS -palvelu  

---

## Frontend Deployment – Vercel

### Valmistelu

1. **Frontend-hakemiston kopioiminen**:
   - Siirrä vain `frontend/` hakemisto Verceliin (root directory)
   - Tai käytä monirepositori-konfiguraatiota

2. **Environment Variables** – aseta Vercelin asetuksissa:
   ```
   VITE_API_URL=https://your-backend-url.com
   ```

### Vercel Configuration

**Vercel Project Settings**:
- **Root Directory**: `frontend`
- **Framework Preset**: `Vite`
- **Node.js Version**: `20.x` (suositeltava)

**Build Settings**:
- **Install Command**: `npm install`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Development Command**: `npm run dev`

### Deployment Flow

1. Push to GitHub/GitLab/Bitbucket
2. Vercel triggers automatic build
3. Build command: `npm run build` (runs `tsc -b && vite build`)
4. Output placed in `dist/`
5. Serve from Vercel's CDN

### Health Check

Frontend on käynnissä Vercelissä kun:
- HTTPS-yhteys toimii
- `/` palauttaa HTML
- React sovellus latautuu selaimessa
- API-kutsut menisivät backendiin (ei koneen paikalliselle localhost:3001:lle)

### Troubleshooting

| Ongelma | Syy | Ratkaisu |
|---------|-----|----------|
| 404 /map tai muista React Router -reiteistä | Vercel ei tiedä SPA-rewritingistä | Tarkista `frontend/vercel.json` on olemassa |
| "VITE_API_URL is missing" konsolissa | Environment variable ei asetettu | Lisää `VITE_API_URL` Vercelin Environment Variables -kohtaan |
| Frontend latautuu mutta API-kutsut eivät toimi | Väärä backend URL | Tarkista `VITE_API_URL` osoittaa oikeaan backendiin (ei localhost:3001) |
| Kirjautuminen epäonnistuu | Backend ei ole julkisesti saavutettavissa | Varmista backend-palvelun URL on julkinen ja CORS on konfiguroitu |

---

## Backend Deployment – Railway / Render / Fly.io

### Valmistelu

1. **Klooni repository** tai lataa `backend/` -hakemisto

2. **Environment Variables** – aseta deployment-palvelussa:
   ```
   PORT=3001
   DATABASE_URL=postgresql://user:password@host:5432/forest_care
   JWT_SECRET=your-very-long-random-secret-key-change-this
   JWT_EXPIRES_IN=7d
   FRONTEND_URL=https://metsuri.vercel.app
   MML_API_KEY=your-mml-api-key
   MML_CADASTRE_API_URL=https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3/collections/PalstanSijaintitiedot/items?kiinteistotunnus={propertyCode}
   NODE_ENV=production
   ```

### Railway Configuration

**Railway Project Settings**:

1. Connect GitHub repository
2. Select `backend` root directory
3. Configure environment variables (ks. yllä)
4. Deploy settings:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Node Version**: `20`

### Render Configuration

**Render Service**:

1. Create New → Web Service
2. Connect GitHub
3. Settings:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Node
   - **Node Version**: `20`

4. Set environment variables in Render dashboard

### Fly.io Configuration

1. Install Fly CLI: `brew install flyctl` (macOS) tai `curl -L https://fly.io/install.sh | sh`
2. Login: `flyctl auth login`
3. Create app: `flyctl apps create --name metsuri-backend`
4. Deploy: `flyctl deploy --dockerfile backend/Dockerfile` (jos Dockerfile olemassa)
   tai manuaalinen deployment Fly.io:n hallintapaneelista

---

## Database Deployment – PostgreSQL + PostGIS

### Recommended Services

- **Neon** (Serverless PostgreSQL)
- **Supabase** (PostgreSQL + PostGIS)
- **AWS RDS** (Managed PostgreSQL)
- **Render** (PostgreSQL) + PostGIS extension

### Setup (Neon / Supabase)

1. Create new database
2. Enable PostGIS extension (jos saatavilla)
3. Copy connection string → `DATABASE_URL` backend .env:iin

### Setup (AWS RDS)

1. Launch RDS instance (PostgreSQL)
2. Add PostGIS extension: `CREATE EXTENSION postgis;`
3. Copy connection string → `DATABASE_URL`

### Database Migration

1. Aja migraatiot deployment-palvelussa:
   ```bash
   npm run migrate
   ```
   
   Tai manuaalisti SQL:llä:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
   
   Ja lataa tietokannan rakenne [database/init.sql](../database/init.sql):stä

2. Tarkista migraatiot onnistuivat:
   ```bash
   psql $DATABASE_URL -c "SELECT * FROM pg_tables WHERE tablename = 'users';"
   ```

---

## Täydellinen Deployment Checklist

### Before Deployment

- [ ] Backend build onnistuu: `cd backend && npm run build`
- [ ] Frontend build onnistuu: `cd frontend && npm run build`
- [ ] Backend local testing: `npm run dev` toimii
- [ ] Frontend local testing: `npm run dev` toimii
- [ ] TypeScript compilation OK: `npm run tsc` (jos on)
- [ ] Environment variables defined locally (`.env.example` matches actual `.env`)

### Frontend (Vercel)

- [ ] GitHub/GitLab/Bitbucket yhdistetty Verceliin
- [ ] `frontend` on root directory
- [ ] `VITE_API_URL` asetettu Environment Variablesissa
- [ ] Build command oikea: `npm run build`
- [ ] `frontend/vercel.json` on olemassa (SPA rewriting)
- [ ] Test deploy: aja build ja preview paikallisesti `npm run preview`

### Backend (Railway/Render/Fly.io)

- [ ] Repository yhdistetty deployment-palveluun
- [ ] `backend` on root directory
- [ ] `DATABASE_URL` asetettu (production database)
- [ ] `JWT_SECRET` muutettu (ei example-arvo)
- [ ] `FRONTEND_URL` asetettu oikeaan Vercel-domainiin
- [ ] `NODE_ENV=production` asetettu
- [ ] Build command: `npm install && npm run build`
- [ ] Start command: `npm start`
- [ ] Node version: `20.x` tai korkeampi
- [ ] Test endpoint: `curl https://your-backend-url/api/health`

### Database

- [ ] PostgreSQL + PostGIS luotu
- [ ] `DATABASE_URL` environment variable asetettu
- [ ] Database migration aja: `npm run migrate`
- [ ] Tarkista taulut: `psql $DATABASE_URL -c "\dt"`

### Testing

- [ ] Frontend latautuu Vercelissä ✓
- [ ] React Router reitit toimivat (/map, /login, /register) ✓
- [ ] Rekisteröinti toimii → backend API pyyntö lähdetään ✓
- [ ] Kirjautuminen toimii → JWT-token saadaan ✓
- [ ] Suojattu data latautuu (properties, markings) ✓
- [ ] API health check: `curl https://your-backend-url/api/health` ✓
- [ ] CORS-virheet eivät esiinny selaimen konsolissa ✓
- [ ] JWT-token refresh toimii (jos implementoitu) ✓

---

## Environment Variables Summary

### Frontend (.env)
```
VITE_API_URL=https://your-backend-url.com
VITE_MML_API_KEY=optional-mml-key
```

### Backend (.env)
```
PORT=3001
DATABASE_URL=postgresql://user:pass@host:5432/db
JWT_SECRET=long-random-secret-key
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://metsuri.vercel.app
MML_API_KEY=your-mml-api-key
MML_CADASTRE_API_URL=https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3/collections/PalstanSijaintitiedot/items?kiinteistotunnus={propertyCode}
NODE_ENV=production
```

---

## Production Best Practices

1. **Salasanaturvallisuus**:
   - Käytä vahvoja salasanoja (JWT_SECRET vähintään 32 merkkiä)
   - Älä kovakoodaa salasanoja koodin sisään
   - Kierrätä salasanoja säännöllisesti

2. **HTTPS**:
   - Vercel tarjoaa HTTPS automaattisesti
   - Backend-palvelun pitää käyttää HTTPS:ää (Vercel <-> Backend)
   - Database-yhteys voi olla private network tai SSL

3. **Monitoring**:
   - Seuraa backend logia (Railway/Render/Fly.io dashboards)
   - Ota error tracking käyttöön (Sentry, LogRocket)
   - Tarkista database-logi säännöllisesti

4. **Scaling**:
   - Frontend: Vercel skaalaa automaattisesti CDN:n kautta
   - Backend: Valitse scaling-plan deployment-palvelusta (auto-scaling usein mukana)
   - Database: Ota seuranta käyttöön query-performance ja connection pooling

5. **Backups**:
   - Database-backupit on oltava päivittäin (useimmat pilvipalvelut tekevät tämän automaattisesti)
   - Testaa restoration prosessi säännöllisesti

---

## Troubleshooting Common Issues

### Frontend (Vercel)

**Q: "VITE_API_URL is missing" näkyy selaimen konsolissa**
- A: Lisää `VITE_API_URL` Vercelin Environment Variables -osioon

**Q: React Router reitit antavat 404**
- A: Tarkista että `frontend/vercel.json` on olemassa ja sisältää rewrite-säännöt

**Q: "Cannot read property 'token' of undefined" login jälkeen**
- A: Backend API ei vastaa. Tarkista:
  - Backend on käynnissä ja julkisesti saavutettavissa
  - `VITE_API_URL` osoittaa oikeaan backendiin (ei localhost)
  - CORS on konfiguroitu backendissä

### Backend (Railway/Render/Fly.io)

**Q: Database connection fails**
- A: Tarkista `DATABASE_URL` on oikein asetettu ja yhdistää oikeaan tietokantaan

**Q: "JWT_SECRET must be a string"**
- A: `JWT_SECRET` pitää olla asetettu (ei tyhjä). Käytä generaattoria: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

**Q: CORS errors from frontend**
- A: Tarkista backend/.env:
  - `FRONTEND_URL` pitää olla asetettu oikeaan Vercel-domainiin
  - Backend käynnistyi uudelleen muutoksen jälkeen

### Database

**Q: PostGIS extension not found**
- A: Laita palvelua tarjoava yritys tukeen. Jotkut palvelut eivät tue PostGIS:ä

**Q: Migraatio epäonnistui**
- A: Aja migraatio manuaalisesti tai ota tietokanta-backup ja yritä uudelleen

---

## Maintenance & Updates

### Frontend Updates

1. Tee muutokset `frontend/` -hakemistoon
2. Push GitHub/GitLab/Bitbucket:iin
3. Vercel build triggers automaattisesti
4. Testaa: https://metsuri.vercel.app

### Backend Updates

1. Tee muutokset `backend/` -hakemistoon
2. Push GitHub:iin
3. Railway/Render/Fly.io build triggers automaattisesti
4. Testaa: https://api.yourdomain.com/api/health

### Database Migrations

1. Luo uusi migraatiotiedosto: `database/migrations/NNN_description.sql`
2. Testaa paikallisesti
3. Aja productionissa: `npm run migrate` (tai deployment-palvelun kautta)

---

## Useful Links

- [Vercel Docs](https://vercel.com/docs)
- [Railway Docs](https://docs.railway.app)
- [Render Docs](https://render.com/docs)
- [Fly.io Docs](https://fly.io/docs)
- [Neon Docs](https://neon.tech/docs)
- [Supabase Docs](https://supabase.com/docs)
- [PostGIS Documentation](https://postgis.net/documentation/)

