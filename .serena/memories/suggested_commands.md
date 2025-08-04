# SoberTube Development Commands

## Essential Development Commands

### Project Setup
```bash
# Initialize Supabase (first time only)
supabase init
supabase start  # Starts local Supabase stack

# Install dependencies
npm install                    # Root workspace
cd backend && npm install     # Backend dependencies
cd frontend && npm install    # Frontend dependencies
```

### Development Servers
```bash
# Full stack development (recommended)
npm run dev                   # Starts both backend and frontend
npm run dev:backend          # Backend only (port 8080)
npm run dev:frontend         # Frontend only (port 5173)

# Docker development
docker-compose --profile full-stack up    # Complete stack
docker-compose --profile backend up       # Backend only
docker-compose --profile frontend up      # Frontend only
```

### Testing Commands
```bash
# Run all tests
npm test                     # Root level tests
npm run test:coverage       # With coverage report
npm run test:ci             # CI mode (no watch)

# Backend testing
cd backend
npm test                    # All backend tests
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report

# Frontend testing  
cd frontend
npm test                   # Vitest tests
npm run test:coverage      # Coverage report
npm run test:ui           # Vitest UI
```

### Build Commands
```bash
# Production builds
npm run build              # Build both backend and frontend
npm run build:backend     # Backend TypeScript compilation
npm run build:frontend    # Frontend Vite build

# Clean builds
npm run clean             # Remove dist directories
```

### Code Quality
```bash
# Backend linting
cd backend
npm run lint              # Run ESLint
npm run lint:fix         # Fix auto-fixable issues

# Frontend linting
cd frontend  
npm run lint             # Run ESLint
npm run lint:fix         # Fix auto-fixable issues
```

### Database Commands
```bash
# Supabase database management
supabase db reset         # Reset local database
supabase db push          # Push schema changes
supabase db pull          # Pull remote schema
supabase gen types typescript --local  # Generate TypeScript types

# View database
supabase studio          # Open Supabase Studio (port 54323)
```

### Production Commands
```bash
# Production deployment
npm run build:production  # Production build
npm start                # Start production servers
```

### Utility Commands
```bash
# Linux system utilities (WSL environment)
ls -la                   # List files with details
grep -r "pattern" .      # Search for patterns
find . -name "*.ts"      # Find TypeScript files
ps aux | grep node       # Find Node processes
tail -f logs/app.log     # Follow log files
```

### Docker Utilities
```bash
# Docker management
docker-compose ps        # Show running services
docker-compose logs -f   # Follow logs
docker-compose down      # Stop all services
docker system prune      # Clean up Docker resources
```

### Git Workflow
```bash
# Standard Git commands
git status              # Check repository status
git add .              # Stage changes
git commit -m "message" # Commit changes
git push origin main   # Push to remote
git pull origin main   # Pull latest changes
```