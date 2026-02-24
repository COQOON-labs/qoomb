#!/bin/bash

# ==============================================================================
# Qoomb Setup Script
# ==============================================================================
# Automatisches Setup für Entwicklungsumgebung
# Führt alle notwendigen Schritte aus, um Qoomb zu starten
# ==============================================================================

set -e  # Exit on error

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funktionen
print_header() {
    echo -e "\n${BLUE}════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Header
clear
echo -e "${GREEN}"
cat << "EOF"
   __ _  ___   ___  _ __ ___  | |__
  / _\` |/ _ \ / _ \| '_ \` _ \ | '_ \
 | (_| | (_) | (_) | | | | | || |_) |
  \__, |\___/ \___/|_| |_| |_||_.__/
     |_|

   Setup Script - Development Environment
EOF
echo -e "${NC}"

print_info "Dieser Script richtet die Qoomb Entwicklungsumgebung ein."
print_info "Dauert ca. 2-3 Minuten.\n"

# Check prerequisites
print_header "STEP 0: Überprüfe Voraussetzungen"

command -v docker >/dev/null 2>&1 || {
    print_error "Docker ist nicht installiert!"
    print_info "Bitte installiere Docker: https://docs.docker.com/get-docker/"
    exit 1
}
print_success "Docker gefunden: $(docker --version | cut -d' ' -f3)"

command -v pnpm >/dev/null 2>&1 || {
    print_error "pnpm ist nicht installiert!"
    print_info "Bitte installiere pnpm: npm install -g pnpm"
    exit 1
}
print_success "pnpm gefunden: $(pnpm --version)"

command -v node >/dev/null 2>&1 || {
    print_error "Node.js ist nicht installiert!"
    print_info "Bitte installiere Node.js: https://nodejs.org/"
    exit 1
}
print_success "Node.js gefunden: $(node --version)"

# Check .env
if [ ! -f .env ]; then
    print_error ".env Datei nicht gefunden!"
    print_info "Bitte führe zuerst die .env Konfiguration durch."
    exit 1
fi
print_success ".env Datei gefunden"

# JWT Key Check
JWT_PRIV_VAL=$(grep -E '^JWT_PRIVATE_KEY=' .env | sed 's/^JWT_PRIVATE_KEY="\(.*\)"/\1/')
JWT_PUB_VAL=$(grep -E '^JWT_PUBLIC_KEY=' .env | sed 's/^JWT_PUBLIC_KEY="\(.*\)"/\1/')

if [ -z "$JWT_PRIV_VAL" ] || [ -z "$JWT_PUB_VAL" ]; then
    echo ""
    print_warning "JWT_PRIVATE_KEY und JWT_PUBLIC_KEY sind nicht gesetzt."
    print_info "Ohne diese Keys kann die App keine JWT-Tokens signieren und startet nicht."
    echo ""
    read -r -p "$(echo -e "${YELLOW}Jetzt automatisch ein RS256 Key-Pair generieren und in .env eintragen?${NC} [j/N] ")" GENERATE_KEYS
    echo ""
    if [[ "${GENERATE_KEYS:-n}" =~ ^[JjYy]$ ]]; then
        command -v openssl >/dev/null 2>&1 || {
            print_error "openssl ist nicht installiert — Key-Generierung nicht möglich."
            print_info "Bitte manuell generieren (Befehle in .env.example, Abschnitt JWT RS256)."
            exit 1
        }
        print_info "Generiere RS256 Key-Pair (2048 bit)..."
        JWT_TMP=$(mktemp -d)
        openssl genpkey -algorithm RSA -out "$JWT_TMP/private.pem" -pkeyopt rsa_keygen_bits:2048 2>/dev/null
        openssl rsa -pubout -in "$JWT_TMP/private.pem" -out "$JWT_TMP/public.pem" 2>/dev/null
        PRIV_B64=$(base64 -w0 < "$JWT_TMP/private.pem")
        PUB_B64=$(base64 -w0 < "$JWT_TMP/public.pem")
        rm -rf "$JWT_TMP"
        sed -i "s|^JWT_PRIVATE_KEY=.*|JWT_PRIVATE_KEY=\"$PRIV_B64\"|" .env
        sed -i "s|^JWT_PUBLIC_KEY=.*|JWT_PUBLIC_KEY=\"$PUB_B64\"|" .env
        print_success "RS256 Key-Pair generiert und in .env eingetragen"
        print_warning "Die Keys existieren nur in .env — lege ein sicheres Backup an!"
        print_warning "Für Production: eigene Keys generieren und sicher verwalten (siehe docs/SECURITY.md)"
    else
        print_warning "JWT Keys werden nicht generiert."
        print_warning "Die App wird ohne gültige JWT Keys nicht starten können."
        print_info "Befehle zur manuellen Generierung: siehe .env.example (Abschnitt JWT RS256)"
        echo ""
    fi
fi

# Step 1: Start Docker Services
print_header "STEP 1: Docker Services starten"

print_info "Starte PostgreSQL und Redis..."
docker-compose up -d

print_info "Warte bis Services bereit sind..."
sleep 5

# Wait for PostgreSQL
print_info "Warte auf PostgreSQL..."
MAX_TRIES=30
TRIES=0
until docker exec qoomb-postgres pg_isready -U qoomb >/dev/null 2>&1; do
    TRIES=$((TRIES+1))
    if [ $TRIES -ge $MAX_TRIES ]; then
        print_error "PostgreSQL startet nicht. Prüfe Logs mit: docker-compose logs postgres"
        exit 1
    fi
    printf "."
    sleep 1
done
echo ""
print_success "PostgreSQL ist bereit"

# Wait for Redis
print_info "Warte auf Redis..."
TRIES=0
until docker exec qoomb-redis redis-cli ping >/dev/null 2>&1; do
    TRIES=$((TRIES+1))
    if [ $TRIES -ge $MAX_TRIES ]; then
        print_error "Redis startet nicht. Prüfe Logs mit: docker-compose logs redis"
        exit 1
    fi
    printf "."
    sleep 1
done
echo ""
print_success "Redis ist bereit"

# Step 2: Install Dependencies
print_header "STEP 2: Dependencies installieren"

print_info "Installiere pnpm Packages..."
pnpm install --silent

print_success "Dependencies installiert"

# Step 3: Prisma Setup
print_header "STEP 3: Datenbank-Migration"

cd apps/api

print_info "Generiere Prisma Client..."
pnpm prisma generate

print_info "Führe Datenbank-Migration aus..."
pnpm prisma migrate deploy

print_success "Datenbank-Migration erfolgreich"

cd ../..

# Optional: Seed data
echo ""
read -r -p "$(echo -e "${YELLOW}Dev-Seed-Daten installieren?${NC} (john@doe.dev, anna@doe.dev, tim@doe.dev, Passwort: Dev1234!) [j/N] ")" SEED
if [[ "${SEED:-n}" =~ ^[JjYy]$ ]]; then
    print_info "Installiere Seed-Daten..."
    pnpm --filter @qoomb/api db:seed
    print_success "Seed-Daten installiert"
fi

# Step 4: Verify Setup
print_header "STEP 4: Setup überprüfen"

# Check Docker containers
if docker ps | grep -q qoomb-postgres && docker ps | grep -q qoomb-redis; then
    print_success "Docker Containers laufen"
else
    print_error "Docker Containers laufen nicht korrekt"
    exit 1
fi

# Check database connection
if docker exec qoomb-postgres psql -U qoomb -d qoomb -c "SELECT 1" >/dev/null 2>&1; then
    print_success "PostgreSQL Verbindung erfolgreich"
else
    print_error "PostgreSQL Verbindung fehlgeschlagen"
    exit 1
fi

# Check Redis connection
if docker exec qoomb-redis redis-cli ping | grep -q PONG; then
    print_success "Redis Verbindung erfolgreich"
else
    print_error "Redis Verbindung fehlgeschlagen"
    exit 1
fi

# Success!
print_header "✅ SETUP ERFOLGREICH!"

echo -e "${GREEN}"
cat << "EOF"
   ____  _    _  ____ ____ _____ ____  ____
  / ___|| |  | |/ ___/ ___| ____/ ___|/ ___|
  \___ \| |  | | |  | |   |  _| \___ \\___ \
   ___) | |__| | |__| |___| |___ ___) |___) |
  |____/ \____/ \____\____|_____|____/|____/

EOF
echo -e "${NC}"

echo "qoomb Backend ist bereit! 🚀"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📦 Services:"
echo "   PostgreSQL:  http://localhost:5432"
echo "   Redis:       http://localhost:6379"
echo ""
echo "🚀 Nächste Schritte:"
echo ""
echo "   1. Server starten:"
echo "      ${GREEN}just dev${NC}"
echo ""
echo "   2. In neuem Terminal - Server testen:"
echo "      ${GREEN}curl http://localhost:3001/trpc/health${NC}"
echo ""
echo "   3. Datenbank GUI öffnen:"
echo "      ${GREEN}just db-studio${NC}"
echo ""
echo "   4. Dev-Seed-Daten (neu) laden:"
echo "      ${GREEN}just db-seed${NC}"
echo ""
echo "   5. Logs anzeigen:"
echo "      ${GREEN}docker-compose logs -f${NC}"
echo ""
echo "   Alle Befehle:  ${GREEN}just${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📚 Dokumentation:"
echo "   - SETUP.md - Detaillierte Setup-Anleitung"
echo "   - STATUS_REPORT.md - Implementierungs-Status"
echo "   - docs/SECURITY.md - Security-Architektur und JWT-Konfiguration"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
print_info "Bei Problemen siehe SETUP.md Troubleshooting Sektion"
echo ""
