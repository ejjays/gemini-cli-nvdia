#!/bin/bash
# Gemini CLI NVIDIA - Professional Installer

# Colors
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}${BOLD}▝▜▄  Gemini CLI NVIDIA Installer${NC}"
echo -e "${BLUE}---------------------------------${NC}"

# Check dependencies
for cmd in node npm git; do
    if ! command -v $cmd &> /dev/null; then
        echo -e "${RED}❌ Error: $cmd is not installed.${NC}"
        exit 1
    fi
done

echo -e "🧹 ${BOLD}Cleaning up existing installation...${NC}"
npm uninstall -g gemini-cli-nvidia &> /dev/null
npm uninstall -g @mmmbuto/gemini-cli-termux &> /dev/null

# Create a clean build environment
BUILD_DIR="$HOME/.gemini-nvidia-build"
echo -e "📂 ${BOLD}Creating build environment in $BUILD_DIR...${NC}"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo -e "📦 ${BOLD}Cloning repository...${NC}"
if ! git clone --depth 1 https://github.com/ejjays/gemini-cli-nvdia.git "$BUILD_DIR"; then
    echo -e "${RED}❌ Error: Failed to clone repository.${NC}"
    exit 1
fi

cd "$BUILD_DIR" || exit 1

echo -e "🔨 ${BOLD}Building Gemini CLI NVIDIA...${NC}"
echo "This might take a minute. We are optimizing for your device."

# Install dependencies and build
# We use foreground-scripts to ensure build steps aren't blocked by npm security policies
NODE_OPTIONS="--max-old-space-size=4096" npm install --foreground-scripts
npm run build

echo -e "🚀 ${BOLD}Linking global command...${NC}"
# Use the local path to install globally
if npm install -g .; then
    # Final PATH check
    if command -v gemini-nvidia &> /dev/null; then
        echo -e "\n${GREEN}✅ Success! Gemini CLI NVIDIA has been installed.${NC}"
        echo -e "✨ Run ${BOLD}'gemini-nvidia'${NC} from any directory."
    else
        NPM_BIN=$(npm config get prefix)/bin
        echo -e "\n${YELLOW}✅ Installation finished, but PATH needs a quick fix.${NC}"
        echo -e "Run these two commands to activate ${BOLD}'gemini-nvidia'${NC}:"
        echo -e "  echo 'export PATH=\"\$PATH:$NPM_BIN\"' >> ~/.bashrc"
        echo -e "  source ~/.bashrc"
    fi
else
    echo -e "\n${RED}❌ Global link failed.${NC}"
    echo "Try running the script with sudo if you see permission errors."
    exit 1
fi
