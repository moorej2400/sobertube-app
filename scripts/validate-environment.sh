#!/bin/bash

# Environment Validation Script for SoberTube Cloud-Agnostic Architecture
# Validates that all required environment variables are properly configured

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENV_FILE="${1:-.env.local}"
WARNINGS=0
ERRORS=0

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
            ((WARNINGS++))
            ;;
        "error")
            echo -e "${RED}❌ ${message}${NC}"
            ((ERRORS++))
            ;;
    esac
}

# Function to check if variable is set and not default
check_required_var() {
    local var_name=$1
    local default_value=$2
    local description=$3
    
    if [ -z "${!var_name}" ]; then
        print_status "error" "Required variable $var_name is not set"
        echo "   Description: $description"
        return 1
    fi
    
    if [ "${!var_name}" = "$default_value" ]; then
        print_status "warning" "Variable $var_name is using default value"
        echo "   Current: ${!var_name}"
        echo "   Description: $description"
        return 1
    fi
    
    return 0
}

# Function to check optional variable
check_optional_var() {
    local var_name=$1
    local description=$2
    
    if [ -z "${!var_name}" ]; then
        print_status "info" "Optional variable $var_name is not set"
        echo "   Description: $description"
        return 1
    fi
    
    return 0
}

# Function to validate URL format
validate_url() {
    local var_name=$1
    local url="${!var_name}"
    
    if [[ $url =~ ^https?://[a-zA-Z0-9.-]+(:[0-9]+)?(/.*)?$ ]]; then
        return 0
    else
        print_status "error" "Invalid URL format for $var_name: $url"
        return 1
    fi
}

# Function to validate JWT secret strength
validate_jwt_secret() {
    local secret="${JWT_SECRET}"
    
    if [ ${#secret} -lt 32 ]; then
        print_status "error" "JWT_SECRET must be at least 32 characters long (current: ${#secret})"
        return 1
    fi
    
    if [[ "$secret" == *"your_jwt_secret_key_here"* ]]; then
        print_status "error" "JWT_SECRET is using default/template value"
        return 1
    fi
    
    return 0
}

# Function to validate password strength
validate_password() {
    local var_name=$1
    local password="${!var_name}"
    local min_length=${2:-12}
    
    if [ ${#password} -lt $min_length ]; then
        print_status "warning" "$var_name should be at least $min_length characters long (current: ${#password})"
        return 1
    fi
    
    if [[ "$password" == *"password"* ]] || [[ "$password" == *"123"* ]]; then
        print_status "warning" "$var_name appears to use weak/default password"
        return 1
    fi
    
    return 0
}

# Main validation function
main() {
    echo "🔍 SoberTube Environment Validation"
    echo "==================================="
    echo ""
    
    # Check if environment file exists
    if [ ! -f "$ENV_FILE" ]; then
        print_status "error" "Environment file not found: $ENV_FILE"
        echo "   Run: cp .env.local.example $ENV_FILE"
        exit 1
    fi
    
    print_status "info" "Loading environment from: $ENV_FILE"
    
    # Load environment file
    set -a
    source "$ENV_FILE"
    set +a
    
    echo ""
    print_status "info" "Validating critical configuration..."
    echo ""
    
    # Critical Database Configuration
    check_required_var "POSTGRES_PASSWORD" "your_super_secure_postgres_password" "PostgreSQL database password"
    validate_password "POSTGRES_PASSWORD" 16
    
    # Critical JWT Configuration
    check_required_var "JWT_SECRET" "your_jwt_secret_key_here" "JWT signing secret"
    validate_jwt_secret
    
    check_required_var "REALTIME_ENCRYPTION_KEY" "your_32_character_encryption_key_here" "Realtime encryption key"
    if [ ${#REALTIME_ENCRYPTION_KEY} -ne 32 ]; then
        print_status "error" "REALTIME_ENCRYPTION_KEY must be exactly 32 characters (current: ${#REALTIME_ENCRYPTION_KEY})"
    fi
    
    check_required_var "REALTIME_SECRET_KEY_BASE" "your_64_character_secret_key_base_here" "Realtime Phoenix framework secret"
    if [ ${#REALTIME_SECRET_KEY_BASE} -lt 64 ]; then
        print_status "error" "REALTIME_SECRET_KEY_BASE must be at least 64 characters (current: ${#REALTIME_SECRET_KEY_BASE})"
    fi
    
    # URL Configuration
    print_status "info" "Validating URL configuration..."
    validate_url "API_EXTERNAL_URL"
    validate_url "GOTRUE_URL"
    validate_url "SITE_URL"
    validate_url "SUPABASE_URL"
    
    # Storage Configuration
    print_status "info" "Validating storage configuration..."
    check_required_var "MINIO_ROOT_USER" "minioadmin" "MinIO root username"
    check_required_var "MINIO_ROOT_PASSWORD" "minioadmin123" "MinIO root password"
    validate_password "MINIO_ROOT_PASSWORD" 12
    
    # Redis Configuration
    check_required_var "REDIS_PASSWORD" "sobertube_redis_password" "Redis authentication password"
    validate_password "REDIS_PASSWORD" 12
    
    # Optional OAuth Configuration
    print_status "info" "Checking OAuth configuration..."
    if [ "$GOTRUE_EXTERNAL_GOOGLE_ENABLED" = "true" ]; then
        check_required_var "GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID" "" "Google OAuth client ID"
        check_required_var "GOTRUE_EXTERNAL_GOOGLE_SECRET" "" "Google OAuth client secret"
    fi
    
    if [ "$GOTRUE_EXTERNAL_FACEBOOK_ENABLED" = "true" ]; then
        check_required_var "GOTRUE_EXTERNAL_FACEBOOK_CLIENT_ID" "" "Facebook OAuth app ID"
        check_required_var "GOTRUE_EXTERNAL_FACEBOOK_SECRET" "" "Facebook OAuth app secret"
    fi
    
    # Development Configuration
    print_status "info" "Checking development configuration..."
    check_optional_var "NODE_ENV" "Node.js environment setting"
    check_optional_var "LOG_LEVEL" "Application logging level"
    check_optional_var "GRAFANA_ADMIN_PASSWORD" "Grafana admin password"
    
    # Security Settings Validation
    print_status "info" "Validating security settings..."
    if [ "$GOTRUE_DISABLE_SIGNUP" = "false" ]; then
        print_status "warning" "Public signup is enabled (GOTRUE_DISABLE_SIGNUP=false)"
        echo "   Consider disabling for production environments"
    fi
    
    if [ "$ENABLE_CORS" = "true" ] && [ "$CORS_ORIGIN" = "*" ]; then
        print_status "warning" "CORS is configured to allow all origins"
        echo "   Consider restricting to specific domains for production"
    fi
    
    # Performance Settings
    print_status "info" "Checking performance configuration..."
    if [ -n "$DB_POOL_MAX" ] && [ "$DB_POOL_MAX" -lt 5 ]; then
        print_status "warning" "Database connection pool may be too small (DB_POOL_MAX=$DB_POOL_MAX)"
    fi
    
    if [ -n "$CACHE_TTL" ] && [ "$CACHE_TTL" -lt 300 ]; then
        print_status "warning" "Cache TTL may be too short for optimal performance (CACHE_TTL=$CACHE_TTL)"
    fi
    
    # Summary
    echo ""
    echo "📊 Validation Summary"
    echo "===================="
    
    if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
        print_status "success" "All environment variables are properly configured!"
        echo ""
        echo "🚀 Your environment is ready for cloud-agnostic deployment"
        exit 0
    else
        echo ""
        if [ $ERRORS -gt 0 ]; then
            print_status "error" "Found $ERRORS critical error(s) that must be fixed"
        fi
        
        if [ $WARNINGS -gt 0 ]; then
            print_status "warning" "Found $WARNINGS warning(s) that should be reviewed"
        fi
        
        echo ""
        echo "📝 Recommendations:"
        echo "  1. Update default/template values with secure alternatives"
        echo "  2. Generate strong, unique passwords and secrets"
        echo "  3. Review security settings for your deployment environment"
        echo "  4. Consider environment-specific optimizations"
        
        if [ $ERRORS -gt 0 ]; then
            exit 1
        else
            exit 0
        fi
    fi
}

# Handle script interruption
trap 'print_status "warning" "Validation interrupted by user"; exit 1' INT TERM

# Execute main function
main