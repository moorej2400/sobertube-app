-- SoberTube Database Extensions Initialization
-- This script installs all required Supabase extensions for Timeline/Feed System compatibility
-- Run order: 01 (first) to ensure extensions are available for subsequent scripts

-- Enable required extensions for Supabase compatibility
-- These extensions must be available before any tables or functions are created

-- UUID generation (required for primary keys)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- HTTP client extension (required for Supabase realtime and external integrations)
CREATE EXTENSION IF NOT EXISTS "http";

-- GraphQL support (required for Supabase GraphQL API)
CREATE EXTENSION IF NOT EXISTS "pg_graphql";

-- PostgreSQL statistics (required for performance monitoring)
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- PostGIS for geospatial data (may be used for location-based features)
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Additional extensions that may be needed for Timeline/Feed features
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- Trigram matching for full-text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";   -- GIN indexes for better performance
CREATE EXTENSION IF NOT EXISTS "btree_gist";  -- GIST indexes for advanced queries

-- Prerequisites for Supabase-specific extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- Cryptographic functions (required for pgjwt)

-- Supabase-specific extensions
CREATE EXTENSION IF NOT EXISTS "pgjwt";       -- JWT token handling
CREATE EXTENSION IF NOT EXISTS "pgsodium";    -- Encryption functions

-- Log extension installation success
DO $$
BEGIN
    RAISE NOTICE 'Successfully installed all required extensions for SoberTube Timeline/Feed System';
    RAISE NOTICE 'Extensions available: uuid-ossp, http, pg_graphql, pg_stat_statements, postgis, pg_trgm, btree_gin, btree_gist, pgjwt, pgsodium';
END $$;