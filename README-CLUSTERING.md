# WebSocket Clustering Deployment Guide

This guide covers the horizontal scaling implementation for SoberTube's WebSocket infrastructure.

## 🏗️ Architecture Overview

The clustering solution provides:

- **Horizontal Scaling**: Multiple WebSocket server instances
- **Load Balancing**: Nginx with sticky sessions for WebSocket connections
- **Event Distribution**: Redis adapter for cross-server communication
- **Health Monitoring**: Built-in health checks and metrics
- **Failover Support**: Automatic server failure detection and recovery

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose
- At least 4GB RAM for full cluster
- Redis instance (included in Docker Compose)

### Start the Cluster

```bash
# Make the startup script executable
chmod +x scripts/start-cluster.sh

# Run the startup script
./scripts/start-cluster.sh
```

The script will:
1. Create environment configuration
2. Start Redis cluster
3. Build and deploy 3 WebSocket servers
4. Configure Nginx load balancer
5. Optionally start monitoring services

### Manual Deployment

```bash
# Start the cluster
docker-compose -f docker-compose.cluster.yml up -d

# Check status
docker-compose -f docker-compose.cluster.yml ps

# View logs
docker-compose -f docker-compose.cluster.yml logs -f websocket-server-1
```

## 🔧 Configuration

### Environment Variables

Create `.env.cluster` with required settings:

```env
# Server Configuration
NODE_ENV=production
ENABLE_CLUSTERING=true
FRONTEND_URL=http://localhost:3000

# Database (Supabase)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Security
JWT_SECRET=your_jwt_secret_here_at_least_32_characters_long

# Redis
REDIS_URL=redis://redis-cluster:6379
```

### Scaling Configuration

Each server supports:
- **Max Connections**: 5,000 per instance
- **Resource Limits**: 1 CPU, 1GB RAM per server
- **Auto-scaling**: Based on connection count and server health

## 📊 Monitoring

### Built-in Endpoints

- **Health Check**: `GET /health`
- **Cluster Metrics**: `GET /cluster/metrics`
- **Server Stats**: `GET /api/stats`

### Prometheus + Grafana (Optional)

Start monitoring services:

```bash
docker-compose -f docker-compose.cluster.yml --profile monitoring up -d
```

Access:
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin123)

### Key Metrics

- WebSocket connections per server
- CPU and memory usage
- Redis performance
- Event distribution latency
- Server health status

## 🔄 Operations

### Adding Server Instances

```bash
# Scale up server-1 to 2 instances
docker-compose -f docker-compose.cluster.yml up -d --scale websocket-server-1=2

# Add a new server type (requires config update)
# Update docker-compose.cluster.yml and nginx configuration
```

### Server Maintenance

```bash
# Graceful shutdown of specific server
docker-compose -f docker-compose.cluster.yml stop websocket-server-1

# View server logs
docker-compose -f docker-compose.cluster.yml logs -f websocket-server-1

# Restart failed server
docker-compose -f docker-compose.cluster.yml restart websocket-server-1
```

### Health Checks

```bash
# Check cluster health
curl http://localhost:80/health

# Check individual servers
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health

# Check cluster metrics
curl http://localhost:80/cluster/metrics
```

## 🛡️ Security Features

### Nginx Security

- Rate limiting for WebSocket connections
- Connection limits per IP
- Security headers
- SSL/TLS support (configure certificates)

### Redis Security

- Connection authentication
- Network isolation
- Data encryption in transit

### Server Security

- JWT token validation
- Input sanitization
- CORS configuration
- Environment isolation

## 🐛 Troubleshooting

### Common Issues

**Servers not connecting to Redis:**
```bash
# Check Redis logs
docker-compose -f docker-compose.cluster.yml logs redis-cluster

# Test Redis connection
docker exec -it sobertube-redis-cluster redis-cli ping
```

**Load balancer not routing correctly:**
```bash
# Check Nginx configuration
docker exec -it sobertube-load-balancer nginx -t

# View Nginx logs
docker-compose -f docker-compose.cluster.yml logs load-balancer
```

**High memory usage:**
```bash
# Check server metrics
curl http://localhost:3001/cluster/metrics

# View resource usage
docker stats
```

### Performance Tuning

**Connection Limits:**
- Adjust `MAX_CONNECTIONS` environment variable
- Update Nginx upstream configuration
- Scale server instances based on load

**Redis Performance:**
- Enable Redis persistence: `--appendonly yes`
- Configure memory limits
- Use Redis Cluster for very high loads

**Network Optimization:**
- Use `ip_hash` in Nginx for sticky sessions
- Configure proper keepalive settings
- Enable HTTP/2 for better performance

## 📈 Scaling Guidelines

### Vertical Scaling (Per Server)
- **Light Load**: 1 CPU, 512MB RAM → ~1,000 connections
- **Medium Load**: 2 CPU, 1GB RAM → ~5,000 connections  
- **Heavy Load**: 4 CPU, 2GB RAM → ~10,000 connections

### Horizontal Scaling (More Servers)
- **Start**: 3 servers for redundancy
- **Growth**: Add servers when CPU >70% or connections >80% capacity
- **Monitoring**: Use auto-scaling based on metrics

### Database Scaling
- **Read Replicas**: For heavy read workloads
- **Connection Pooling**: Use pgbouncer for database connections
- **Caching**: Redis for session and temporary data

## 🔧 Advanced Configuration

### Custom Load Balancing

Edit `nginx/cluster-config/websocket-cluster.conf`:

```nginx
upstream websocket_backend {
    # Use least_conn instead of ip_hash for better distribution
    least_conn;
    
    server websocket-server-1:3001 weight=3;
    server websocket-server-2:3002 weight=2;
    server websocket-server-3:3003 weight=1 backup;
}
```

### Custom Clustering Settings

Update server environment:

```env
# Cluster-specific settings
HEARTBEAT_INTERVAL=30000
FAILURE_DETECTION_TIMEOUT=90000
MAX_CONNECTIONS=10000
REDIS_KEY_PREFIX=sobertube:cluster:
```

### SSL/HTTPS Setup

1. Add certificates to `nginx/ssl/`
2. Update Nginx configuration
3. Set `FRONTEND_URL=https://yourdomain.com`

## 📚 API Reference

### Cluster Management Endpoints

**GET /cluster/status**
```json
{
  "serverId": "server-1",
  "status": "healthy",
  "connections": 1250,
  "uptime": 3600000,
  "clusterSize": 3
}
```

**GET /cluster/metrics**
```json
{
  "totalServers": 3,
  "totalConnections": 3750,
  "averageLoad": 0.75,
  "recommendedAction": "maintain",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

**POST /cluster/scale**
```json
{
  "action": "scale_up",
  "targetInstances": 5,
  "reason": "high_load"
}
```

This completes the WebSocket clustering implementation with comprehensive deployment support!