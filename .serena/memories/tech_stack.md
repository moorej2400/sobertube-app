# SoberTube Technical Stack

## Backend Stack
- **Runtime**: Node.js
- **Language**: TypeScript (ES2020 target)
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL with real-time subscriptions)
- **Authentication**: Supabase Auth with JWT tokens
- **Storage**: Supabase Storage
- **Security**: Helmet.js, CORS, Rate limiting
- **File Upload**: Multer for multipart/form-data
- **Validation**: Joi schema validation
- **Logging**: Winston logger
- **Process Manager**: ts-node-dev for development

## Frontend Stack  
- **Framework**: React 18 with functional components and hooks
- **Language**: TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router DOM v6
- **State Management**: React Context + React Query (@tanstack/react-query)
- **HTTP Client**: Supabase JS client
- **Testing**: Vitest + React Testing Library

## Development Tools
- **Containerization**: Docker with docker-compose
- **Local Database**: Supabase CLI for local development
- **Linting**: ESLint with TypeScript rules
- **Testing**: Jest (backend), Vitest (frontend)
- **Code Coverage**: Jest with lcov reporting
- **Package Manager**: npm
- **Environment**: cross-env for cross-platform compatibility

## Database & Services
- **Primary Database**: PostgreSQL via Supabase
- **Real-time Features**: Supabase Realtime subscriptions
- **File Storage**: Supabase Storage buckets
- **Authentication**: Supabase Auth with Row Level Security
- **API Generation**: Auto-generated REST APIs via Supabase
- **Edge Functions**: Supabase Edge Runtime (Deno v1)

## Development Environment
- **Local Development**: Supabase local stack on ports 54321-54327
- **Reverse Proxy**: Nginx for local routing (optional)
- **Hot Reload**: ts-node-dev (backend), Vite HMR (frontend)
- **Database Admin**: Supabase Studio on port 54323
- **Email Testing**: Inbucket on port 54324