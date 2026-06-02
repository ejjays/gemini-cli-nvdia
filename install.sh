#!/bin/bash
# Gemini CLI NVIDIA Installer

# Text formatting
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}${BOLD}▝▜▄  Gemini CLI NVIDIA Installer${NC}"
echo -e "${BLUE}---------------------------------${NC}"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js is not installed.${NC}"
    echo "Please install Node.js (v20 or higher) and try again."
    exit 1
fi

# Check for npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ Error: npm is not installed.${NC}"
    exit 1
fi

echo -e "📦 ${BOLD}Fetching and installing packages...${NC}"
echo "This might take a moment depending on your connection."

# Perform global installation
if npm install -g --force https://github.com/ejjays/gemini-cli-nvdia.git; then
    echo -e "\n${GREEN}✅ Success! Gemini CLI NVIDIA has been installed.${NC}"
    echo -e "🚀 Run ${BOLD}'gemini-nvidia'${NC} from any directory to get started."
else
    echo -e "\n${RED}❌ Installation failed.${NC}"
    echo "Try running with sudo if you encounter permission errors:"
    echo "curl -fsSL https://raw.githubusercontent.com/ejjays/gemini-cli-nvdia/main/install.sh | sudo bash"
    exit 1
fi
