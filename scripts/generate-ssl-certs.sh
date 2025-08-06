#!/bin/bash

# SSL Certificate Generation Script for SoberTube Development Environment
# Generates self-signed certificates for local HTTPS development

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SSL_DIR="nginx/ssl"
CERT_VALIDITY_DAYS=365
DOMAIN="sobertube.local"
ALT_NAMES="DNS:localhost,DNS:*.sobertube.local,DNS:api.sobertube.local,DNS:auth.sobertube.local,IP:127.0.0.1,IP:::1"

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

# Function to check if OpenSSL is available
check_openssl() {
    if ! command -v openssl &> /dev/null; then
        print_status "error" "OpenSSL is not installed"
        echo "Install OpenSSL:"
        echo "  Ubuntu/Debian: sudo apt-get install openssl"
        echo "  macOS: brew install openssl"
        exit 1
    fi
    
    print_status "success" "OpenSSL is available"
}

# Function to create directory structure
create_directories() {
    print_status "info" "Creating SSL directory structure..."
    
    mkdir -p "$SSL_DIR"
    
    print_status "success" "SSL directories created"
}

# Function to generate CA (Certificate Authority)
generate_ca() {
    print_status "info" "Generating Certificate Authority (CA)..."
    
    local ca_key="$SSL_DIR/ca.key"
    local ca_cert="$SSL_DIR/ca.crt"
    
    # Generate CA private key
    openssl genrsa -out "$ca_key" 4096
    
    # Generate CA certificate
    openssl req -new -x509 -days $CERT_VALIDITY_DAYS -key "$ca_key" -out "$ca_cert" \
        -subj "/C=US/ST=Development/L=Local/O=SoberTube/OU=Development/CN=SoberTube Development CA"
    
    print_status "success" "Certificate Authority generated"
}

# Function to generate server certificate
generate_server_cert() {
    print_status "info" "Generating server certificate for $DOMAIN..."
    
    local server_key="$SSL_DIR/server.key"
    local server_csr="$SSL_DIR/server.csr"
    local server_cert="$SSL_DIR/server.crt"
    local ca_key="$SSL_DIR/ca.key"
    local ca_cert="$SSL_DIR/ca.crt"
    
    # Generate server private key
    openssl genrsa -out "$server_key" 2048
    
    # Create certificate configuration
    cat > "$SSL_DIR/server.conf" << EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = Development
L = Local
O = SoberTube
OU = Development
CN = $DOMAIN

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.sobertube.local
DNS.3 = api.sobertube.local
DNS.4 = auth.sobertube.local
DNS.5 = storage.sobertube.local
DNS.6 = realtime.sobertube.local
IP.1 = 127.0.0.1
IP.2 = ::1
EOF
    
    # Generate certificate signing request
    openssl req -new -key "$server_key" -out "$server_csr" -config "$SSL_DIR/server.conf"
    
    # Generate server certificate signed by CA
    openssl x509 -req -in "$server_csr" -CA "$ca_cert" -CAkey "$ca_key" -CAcreateserial \
        -out "$server_cert" -days $CERT_VALIDITY_DAYS -extensions v3_req -extfile "$SSL_DIR/server.conf"
    
    # Clean up CSR file
    rm "$server_csr"
    
    print_status "success" "Server certificate generated"
}

# Function to generate individual service certificates
generate_service_certs() {
    local services=("api" "auth" "storage" "realtime")
    
    for service in "${services[@]}"; do
        print_status "info" "Generating certificate for $service.$DOMAIN..."
        
        local service_key="$SSL_DIR/${service}.key"
        local service_csr="$SSL_DIR/${service}.csr"
        local service_cert="$SSL_DIR/${service}.crt"
        local ca_key="$SSL_DIR/ca.key"
        local ca_cert="$SSL_DIR/ca.crt"
        
        # Generate service private key
        openssl genrsa -out "$service_key" 2048
        
        # Create service certificate configuration
        cat > "$SSL_DIR/${service}.conf" << EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = Development
L = Local
O = SoberTube
OU = Development
CN = ${service}.${DOMAIN}

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${service}.${DOMAIN}
DNS.2 = localhost
IP.1 = 127.0.0.1
IP.2 = ::1
EOF
        
        # Generate certificate signing request
        openssl req -new -key "$service_key" -out "$service_csr" -config "$SSL_DIR/${service}.conf"
        
        # Generate service certificate signed by CA
        openssl x509 -req -in "$service_csr" -CA "$ca_cert" -CAkey "$ca_key" -CAcreateserial \
            -out "$service_cert" -days $CERT_VALIDITY_DAYS -extensions v3_req -extfile "$SSL_DIR/${service}.conf"
        
        # Clean up temporary files
        rm "$service_csr" "$SSL_DIR/${service}.conf"
        
        print_status "success" "Certificate for $service.$DOMAIN generated"
    done
}

# Function to set appropriate permissions
set_permissions() {
    print_status "info" "Setting appropriate file permissions..."
    
    # Set restrictive permissions for private keys
    chmod 600 "$SSL_DIR"/*.key
    
    # Set readable permissions for certificates
    chmod 644 "$SSL_DIR"/*.crt
    
    print_status "success" "File permissions set"
}

# Function to display certificate information
display_cert_info() {
    print_status "success" "🔒 SSL Certificates Generated Successfully!"
    echo ""
    echo "📁 Certificate Location: $SSL_DIR/"
    echo ""
    echo "🔑 Generated Certificates:"
    echo "  • Certificate Authority: ca.crt"
    echo "  • Server Certificate: server.crt"
    echo "  • Server Private Key: server.key"
    echo "  • Service Certificates: api.crt, auth.crt, storage.crt, realtime.crt"
    echo ""
    echo "📋 Certificate Details:"
    echo "  • Validity: $CERT_VALIDITY_DAYS days"
    echo "  • Primary Domain: $DOMAIN"
    echo "  • Alt Names: localhost, *.sobertube.local, 127.0.0.1"
    echo ""
    echo "🚀 Next Steps:"
    echo "  1. Import ca.crt into your browser/system trust store for HTTPS without warnings"
    echo "  2. Update /etc/hosts to point sobertube.local domains to 127.0.0.1"
    echo "  3. Configure nginx to use the generated certificates"
    echo ""
    echo "💡 Add to /etc/hosts:"
    echo "127.0.0.1 sobertube.local"
    echo "127.0.0.1 api.sobertube.local"
    echo "127.0.0.1 auth.sobertube.local"
    echo "127.0.0.1 storage.sobertube.local"
    echo "127.0.0.1 realtime.sobertube.local"
}

# Function to create installation instructions
create_install_instructions() {
    cat > "$SSL_DIR/INSTALL_INSTRUCTIONS.md" << 'EOF'
# SSL Certificate Installation Instructions

## Browser Trust (Chrome/Edge)
1. Open Chrome Settings > Privacy and Security > Security > Manage Certificates
2. Go to "Authorities" tab
3. Click "Import" and select `ca.crt`
4. Check "Trust this certificate for identifying websites"
5. Restart browser

## Browser Trust (Firefox)
1. Open Firefox Settings > Privacy & Security
2. Scroll to "Certificates" section
3. Click "View Certificates" > "Authorities" tab
4. Click "Import" and select `ca.crt`
5. Check "Trust this CA to identify websites"
6. Restart browser

## System Trust (Ubuntu/Debian)
```bash
sudo cp ca.crt /usr/local/share/ca-certificates/sobertube-dev-ca.crt
sudo update-ca-certificates
```

## System Trust (macOS)
```bash
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ca.crt
```

## Hosts File Configuration
Add these entries to `/etc/hosts` (Linux/macOS) or `C:\Windows\System32\drivers\etc\hosts` (Windows):

```
127.0.0.1 sobertube.local
127.0.0.1 api.sobertube.local
127.0.0.1 auth.sobertube.local
127.0.0.1 storage.sobertube.local
127.0.0.1 realtime.sobertube.local
```

## Verification
After installation, visit https://sobertube.local and verify:
- ✅ No certificate warnings
- ✅ Green lock icon in address bar
- ✅ Certificate issued by "SoberTube Development CA"
EOF

    print_status "success" "Installation instructions created: $SSL_DIR/INSTALL_INSTRUCTIONS.md"
}

# Main execution function
main() {
    echo "🔒 SoberTube SSL Certificate Generation"
    echo "====================================="
    echo ""
    
    check_openssl
    create_directories
    generate_ca
    generate_server_cert
    generate_service_certs
    set_permissions
    create_install_instructions
    display_cert_info
    
    print_status "success" "SSL certificate generation completed!"
}

# Handle script interruption
trap 'print_status "warning" "Certificate generation interrupted by user"; exit 1' INT TERM

# Check if running from correct directory
if [ ! -d "nginx" ]; then
    print_status "error" "This script must be run from the project root directory"
    print_status "error" "Expected to find: nginx/ directory"
    exit 1
fi

# Execute main function
main