-- SoberTube Database Users and Permissions Setup
-- This script creates all necessary database users and permissions for development
-- Run order: 02 (after extensions) to ensure proper role-based access

-- Create application-specific roles for different access levels
-- These roles will be used by different services and for RLS policies

-- Anonymous role (for public access, limited permissions)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
        RAISE NOTICE 'Created anon role';
    END IF;
END $$;

-- Authenticated role (for logged-in users)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
        RAISE NOTICE 'Created authenticated role';
    END IF;
END $$;

-- Service role (for backend services with elevated permissions)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
        RAISE NOTICE 'Created service_role';
    END IF;
END $$;

-- Database admin role (for migrations and schema changes)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_admin') THEN
        -- This role should already exist from the container setup
        RAISE NOTICE 'supabase_admin role already exists';
    END IF;
END $$;

-- Realtime role (for Supabase realtime service)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'supabase_realtime_admin') THEN
        CREATE ROLE supabase_realtime_admin NOLOGIN;
        RAISE NOTICE 'Created supabase_realtime_admin role';
    END IF;
END $$;

-- Grant necessary permissions to roles

-- Anonymous role permissions (very limited, public access only)
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;

-- Authenticated role permissions (logged-in users)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;

-- Service role permissions (backend services)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON FUNCTIONS TO service_role;

-- Grant roles to supabase_admin (for convenience during development)
GRANT anon TO supabase_admin;
GRANT authenticated TO supabase_admin;
GRANT service_role TO supabase_admin;

-- Create auth schema for Supabase authentication
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO supabase_admin;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO supabase_admin;

-- Create realtime schema for Supabase realtime
CREATE SCHEMA IF NOT EXISTS realtime;
GRANT USAGE ON SCHEMA realtime TO supabase_realtime_admin;
GRANT ALL ON ALL TABLES IN SCHEMA realtime TO supabase_realtime_admin;

-- Set up Row Level Security enabling function
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
BEGIN
    RETURN COALESCE(
        current_setting('request.jwt.claim.sub', true),
        (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    )::uuid;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set up role function for RLS policies
CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
BEGIN
    RETURN COALESCE(
        current_setting('request.jwt.claim.role', true),
        (current_setting('request.jwt.claims', true)::jsonb ->> 'role')
    )::text;
EXCEPTION
    WHEN OTHERS THEN
        RETURN 'anon';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log success
DO $$
BEGIN
    RAISE NOTICE 'Successfully configured all database users and permissions for SoberTube';
    RAISE NOTICE 'Roles available: anon, authenticated, service_role, supabase_admin, supabase_realtime_admin';
    RAISE NOTICE 'Schemas available: public, auth, realtime';
END $$;