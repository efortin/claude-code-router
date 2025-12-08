#!/bin/bash

# Validation script for Claude Code Router
# This script checks compilation, tests, and build

set -e  # Exit on error

echo "======================================"
echo "Claude Code Router - Validation"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for pnpm
echo "Checking for pnpm..."
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}✗ pnpm not found${NC}"
    echo "Install with: npm install -g pnpm"
    exit 1
fi
echo -e "${GREEN}✓ pnpm found${NC}"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠ node_modules not found. Running pnpm install...${NC}"
    pnpm install
    echo ""
fi

# TypeScript compilation check
echo "Checking TypeScript compilation..."
if npx tsc --noEmit; then
    echo -e "${GREEN}✓ TypeScript compilation successful${NC}"
else
    echo -e "${RED}✗ TypeScript compilation failed${NC}"
    exit 1
fi
echo ""

# Linting
echo "Running linter..."
if npm run lint; then
    echo -e "${GREEN}✓ Linting passed${NC}"
else
    echo -e "${RED}✗ Linting failed${NC}"
    exit 1
fi
echo ""

# Unit tests
echo "Running unit tests..."
if npm test; then
    echo -e "${GREEN}✓ Unit tests passed${NC}"
else
    echo -e "${RED}✗ Unit tests failed${NC}"
    exit 1
fi
echo ""

# Build
echo "Building project..."
if npm run build; then
    echo -e "${GREEN}✓ Build successful${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi
echo ""

# Check if dist directory was created
if [ -d "dist" ] && [ -f "dist/cli.js" ]; then
    echo -e "${GREEN}✓ Build artifacts created${NC}"
else
    echo -e "${RED}✗ Build artifacts not found${NC}"
    exit 1
fi
echo ""

# Integration tests (optional, with warning)
echo -e "${YELLOW}Integration tests require network connection and may be slow...${NC}"
read -p "Run integration tests? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Running integration tests..."
    if npm run test:integration; then
        echo -e "${GREEN}✓ Integration tests passed${NC}"
    else
        echo -e "${YELLOW}⚠ Integration tests failed (may be network related)${NC}"
    fi
    echo ""
fi

echo "======================================"
echo -e "${GREEN}✓ Validation complete!${NC}"
echo "======================================"
echo ""
echo "Summary:"
echo "  ✓ TypeScript compilation"
echo "  ✓ Linting"
echo "  ✓ Unit tests"
echo "  ✓ Build"
echo ""
echo "Ready to commit! 🚀"
