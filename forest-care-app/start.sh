#!/usr/bin/env bash
# Metsuri – koko sovelluksen käynnistys yhdellä komennolla.
#
#   ./start.sh          Käynnistä tietokanta, backend ja frontend (Ctrl+C sammuttaa)
#   ./start.sh phone    Sama, mutta avattavissa puhelimella samasta WLANista (HTTPS, GPS toimii)
#   ./start.sh stop     Pysäytä tietokantakontti
#   ./start.sh seed     Luo testitunnukset admin@metsuri.test ja yrittaja@metsuri.test
#   ./start.sh reset-db Tyhjennä tietokanta ja luo testitunnukset (kysyy vahvistuksen)
#
# Ensimmäisellä ajokerralla skripti luo .env-tiedostot esimerkeistä,
# asentaa npm-riippuvuudet ja ajaa migraatiot.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
MIN_NODE_MAJOR=20
MIN_NODE_MINOR=19

info()  { printf '\033[0;32m▶ %s\033[0m\n' "$*"; }
warn()  { printf '\033[0;33m! %s\033[0m\n' "$*"; }
fail()  { printf '\033[0;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

# --- Työkalut --------------------------------------------------------------

load_node() {
  # nvm ladataan vain interaktiivisessa shellissä, joten ladataan se itse.
  if ! command -v node >/dev/null 2>&1 || [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    # shellcheck disable=SC1091
    [[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh" && nvm use --silent default >/dev/null 2>&1 || true
  fi
  command -v node >/dev/null 2>&1 || fail "Node.js puuttuu. Asenna Node $MIN_NODE_MAJOR.$MIN_NODE_MINOR+ (esim. nvm install --lts)."
  command -v npm  >/dev/null 2>&1 || fail "npm puuttuu."

  local ver major minor
  ver="$(node -v | sed 's/^v//')"
  major="${ver%%.*}"
  minor="$(echo "$ver" | cut -d. -f2)"
  if (( major < MIN_NODE_MAJOR || (major == MIN_NODE_MAJOR && minor < MIN_NODE_MINOR) )); then
    fail "Node $ver on liian vanha. Tarvitaan $MIN_NODE_MAJOR.$MIN_NODE_MINOR+ (nvm install --lts)."
  fi
  info "Node $ver"
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose -f "$ROOT/docker-compose.yml" "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$ROOT/docker-compose.yml" "$@"
  else
    fail "Docker Compose puuttuu."
  fi
}

check_docker() {
  command -v docker >/dev/null 2>&1 || fail "Docker puuttuu."
  docker info >/dev/null 2>&1 || fail "Docker ei ole käynnissä. Käynnistä Docker Desktop ja yritä uudelleen."
}

check_ports() {
  local port
  for port in 3001 5173; do
    if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
      fail "Portti $port on jo käytössä – onko sovellus jo käynnissä toisessa terminaalissa?"
    fi
  done
}

# --- Vaiheet ---------------------------------------------------------------

ensure_env() {
  local dir="$1"
  if [[ ! -f "$dir/.env" ]]; then
    cp "$dir/.env.example" "$dir/.env"
    info "Luotiin $(basename "$dir")/.env esimerkistä"
    # Korvataan esimerkin JWT-salaisuus satunnaisella arvolla.
    if grep -q '^JWT_SECRET=' "$dir/.env"; then
      local secret
      secret="$(head -c 48 /dev/urandom | base64 | tr -d '/+=\n')"
      sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$secret|" "$dir/.env"
    fi
  fi
}

ensure_deps() {
  local dir="$1" name
  name="$(basename "$dir")"
  # Asennetaan, jos node_modules puuttuu tai package-lock.json on muuttunut asennuksen jälkeen.
  if [[ ! -d "$dir/node_modules" ]] || [[ "$dir/package-lock.json" -nt "$dir/node_modules/.package-lock.json" ]]; then
    info "Asennetaan $name-riippuvuudet..."
    (cd "$dir" && npm install --no-fund --no-audit)
  fi
}

start_db() {
  info "Käynnistetään tietokanta ja sähköpostin testipalvelin (Mailpit)..."
  compose up -d --wait db mailpit
}

migrate() {
  info "Ajetaan migraatiot..."
  (cd "$BACKEND" && npm run --silent migrate)
}

ensure_seed_password() {
  # Testitunnusten salasana backend/.env:iin (SEED_PASSWORD), arvotaan jos puuttuu.
  if ! grep -qE '^SEED_PASSWORD=.{8,}' "$BACKEND/.env"; then
    local password
    password="$(head -c 12 /dev/urandom | base64 | tr -d '/+=\n' | head -c 12)"
    if grep -q '^SEED_PASSWORD=' "$BACKEND/.env"; then
      sed -i "s|^SEED_PASSWORD=.*|SEED_PASSWORD=$password|" "$BACKEND/.env"
    else
      printf '\nSEED_PASSWORD=%s\n' "$password" >> "$BACKEND/.env"
    fi
    info "Arvottiin testitunnusten salasana backend/.env-tiedostoon (SEED_PASSWORD)"
  fi
}

seed() {
  ensure_seed_password
  info "Luodaan testitunnukset..."
  (cd "$BACKEND" && npm run --silent seed)
  echo "    Salasana: grep SEED_PASSWORD backend/.env  (vaihda halutessasi ja aja ./start.sh seed)"
}

# Koneen osoite WLANissa. WSL2:n oletusverkossa (NAT) näkyy vain sisäinen 172.x-osoite,
# jolloin puhelin ei tavoita konetta – silloin tarvitaan mirrored-verkkotila.
lan_ip() {
  # 10.255.255.254 on WSL:n sisäinen DNS-osoite, ei koneen verkko-osoite
  hostname -I | tr ' ' '\n' | grep -E '^(192\.168\.|10\.)' | grep -v '^10\.255\.255\.254$' | head -1 || true
}

ensure_dev_cert() {
  local ip="$1" dir="$FRONTEND/.cert"
  if [[ -f "$dir/cert.pem" && "$(cat "$dir/ip" 2>/dev/null)" == "$ip" ]]; then return; fi
  command -v openssl >/dev/null 2>&1 || fail "openssl puuttuu (sudo apt install openssl)."
  mkdir -p "$dir"
  info "Luodaan HTTPS-kehityssertifikaatti osoitteelle $ip..."
  openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=metsuri-dev" \
    -addext "subjectAltName=IP:$ip,IP:127.0.0.1,DNS:localhost" \
    -keyout "$dir/key.pem" -out "$dir/cert.pem" >/dev/null 2>&1
  echo "$ip" > "$dir/ip"
}

run_servers() {
  # Lisäargumentit välitetään Vitelle (esim. --host puhelintilassa)
  local vite_args=("$@")
  local pids=()
  cleanup() {
    trap - INT TERM EXIT
    echo
    info "Sammutetaan kehityspalvelimet..."
    info "Tietokanta jäi käyntiin. Pysäytä: ./start.sh stop"
    # Lopetetaan koko prosessiryhmä, jotta myös npm:n lapsiprosessit (vite, ts-node-dev) sammuvat.
    kill 0 2>/dev/null || true
  }
  trap cleanup INT TERM EXIT

  (cd "$BACKEND"  && npm run dev 2>&1 | sed -u 's/^/\x1b[0;36m[backend]\x1b[0m  /') &
  pids+=($!)
  (cd "$FRONTEND" && npm run dev -- --strictPort "${vite_args[@]}" 2>&1 | sed -u 's/^/\x1b[0;35m[frontend]\x1b[0m /') &
  pids+=($!)

  echo
  info "Sovellus käynnistyy:"
  if [[ -n "${PHONE_URL:-}" ]]; then
    echo "    Puhelimella: $PHONE_URL   (sama WLAN; hyväksy selaimen varoitus itse tehdystä sertifikaatista)"
    echo "    Koneella:    https://localhost:5173"
  else
    echo "    Frontend: http://localhost:5173"
  fi
  echo "    Backend:  http://localhost:3001/health"
  echo "    Sähköpostit (Mailpit): http://localhost:8025"
  echo "    Sammuta:  Ctrl+C"
  echo

  # Jos kumpi tahansa palvelin kaatuu, sammutetaan molemmat.
  wait -n "${pids[@]}" || true
  warn "Palvelin pysähtyi."
}

# --- Komennot --------------------------------------------------------------

prepare() {
  check_docker
  load_node
  ensure_env "$BACKEND"
  ensure_env "$FRONTEND"
  ensure_deps "$BACKEND"
  ensure_deps "$FRONTEND"
  start_db
  migrate
}

cmd_start() {
  check_ports
  prepare
  run_servers
}

cmd_phone() {
  check_ports
  local ip
  ip="$(lan_ip)"
  if [[ -z "$ip" ]]; then
    warn "Koneen WLAN-osoitetta ei näy WSL:ssä, joten puhelin ei tavoita sovellusta."
    echo "    Ota WSL:n mirrored-verkkotila käyttöön (kerran), ks. README: 'Testaus puhelimella'."
    exit 1
  fi
  ensure_dev_cert "$ip"
  export METSURI_DEV_CERT_DIR="$FRONTEND/.cert"
  PHONE_URL="https://$ip:5173"
  prepare
  run_servers --host 0.0.0.0
}

cmd_seed() {
  prepare
  seed
}

cmd_stop() {
  check_docker
  info "Pysäytetään tietokanta..."
  compose stop
}

cmd_reset_db() {
  check_docker
  read -r -p "Poistetaanko tietokanta ja KAIKKI sen data (kaikki käyttäjät, palstat, merkinnät)? Kirjoita 'kyllä': " answer
  [[ "$answer" == "kyllä" ]] || { info "Peruttu."; exit 0; }
  compose down -v
  info "Tietokanta tyhjennetty."
  prepare
  seed
}

case "${1:-start}" in
  start)    cmd_start ;;
  phone)    cmd_phone ;;
  stop)     cmd_stop ;;
  seed)     cmd_seed ;;
  reset-db) cmd_reset_db ;;
  -h|--help|help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) fail "Tuntematon komento: $1 (käytä: start | phone | stop | seed | reset-db)" ;;
esac
