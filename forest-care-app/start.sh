#!/usr/bin/env bash
# Metsuri – koko sovelluksen käynnistys yhdellä komennolla.
#
#   ./start.sh          Käynnistä tietokanta, backend ja frontend (Ctrl+C sammuttaa)
#   ./start.sh stop     Pysäytä tietokantakontti
#   ./start.sh reset-db Poista tietokanta ja sen data kokonaan (kysyy vahvistuksen)
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
  info "Käynnistetään tietokanta..."
  compose up -d --wait db
}

migrate() {
  info "Ajetaan migraatiot..."
  (cd "$BACKEND" && npm run --silent migrate)
}

run_servers() {
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
  (cd "$FRONTEND" && npm run dev -- --strictPort 2>&1 | sed -u 's/^/\x1b[0;35m[frontend]\x1b[0m /') &
  pids+=($!)

  echo
  info "Sovellus käynnistyy:"
  echo "    Frontend: http://localhost:5173"
  echo "    Backend:  http://localhost:3001/health"
  echo "    Sammuta:  Ctrl+C"
  echo

  # Jos kumpi tahansa palvelin kaatuu, sammutetaan molemmat.
  wait -n "${pids[@]}" || true
  warn "Palvelin pysähtyi."
}

# --- Komennot --------------------------------------------------------------

cmd_start() {
  check_docker
  check_ports
  load_node
  ensure_env "$BACKEND"
  ensure_env "$FRONTEND"
  ensure_deps "$BACKEND"
  ensure_deps "$FRONTEND"
  start_db
  migrate
  run_servers
}

cmd_stop() {
  check_docker
  info "Pysäytetään tietokanta..."
  compose stop
}

cmd_reset_db() {
  check_docker
  read -r -p "Poistetaanko tietokanta ja KAIKKI sen data? Kirjoita 'kyllä': " answer
  [[ "$answer" == "kyllä" ]] || { info "Peruttu."; exit 0; }
  compose down -v
  info "Tietokanta poistettu. Seuraava ./start.sh luo sen uudelleen."
}

case "${1:-start}" in
  start)    cmd_start ;;
  stop)     cmd_stop ;;
  reset-db) cmd_reset_db ;;
  -h|--help|help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) fail "Tuntematon komento: $1 (käytä: start | stop | reset-db)" ;;
esac
