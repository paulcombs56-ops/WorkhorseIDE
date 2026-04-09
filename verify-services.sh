#!/bin/bash
# Workhorse IDE - Service Verification Script
# Checks if all required services are running and accessible

echo "===================================="
echo "Workhorse IDE - Service Status Check"
echo "===================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results
OLLAMA_OK=0
NODE_OK=0
PYTHON_OK=0
ALL_OK=1

echo "Checking services..."
echo ""

# Test Ollama
echo -n "1. Ollama (http://localhost:11434)... "
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Online${NC}"
    OLLAMA_OK=1
    
    # Get model info
    MODELS=$(curl -s http://localhost:11434/api/tags | grep -o '"name":"[^"]*' | head -1 | cut -d'"' -f4)
    if [ ! -z "$MODELS" ]; then
        echo "   Model: $MODELS"
    else
        echo -e "   ${YELLOW}⚠ No models found. Run: ollama pull codellama:7b${NC}"
        ALL_OK=0
    fi
else
    echo -e "${RED}✗ Offline${NC}"
    echo "   Fix: Run 'ollama serve' in a new terminal"
    ALL_OK=0
fi
echo ""

# Test Node Backend
echo -n "2. Node.js Backend (http://localhost:3001)... "
if curl -s http://localhost:3001/api/hello > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Online${NC}"
    NODE_OK=1
else
    echo -e "${RED}✗ Offline${NC}"
    echo "   Fix: Run 'cd backend && node app.js' in a new terminal"
    ALL_OK=0
fi
echo ""

# Test Python AI Backend
echo -n "3. Python AI Backend (http://localhost:8888)... "
if curl -s http://localhost:8888/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Online${NC}"
    PYTHON_OK=1
    
    # Get health status
    HEALTH=$(curl -s http://localhost:8888/health)
    PROVIDER=$(echo $HEALTH | grep -o '"provider":"[^"]*' | head -1 | cut -d'"' -f4)
    MODEL=$(echo $HEALTH | grep -o '"model":"[^"]*' | head -1 | cut -d'"' -f4)
    
    if [ ! -z "$PROVIDER" ]; then
        echo "   Provider: $PROVIDER"
    fi
    if [ ! -z "$MODEL" ]; then
        echo "   Model: $MODEL"
    fi
else
    echo -e "${RED}✗ Offline${NC}"
    echo "   Fix: Run 'cd ai_backend && python main.py' in a new terminal"
    ALL_OK=0
fi
echo ""

# Summary
echo "===================================="
echo "Summary:"
echo "===================================="

if [ $OLLAMA_OK -eq 1 ]; then
    echo -e "Ollama:        ${GREEN}✓${NC}"
else
    echo -e "Ollama:        ${RED}✗${NC}"
fi

if [ $NODE_OK -eq 1 ]; then
    echo -e "Node Backend:  ${GREEN}✓${NC}"
else
    echo -e "Node Backend:  ${RED}✗${NC}"
fi

if [ $PYTHON_OK -eq 1 ]; then
    echo -e "Python Backend:${GREEN}✓${NC}"
else
    echo -e "Python Backend:${RED}✗${NC}"
fi

echo ""

if [ $ALL_OK -eq 1 ]; then
    echo -e "${GREEN}✓ All services are running!${NC}"
    echo ""
    echo "You can now:"
    echo "  1. Open http://localhost:3000 in your browser"
    echo "  2. Click the '🤖 AI Status' button to verify connection"
    echo "  3. Try the Analyze, Refactor, or Generate Docs buttons"
    exit 0
else
    echo -e "${RED}✗ Some services are offline${NC}"
    echo ""
    echo "Required startup:"
    echo "  Terminal 1: ollama serve"
    echo "  Terminal 2: cd backend && npm install && node app.js"
    echo "  Terminal 3: cd ai_backend && pip install -r requirements.txt && python main.py"
    echo "  Terminal 4: Open http://localhost:3000"
    exit 1
fi
