# SoberTube Cloud-Agnostic Architecture - Networking Guide

## Overview

This guide explains the networking architecture for the SoberTube cloud-agnostic development environment, including service discovery, SSL/TLS configuration, and inter-service communication.

## Network Architecture

### Service Network Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                        External Access                          │
├─────────────────────────────────────────────────────────────────┤
│  HTTP (80) → HTTPS Redirect                                     │
│  HTTPS (443) → Frontend Application                             │
│  HTTPS (8000) → API Gateway (Supabase Services)                 │
│  HTTP (8080) → API Gateway (Development)                        │
└─────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────┐
│                        Nginx Reverse Proxy                      │
│                      (sobertube_nginx)                          │
├─────────────────────────────────────────────────────────────────┤
│  • SSL Termination                                              │
│  • Load Balancing                                               │
│  • Request Routing                                              │
│  • CORS Handling                                                │
│  • Static File Serving                                          │
└─────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────┐
│                        Internal Network                         │
│                    (sobertube_network - 172.16.0.0/24)          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐   │
│  │   PostgreSQL    │  │    Realtime     │  │     GoTrue     │   │
│  │  (postgres:5432)│  │ (realtime:4000) │  │  (auth:9999)   │   │
│  └─────────────────┘  └─────────────────┘  └────────────────┘   │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐   │
│  │   PostgREST     │  │     MinIO       │  │  Storage API   │   │
│  │   (rest:3000)   │  │  (minio:9000)   │  │ (storage:5000) │   │
│  └─────────────────┘  └─────────────────┘  └────────────────┘   │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐   │
│  │   ImgProxy      │  │ Edge Functions  │  │     Redis      │   │
│  │ (imgproxy:8080) │  │(edge-func:9000) │  │  (redis:6379)  │   │
│  └─────────────────┘  └─────────────────┘  └────────────────┘   │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐   │
│  │    Inbucket     │  │   Prometheus    │  │    Grafana     │   │
│  │ (inbucket:2500) │  │(prometheus:9090)│  │ (grafana:3000) │   │
│  └─────────────────┘  └─────────────────┘  └────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Service Discovery

All services communicate using Docker Compose service names as hostnames:

- **PostgreSQL**: `postgres:5432`
- **Redis**: `redis:6379`
- **PostgREST**: `rest:3000`
- **Realtime**: `realtime:4000`
- **GoTrue Auth**: `auth:9999`
- **Storage API**: `storage:5000`
- **MinIO**: `minio:9000`
- **ImgProxy**: `imgproxy:8080`
- **Edge Functions**: `edge-functions:9000`
- **Inbucket SMTP**: `inbucket:2500`

### External Access Points

#### HTTPS Endpoints (Production-like)
- **Frontend**: https://sobertube.local (Port 443)
- **API Gateway**: https://api.sobertube.local:8000
- **Individual Services** (for debugging):
  - Database API: https://api.sobertube.local:8000/rest/v1/
  - Authentication: https://api.sobertube.local:8000/auth/v1/
  - Realtime: wss://api.sobertube.local:8000/realtime/v1/
  - Storage: https://api.sobertube.local:8000/storage/v1/
  - Functions: https://api.sobertube.local:8000/functions/v1/

#### HTTP Endpoints (Development convenience)
- **API Gateway**: http://localhost:8080
- **Individual Services** (direct access):
  - PostgREST: http://localhost:3000
  - Realtime: http://localhost:4000
  - GoTrue: http://localhost:9999
  - Storage: http://localhost:5000
  - MinIO Console: http://localhost:9001
  - Grafana: http://localhost:3001
  - Prometheus: http://localhost:9090
  - Inbucket: http://localhost:9110

## SSL/TLS Configuration

### Certificate Structure

The development environment uses self-signed certificates for local HTTPS:

```
nginx/ssl/
├── ca.crt              # Certificate Authority (import to trust store)
├── ca.key              # CA Private Key
├── server.crt          # Main server certificate
├── server.key          # Main server private key
├── api.crt            # API service certificate
├── api.key            # API service private key
├── auth.crt           # Auth service certificate
├── auth.key           # Auth service private key
├── storage.crt        # Storage service certificate
├── storage.key        # Storage service private key
├── realtime.crt       # Realtime service certificate
├── realtime.key       # Realtime service private key
└── INSTALL_INSTRUCTIONS.md
```

### Supported Domains

The certificates are configured for:
- `sobertube.local`
- `*.sobertube.local`
- `api.sobertube.local`
- `auth.sobertube.local`
- `storage.sobertube.local`
- `realtime.sobertube.local`
- `localhost`
- `127.0.0.1`

### SSL Configuration Features

- **TLS 1.2 and 1.3** support
- **Modern cipher suites** for security
- **HSTS** (HTTP Strict Transport Security)
- **Security headers** (X-Frame-Options, CSP, etc.)
- **Session resumption** for performance
- **HTTP/2** support

## Network Security

### Internal Communication

- All services communicate within the isolated `sobertube_network`
- Services use internal hostnames (no external IP exposure)
- Database and Redis require authentication
- Service-to-service communication uses internal ports

### External Security

- **HTTPS enforced** for production-like endpoints
- **CORS configured** for development flexibility
- **Rate limiting** headers prepared for production
- **Security headers** applied to all responses

### Development vs Production

| Feature | Development | Production |
|---------|-------------|------------|
| HTTP Access | Allowed (port 8080) | Redirect to HTTPS |
| CORS Origin | `*` (permissive) | Specific domains |
| SSL Certificates | Self-signed | Valid CA certificates |
| Security Headers | Relaxed CSP | Strict policies |
| Debug Information | Exposed in headers | Hidden |

## Service Health Monitoring

### Health Check Endpoints

Each service provides health monitoring:

- **API Gateway**: `/health`
- **PostgREST**: `/` (returns API documentation)
- **Realtime**: `/health`
- **GoTrue**: `/health`
- **Storage**: `/status`
- **MinIO**: `/minio/health/live`
- **ImgProxy**: `/health`
- **Edge Functions**: `/health`

### Monitoring Integration

- **Prometheus** scrapes metrics from all services
- **Grafana** provides visualization dashboards
- **Custom health checks** in Docker Compose
- **Nginx access logs** for request monitoring

## Load Balancing & Scaling

### Current Configuration

- **Single instance** of each service for development
- **Connection pooling** configured for database and Redis
- **Nginx upstream** blocks ready for scaling

### Production Scaling Ready

```nginx
upstream postgrest {
    server rest1:3000;
    server rest2:3000;
    server rest3:3000;
    keepalive 32;
}
```

## Troubleshooting

### Common Network Issues

1. **Certificate Warnings**
   - Import `nginx/ssl/ca.crt` to your browser/system trust store
   - Add domains to `/etc/hosts`

2. **Service Communication Failures**
   - Check Docker network: `docker network inspect sobertube_network`
   - Verify service health: `docker compose ps`

3. **Port Conflicts**
   - Check port availability: `netstat -tulpn | grep <port>`
   - Modify ports in `docker-compose.local.yml`

### Debug Commands

```bash
# Check network connectivity
docker exec sobertube_nginx ping postgres

# View service logs
docker compose logs -f nginx

# Test internal service communication
docker exec sobertube_rest curl http://postgres:5432

# Check certificate validity
openssl x509 -in nginx/ssl/server.crt -text -noout
```

### Network Performance

- **Connection pooling** reduces connection overhead
- **HTTP/2** improves request multiplexing
- **Gzip compression** reduces bandwidth usage
- **Keep-alive** connections improve performance

## Configuration Files

### Key Network Configuration Files

- `docker-compose.local.yml` - Service definitions and networking
- `nginx/nginx.conf` - Main reverse proxy configuration
- `nginx/conf.d/ssl.conf` - SSL/TLS settings
- `scripts/generate-ssl-certs.sh` - Certificate generation
- `scripts/test-docker-services.sh` - Network connectivity testing

## Security Considerations

### Development Environment

- Self-signed certificates (browser warnings expected)
- Permissive CORS for development flexibility
- Debug information exposed in headers
- Default credentials (secure for local development)

### Production Deployment

- Valid CA-signed certificates required
- Restrict CORS to specific domains
- Remove debug headers and information
- Use strong, unique credentials
- Enable rate limiting and WAF
- Implement network policies and firewalls

## Next Steps

1. **Certificate Installation**: Import CA certificate to avoid browser warnings
2. **Hosts File**: Add domain entries for clean URLs
3. **Service Testing**: Run health checks to verify all services
4. **Application Integration**: Connect your application to the API gateway
5. **Monitoring Setup**: Configure Grafana dashboards for your metrics