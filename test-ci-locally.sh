#!/bin/bash
# Test GitHub Actions CI locally using act

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Testing CI locally with act...${NC}"

# Check if act is installed
if ! command -v act &> /dev/null; then
    echo -e "${RED}act is not installed${NC}"
    echo "Install it with: brew install act"
    echo "Or visit: https://github.com/nektos/act"
    exit 1
fi

echo -e "${GREEN}✓ act is installed${NC}"

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}Docker is not running${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker is running${NC}"

# Run the kind-integration job
echo ""
echo -e "${YELLOW}Running kind-integration job...${NC}"
echo ""

act -j kind-integration \
    --container-architecture linux/amd64 \
    --platform ubuntu-latest=catthehacker/ubuntu:full-latest \
    "$@"

echo ""
echo -e "${GREEN}✓ Test completed${NC}"
