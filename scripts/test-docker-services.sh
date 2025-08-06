#!/bin/bash

# Test script for Docker Compose services health and functionality
# This ensures all Supabase services are working correctly

set -e

echo "🧪 Testing Docker Compose Services for SoberTube Cloud-Agnostic Architecture"
echo "================================================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_service() {
    local service_name=$1
    local test_url=$2
    local expected_status=$3
    
    echo -n "Testing ${service_name}... "
    
    if curl -f -s -o /dev/null --max-time 10 "${test_url}"; then
        echo -e "${GREEN}✅ PASS${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        return 1
    fi
}

# Test database connectivity
test_database() {
    echo -n "Testing PostgreSQL database... "
    
    if docker exec sobertube_postgres pg_isready -U supabase_admin -d postgres > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        return 1
    fi
}

# Test Redis connectivity  
test_redis() {
    echo -n "Testing Redis connectivity... "
    
    if docker exec sobertube_redis redis-cli --no-auth-warning -a "sobertube_redis_password" ping > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        return 1
    fi
}

# Main test execution
echo "Starting service health tests..."
echo ""

FAILED_TESTS=0

# Test all HTTP services
test_service "PostgREST API" "http://localhost:3000/" 200 || ((FAILED_TESTS++))
test_service "Realtime Server" "http://localhost:4000/health" 200 || ((FAILED_TESTS++))
test_service "GoTrue Auth" "http://localhost:9999/health" 200 || ((FAILED_TESTS++))
test_service "Storage API" "http://localhost:5000/status" 200 || ((FAILED_TESTS++))
test_service "MinIO Storage" "http://localhost:9000/minio/health/live" 200 || ((FAILED_TESTS++))
test_service "MinIO Console" "http://localhost:9001/" 200 || ((FAILED_TESTS++))
test_service "Image Proxy" "http://localhost:8080/health" 200 || ((FAILED_TESTS++))
test_service "Edge Functions" "http://localhost:54321/health" 200 || ((FAILED_TESTS++))
test_service "Inbucket SMTP" "http://localhost:9110/" 200 || ((FAILED_TESTS++))
test_service "Nginx Proxy" "http://localhost:80/health" 200 || ((FAILED_TESTS++))
test_service "Prometheus" "http://localhost:9090/" 200 || ((FAILED_TESTS++))
test_service "Grafana" "http://localhost:3001/" 200 || ((FAILED_TESTS++))

# Test database services
test_database || ((FAILED_TESTS++))
test_redis || ((FAILED_TESTS++))

echo ""
echo "================================================================="

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed! All services are healthy.${NC}"
    exit 0
else
    echo -e "${RED}❌ ${FAILED_TESTS} test(s) failed. Some services may not be running correctly.${NC}"
    exit 1
fi