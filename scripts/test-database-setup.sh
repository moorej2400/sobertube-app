#!/bin/bash

# SoberTube Database Setup Validation Script
# This script tests PostgreSQL with Supabase extensions setup
# Validates all requirements for sub-feature 1.2.1

set -e

echo "🗄️  Testing SoberTube PostgreSQL Database Setup"
echo "=================================================="

# Load environment variables
if [ -f .env.local ]; then
    export $(cat .env.local | grep -v '^#' | xargs)
    echo "✅ Loaded environment variables from .env.local"
else
    echo "⚠️  .env.local not found, using default values"
    export POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-your_super_secure_postgres_password}
    export POSTGRES_USER=${POSTGRES_USER:-supabase_admin}
    export POSTGRES_DB=${POSTGRES_DB:-postgres}
    export POSTGRES_PORT=${POSTGRES_PORT:-5433}
fi

# Function to test database connectivity
test_database_connection() {
    echo "🔌 Testing database connectivity..."
    
    # Wait for database to be ready
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker exec sobertube_postgres pg_isready -U $POSTGRES_USER -d $POSTGRES_DB -h localhost >/dev/null 2>&1; then
            echo "✅ Database connection successful (attempt $attempt)"
            return 0
        fi
        
        echo "⏳ Waiting for database... (attempt $attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    echo "❌ Database connection failed after $max_attempts attempts"
    return 1
}

# Function to test extensions
test_extensions() {
    echo "🔧 Testing required extensions..."
    
    local extensions=(
        "uuid-ossp"
        "http" 
        "pg_graphql"
        "pg_stat_statements"
        "postgis"
        "pg_trgm"
        "btree_gin"
        "btree_gist"
        "pgjwt"
        "pgsodium"
    )
    
    local missing_extensions=()
    
    for ext in "${extensions[@]}"; do
        if docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" sobertube_postgres psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT 1 FROM pg_extension WHERE extname = '$ext';" | grep -q "1 row"; then
            echo "✅ Extension '$ext' is installed"
        else
            echo "❌ Extension '$ext' is missing"
            missing_extensions+=("$ext")
        fi
    done
    
    if [ ${#missing_extensions[@]} -eq 0 ]; then
        echo "✅ All required extensions are installed"
        return 0
    else
        echo "❌ Missing extensions: ${missing_extensions[*]}"
        return 1
    fi
}

# Function to test database roles
test_roles() {
    echo "👥 Testing database roles..."
    
    local roles=(
        "anon"
        "authenticated"
        "service_role"
        "supabase_admin"
        "supabase_realtime_admin"
    )
    
    local missing_roles=()
    
    for role in "${roles[@]}"; do
        if docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" sobertube_postgres psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT 1 FROM pg_roles WHERE rolname = '$role';" | grep -q "1 row"; then
            echo "✅ Role '$role' exists"
        else
            echo "❌ Role '$role' is missing"
            missing_roles+=("$role")
        fi
    done
    
    if [ ${#missing_roles[@]} -eq 0 ]; then
        echo "✅ All required roles are configured"
        return 0
    else
        echo "❌ Missing roles: ${missing_roles[*]}"
        return 1
    fi
}

# Function to test schemas
test_schemas() {
    echo "📋 Testing database schemas..."
    
    local schemas=(
        "public"
        "auth"
        "realtime"
    )
    
    local missing_schemas=()
    
    for schema in "${schemas[@]}"; do
        if docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" sobertube_postgres psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT 1 FROM information_schema.schemata WHERE schema_name = '$schema';" | grep -q "1 row"; then
            echo "✅ Schema '$schema' exists"
        else
            echo "❌ Schema '$schema' is missing"
            missing_schemas+=("$schema")
        fi
    done
    
    if [ ${#missing_schemas[@]} -eq 0 ]; then
        echo "✅ All required schemas are configured"
        return 0
    else
        echo "❌ Missing schemas: ${missing_schemas[*]}"
        return 1
    fi
}

# Function to test database performance
test_performance() {
    echo "⚡ Testing database performance..."
    
    # Test basic query performance
    local start_time=$(date +%s%N)
    docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" sobertube_postgres psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT COUNT(*) FROM pg_stat_activity;" >/dev/null
    local end_time=$(date +%s%N)
    local duration=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
    
    echo "✅ Basic query completed in ${duration}ms"
    
    if [ $duration -gt 100 ]; then
        echo "⚠️  Query performance may be suboptimal (>${duration}ms)"
    else
        echo "✅ Database performance is suitable for Timeline/Feed operations"
    fi
    
    # Test pg_stat_statements
    if docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" sobertube_postgres psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT COUNT(*) FROM pg_stat_statements;" >/dev/null 2>&1; then
        echo "✅ pg_stat_statements is active and collecting data"
    else
        echo "⚠️  pg_stat_statements may not be properly configured"
    fi
}

# Function to test container health
test_container_health() {
    echo "🏥 Testing container health..."
    
    local health_status=$(docker inspect sobertube_postgres --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
    
    case $health_status in
        "healthy")
            echo "✅ PostgreSQL container is healthy"
            return 0
            ;;
        "unhealthy")
            echo "❌ PostgreSQL container is unhealthy"
            return 1
            ;;
        "starting")
            echo "⏳ PostgreSQL container is still starting up"
            return 1
            ;;
        *)
            echo "⚠️  PostgreSQL container health status unknown: $health_status"
            return 1
            ;;
    esac
}

# Function to display database configuration
show_configuration() {
    echo "⚙️  Database Configuration:"
    echo "   - Image: $(docker inspect sobertube_postgres --format='{{.Config.Image}}' 2>/dev/null || echo 'not running')"
    echo "   - Database: $POSTGRES_DB"
    echo "   - User: $POSTGRES_USER"
    echo "   - Port: $POSTGRES_PORT"
    
    if docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" sobertube_postgres psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT version();" 2>/dev/null | grep -q "PostgreSQL"; then
        local version=$(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" sobertube_postgres psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB -t -c "SELECT version();" 2>/dev/null | head -1 | xargs)
        echo "   - Version: $version"
    fi
}

# Main execution
main() {
    local exit_code=0
    
    # Check if PostgreSQL container is running
    if ! docker ps | grep -q sobertube_postgres; then
        echo "❌ PostgreSQL container (sobertube_postgres) is not running"
        echo "💡 Run: docker-compose -f docker-compose.local.yml up -d postgres"
        exit 1
    fi
    
    show_configuration
    echo ""
    
    # Run all tests
    test_container_health || exit_code=1
    echo ""
    
    test_database_connection || exit_code=1
    echo ""
    
    test_extensions || exit_code=1
    echo ""
    
    test_roles || exit_code=1
    echo ""
    
    test_schemas || exit_code=1
    echo ""
    
    test_performance || exit_code=1
    echo ""
    
    # Final summary
    echo "=================================================="
    if [ $exit_code -eq 0 ]; then
        echo "🎉 All PostgreSQL database tests passed!"
        echo "✅ Sub-feature 1.2.1 validation successful"
        echo "💡 Database is ready for Timeline/Feed System migration"
    else
        echo "❌ Some database tests failed"
        echo "💡 Check the errors above and fix configuration issues"
    fi
    
    echo "=================================================="
    return $exit_code
}

# Run main function
main "$@"