#!/bin/bash
# Startup script for WebSocket clustering deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Environment file
ENV_FILE=".env.cluster"

echo -e "${BLUE}🚀 Starting SoberTube WebSocket Cluster...${NC}"

# Check if Docker and Docker Compose are available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not available. Please install Docker Compose.${NC}"
    exit 1
fi

# Create .env.cluster if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚠️  Creating cluster environment file...${NC}"
    cat > "$ENV_FILE" << 'EOF'
# WebSocket Cluster Configuration
NODE_ENV=production
ENABLE_CLUSTERING=true

# Server Configuration
FRONTEND_URL=http://localhost:3000

# Database Configuration (Supabase)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
POSTGRES_PASSWORD=your_super_secret_password

# Security
JWT_SECRET=your_jwt_secret_here_at_least_32_characters_long

# Monitoring
GRAFANA_PASSWORD=admin123

# Redis Configuration
REDIS_URL=redis://redis-cluster:6379
EOF
    
    echo -e "${YELLOW}📝 Please update the environment variables in ${ENV_FILE} before continuing.${NC}"
    echo -e "${YELLOW}   Essential variables to update:${NC}"
    echo -e "${YELLOW}   - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY${NC}"
    echo -e "${YELLOW}   - JWT_SECRET (generate a strong secret)${NC}"
    echo -e "${YELLOW}   - POSTGRES_PASSWORD${NC}"
    echo ""
    read -p "Press Enter when you've updated the environment file, or Ctrl+C to exit..."
fi

# Load environment variables
if [ -f "$ENV_FILE" ]; then
    export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

# Function to check service health
check_service_health() {
    local service=$1
    local url=$2
    local max_attempts=$3
    local attempt=1
    
    echo -e "${BLUE}🔍 Checking $service health...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ $service is healthy${NC}"
            return 0
        fi
        
        echo -e "${YELLOW}   Attempt $attempt/$max_attempts failed, retrying in 5 seconds...${NC}"
        sleep 5
        ((attempt++))
    done
    
    echo -e "${RED}❌ $service health check failed after $max_attempts attempts${NC}"
    return 1
}

# Build and start services
echo -e "${BLUE}🔨 Building and starting cluster services...${NC}"

# Start core infrastructure first
echo -e "${BLUE}📦 Starting Redis cluster...${NC}"
docker-compose -f docker-compose.cluster.yml up -d redis-cluster

# Wait for Redis to be ready
sleep 5
if ! check_service_health "Redis" "redis://localhost:6379" 3; then
    echo -e "${RED}❌ Redis cluster failed to start. Check logs with: docker-compose -f docker-compose.cluster.yml logs redis-cluster${NC}"
    exit 1
fi

# Start Supabase (if not using external)
echo -e "${BLUE}🗄️  Starting Supabase database...${NC}"
docker-compose -f docker-compose.cluster.yml up -d supabase

# Wait for Supabase to be ready
sleep 10
if ! check_service_health "Supabase" "http://localhost:54322" 5; then
    echo -e "${YELLOW}⚠️  Supabase health check failed. If using external Supabase, this is expected.${NC}"
fi

# Build WebSocket servers
echo -e "${BLUE}🔧 Building WebSocket servers...${NC}"
docker-compose -f docker-compose.cluster.yml build websocket-server-1 websocket-server-2 websocket-server-3

# Start WebSocket servers
echo -e "${BLUE}🌐 Starting WebSocket servers...${NC}"
docker-compose -f docker-compose.cluster.yml up -d websocket-server-1 websocket-server-2 websocket-server-3

# Wait for servers to be ready
sleep 15
failed_servers=""

for i in {1..3}; do
    if ! check_service_health "WebSocket Server $i" "http://localhost:300$i/health" 3; then
        failed_servers="$failed_servers server-$i"
    fi
done

if [ ! -z "$failed_servers" ]; then
    echo -e "${RED}❌ Some WebSocket servers failed to start:$failed_servers${NC}"
    echo -e "${YELLOW}💡 Check logs with: docker-compose -f docker-compose.cluster.yml logs [service-name]${NC}"
fi

# Start load balancer
echo -e "${BLUE}⚖️  Starting load balancer...${NC}"
docker-compose -f docker-compose.cluster.yml up -d load-balancer

# Wait for load balancer
sleep 5
if ! check_service_health "Load Balancer" "http://localhost:80/health" 3; then
    echo -e "${RED}❌ Load balancer failed to start${NC}"
    exit 1
fi

# Optional: Start monitoring
read -p "$(echo -e ${BLUE}🔍 Start monitoring services \(Prometheus + Grafana\)? [y/N]: ${NC})" -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}📊 Starting monitoring services...${NC}"
    docker-compose -f docker-compose.cluster.yml --profile monitoring up -d prometheus grafana
    
    sleep 5
    echo -e "${GREEN}📊 Monitoring services started:${NC}"
    echo -e "${GREEN}   - Prometheus: http://localhost:9090${NC}"
    echo -e "${GREEN}   - Grafana: http://localhost:3000 (admin/admin123)${NC}"
fi

# Show final status
echo ""
echo -e "${GREEN}🎉 WebSocket Cluster is running!${NC}"
echo ""
echo -e "${GREEN}📊 Cluster Status:${NC}"
docker-compose -f docker-compose.cluster.yml ps

echo ""
echo -e "${GREEN}🌐 Access Points:${NC}"
echo -e "${GREEN}   - Load Balancer: http://localhost:80${NC}"
echo -e "${GREEN}   - WebSocket Server 1: http://localhost:3001${NC}"
echo -e "${GREEN}   - WebSocket Server 2: http://localhost:3002${NC}"
echo -e "${GREEN}   - WebSocket Server 3: http://localhost:3003${NC}"
echo -e "${GREEN}   - Redis: redis://localhost:6379${NC}"

echo ""
echo -e "${BLUE}💡 Useful Commands:${NC}"
echo -e "${BLUE}   - View logs: docker-compose -f docker-compose.cluster.yml logs -f [service]${NC}"
echo -e "${BLUE}   - Scale servers: docker-compose -f docker-compose.cluster.yml up -d --scale websocket-server-1=2${NC}"
echo -e "${BLUE}   - Stop cluster: docker-compose -f docker-compose.cluster.yml down${NC}"
echo -e "${BLUE}   - Health check: curl http://localhost:80/health${NC}"

echo ""
echo -e "${GREEN}✨ Cluster deployment complete!${NC}"