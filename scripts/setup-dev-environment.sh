#!/bin/bash

# SoberTube Cloud-Agnostic Development Environment Setup Script
# This script sets up the complete self-hosted Supabase stack for local development

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.local.yml"
ENV_FILE=".env.local"
MAX_WAIT_TIME=300  # 5 minutes max wait for services
HEALTH_CHECK_INTERVAL=5

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "info")
            echo -e "${BLUE}ℹ️  ${message}${NC}"
            ;;
        "success")
            echo -e "${GREEN}✅ ${message}${NC}"
            ;;
        "warning")
            echo -e "${YELLOW}⚠️  ${message}${NC}"
            ;;
        "error")
            echo -e "${RED}❌ ${message}${NC}"
            ;;
    esac
}

# Function to check if Docker is running
check_docker() {
    print_status "info" "Checking Docker availability..."
    
    if ! docker --version > /dev/null 2>&1; then
        print_status "error" "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info > /dev/null 2>&1; then
        print_status "error" "Docker daemon is not running"
        exit 1
    fi
    
    print_status "success" "Docker is available and running"
}

# Function to check if Docker Compose is available
check_docker_compose() {
    print_status "info" "Checking Docker Compose availability..."
    
    if ! docker compose version > /dev/null 2>&1; then
        print_status "error" "Docker Compose is not available"
        exit 1
    fi
    
    print_status "success" "Docker Compose is available"
}

# Function to validate environment file
check_environment() {
    print_status "info" "Checking environment configuration..."
    
    if [ ! -f ".env.local.example" ]; then
        print_status "warning" "No .env.local.example found, creating basic configuration"
        create_basic_env
    fi
    
    if [ ! -f "$ENV_FILE" ]; then
        print_status "info" "Creating $ENV_FILE from template..."
        cp .env.local.example "$ENV_FILE"
        print_status "warning" "Please review and update $ENV_FILE with your specific settings"
    fi
    
    print_status "success" "Environment configuration ready"
}

# Function to create basic environment configuration
create_basic_env() {
    cat > .env.local.example << 'EOF'
# SoberTube Cloud-Agnostic Architecture Environment Configuration
# Copy this file to .env.local and customize for your development environment

# Database Configuration
POSTGRES_PASSWORD=your_super_secure_postgres_password_here
POSTGRES_MAX_CONNECTIONS=200

# JWT Configuration  
JWT_SECRET=your_jwt_secret_key_here_at_least_32_characters
ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU

# Realtime Configuration
REALTIME_ENCRYPTION_KEY=your_32_character_encryption_key_here
REALTIME_SECRET_KEY_BASE=your_64_character_secret_key_base_here_for_phoenix_framework

# Storage Configuration
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123
MINIO_DEFAULT_BUCKETS=sobertube-storage

# Redis Configuration
REDIS_PASSWORD=sobertube_redis_password

# URL Configuration
API_EXTERNAL_URL=http://localhost:8000
GOTRUE_URL=http://localhost:9999
SITE_URL=http://localhost:3000
SUPABASE_URL=http://localhost:8000

# SMTP Configuration (for local development)
SMTP_HOST=inbucket
SMTP_PORT=2500
SMTP_USER=
SMTP_PASS=
SMTP_ADMIN_EMAIL=admin@sobertube.local

# OAuth Configuration (set to false for development)
GOTRUE_EXTERNAL_GOOGLE_ENABLED=false
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=
GOTRUE_EXTERNAL_GOOGLE_SECRET=
GOTRUE_EXTERNAL_FACEBOOK_ENABLED=false
GOTRUE_EXTERNAL_FACEBOOK_CLIENT_ID=
GOTRUE_EXTERNAL_FACEBOOK_SECRET=

# Development Settings
GOTRUE_DISABLE_SIGNUP=false
GOTRUE_LOG_LEVEL=info
PGRST_LOG_LEVEL=info
STORAGE_LOG_LEVEL=info
IMGPROXY_LOG_LEVEL=info

# Monitoring Configuration
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=admin
EOF
}

# Function to clean up existing containers
cleanup_containers() {
    print_status "info" "Cleaning up existing containers..."
    
    docker compose -f "$COMPOSE_FILE" down --remove-orphans > /dev/null 2>&1 || true
    
    # Remove any dangling volumes that might cause issues
    docker volume prune -f > /dev/null 2>&1 || true
    
    print_status "success" "Cleanup completed"
}

# Function to create necessary directories
create_directories() {
    print_status "info" "Creating necessary directories..."
    
    mkdir -p database/init
    mkdir -p database/migrations
    mkdir -p database/seeds
    mkdir -p nginx/ssl
    mkdir -p nginx/conf.d
    mkdir -p monitoring/prometheus
    mkdir -p monitoring/grafana/provisioning
    mkdir -p monitoring/grafana/dashboards
    mkdir -p supabase/functions
    
    print_status "success" "Directories created"
}

# Function to start services
start_services() {
    print_status "info" "Starting Docker Compose services..."
    
    docker compose -f "$COMPOSE_FILE" up -d
    
    print_status "success" "Services started in background"
}

# Function to wait for service health
wait_for_service() {
    local service_name=$1
    local health_check_cmd=$2
    local max_attempts=$((MAX_WAIT_TIME / HEALTH_CHECK_INTERVAL))
    local attempt=0
    
    print_status "info" "Waiting for $service_name to be healthy..."
    
    while [ $attempt -lt $max_attempts ]; do
        if eval "$health_check_cmd" > /dev/null 2>&1; then
            print_status "success" "$service_name is healthy"
            return 0
        fi
        
        attempt=$((attempt + 1))
        sleep $HEALTH_CHECK_INTERVAL
        
        # Show progress every 10 attempts (50 seconds)
        if [ $((attempt % 10)) -eq 0 ]; then
            print_status "info" "Still waiting for $service_name... (${attempt}/${max_attempts})"
        fi
    done
    
    print_status "error" "$service_name failed to become healthy within ${MAX_WAIT_TIME} seconds"
    return 1
}

# Function to wait for all core services
wait_for_core_services() {
    print_status "info" "Waiting for core services to be ready..."
    
    # Wait for PostgreSQL
    wait_for_service "PostgreSQL" "docker exec sobertube_postgres pg_isready -U supabase_admin -d postgres"
    
    # Wait for Redis
    wait_for_service "Redis" "docker exec sobertube_redis redis-cli --no-auth-warning -a sobertube_redis_password ping"
    
    # Wait for MinIO
    wait_for_service "MinIO" "curl -f -m 3 http://localhost:9000/minio/health/live"
    
    # Wait for PostgREST
    wait_for_service "PostgREST" "curl -f -m 3 http://localhost:3000/"
    
    # Wait for GoTrue Auth
    wait_for_service "GoTrue Auth" "curl -f -m 3 http://localhost:9999/health"
    
    # Wait for Realtime
    wait_for_service "Realtime" "curl -f -m 3 http://localhost:4000/health"
    
    # Wait for Storage API
    wait_for_service "Storage API" "curl -f -m 3 http://localhost:5000/status"
    
    print_status "success" "All core services are healthy!"
}

# Function to run service tests
run_service_tests() {
    print_status "info" "Running comprehensive service tests..."
    
    if [ -x "./scripts/test-docker-services.sh" ]; then
        ./scripts/test-docker-services.sh
    else
        print_status "warning" "Service test script not found or not executable"
    fi
}

# Function to display service information
display_service_info() {
    print_status "success" "🎉 SoberTube Cloud-Agnostic Development Environment Ready!"
    echo ""
    echo "📊 Service Access URLs:"
    echo "  • API Gateway:      http://localhost:8000"
    echo "  • PostgREST API:    http://localhost:3000"
    echo "  • Realtime:         ws://localhost:4000"
    echo "  • GoTrue Auth:      http://localhost:9999"
    echo "  • Storage API:      http://localhost:5000"
    echo "  • MinIO Console:    http://localhost:9001"
    echo "  • Inbucket SMTP:    http://localhost:9110"
    echo "  • Grafana:          http://localhost:3001 (admin/admin)"
    echo "  • Prometheus:       http://localhost:9090"
    echo ""
    echo "🔧 Development Tools:"
    echo "  • Database:         PostgreSQL at localhost:5432"
    echo "  • Redis:            localhost:6379"
    echo "  • Image Processing: http://localhost:8080"
    echo "  • Edge Functions:   http://localhost:54321"
    echo ""
    echo "📝 Next Steps:"
    echo "  1. Review and customize .env.local if needed"
    echo "  2. Access the API Gateway at http://localhost:8000"
    echo "  3. Check service logs: docker compose -f $COMPOSE_FILE logs -f [service]"
    echo "  4. Stop services: docker compose -f $COMPOSE_FILE down"
    echo ""
    echo "🚀 Your cloud-agnostic Supabase stack is ready for development!"
}

# Main execution function
main() {
    echo "🚀 SoberTube Cloud-Agnostic Development Environment Setup"
    echo "========================================================"
    echo ""
    
    check_docker
    check_docker_compose
    check_environment
    cleanup_containers
    create_directories
    start_services
    wait_for_core_services
    run_service_tests
    display_service_info
    
    print_status "success" "Setup completed successfully!"
}

# Handle script interruption
trap 'print_status "warning" "Setup interrupted by user"; exit 1' INT TERM

# Check if running from correct directory
if [ ! -f "$COMPOSE_FILE" ]; then
    print_status "error" "This script must be run from the project root directory"
    print_status "error" "Expected to find: $COMPOSE_FILE"
    exit 1
fi

# Execute main function
main