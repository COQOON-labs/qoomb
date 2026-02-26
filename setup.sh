#!/bin/bash

# ==============================================================================
# Qoomb Setup Script
# ==============================================================================
# Delegates to the justfile which contains all setup logic.
# This script exists as a convenience entry point.
# ==============================================================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}"
cat << "EOF"
   __ _  ___   ___  _ __ ___  | |__
  / _` |/ _ \ / _ \| '_ ` _ \ | '_ \
 | (_| | (_) | (_) | | | | | || |_) |
  \__, |\___/ \___/|_| |_| |_||_.__/
     |_|

   Setup Script
EOF
echo -e "${NC}"

# Check for just
if ! command -v just >/dev/null 2>&1; then
    echo -e "${RED}✗ 'just' is not installed.${NC}"
    echo ""
    echo -e "${BLUE}Install just:${NC}"
    echo "  macOS:  brew install just"
    echo "  Linux:  cargo install just  OR  https://github.com/casey/just#installation"
    echo ""
    echo "Then run:  just setup"
    exit 1
fi

exec just setup
