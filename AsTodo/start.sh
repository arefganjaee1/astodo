#!/bin/bash

# ╔══════════════════════════════════════════════╗
# ║           AsTodo - Setup Script              ║
# ╚══════════════════════════════════════════════╝

GREEN='\033[0;32m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RESET='\033[0m'

echo ""
echo -e "${PURPLE}  ✦ AsTodo Setup${RESET}"
echo -e "${CYAN}  ─────────────────────────────${RESET}"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo -e "${YELLOW}⚠ Node.js not found!${RESET}"
  echo "  Install from: https://nodejs.org"
  exit 1
fi

echo -e "${GREEN}✓${RESET} Node.js $(node -v) found"

# Install dependencies
echo ""
echo "  Installing dependencies..."
cd "$(dirname "$0")/server"
npm install --silent

if [ $? -ne 0 ]; then
  echo "✗ npm install failed"
  exit 1
fi

echo -e "${GREEN}✓${RESET} Dependencies installed"
echo ""
echo -e "${CYAN}  ─────────────────────────────${RESET}"
echo -e "${GREEN}  🚀 Starting AsTodo...${RESET}"
echo -e "${CYAN}  ─────────────────────────────${RESET}"
echo ""

node index.js
