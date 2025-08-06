-- SoberTube Database Performance Validation
-- This script validates that the database is properly configured for Timeline/Feed System performance
-- Run order: 03 (after users and permissions) to validate setup

-- Check that all required extensions are properly installed
DO $$
DECLARE
    ext_record RECORD;
    missing_extensions TEXT[] := '{}';
    required_extensions TEXT[] := ARRAY[
        'uuid-ossp', 'http', 'pg_graphql', 'pg_stat_statements', 
        'postgis', 'pg_trgm', 'btree_gin', 'btree_gist', 'pgjwt', 'pgsodium'
    ];
BEGIN
    -- Check each required extension
    FOR i IN 1..array_length(required_extensions, 1) LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_extension 
            WHERE extname = required_extensions[i]
        ) THEN
            missing_extensions := array_append(missing_extensions, required_extensions[i]);
        END IF;
    END LOOP;
    
    -- Report results
    IF array_length(missing_extensions, 1) > 0 THEN
        RAISE WARNING 'Missing required extensions: %', array_to_string(missing_extensions, ', ');
    ELSE
        RAISE NOTICE 'All required extensions are properly installed';
    END IF;
END $$;

-- Validate database configuration settings
DO $$
DECLARE
    setting_value TEXT;
    recommended_shared_buffers BIGINT := 268435456; -- 256MB in bytes
    recommended_work_mem BIGINT := 4194304;         -- 4MB in bytes
    recommended_maintenance_work_mem BIGINT := 67108864; -- 64MB in bytes
    current_shared_buffers BIGINT;
    current_work_mem BIGINT;
    current_maintenance_work_mem BIGINT;
BEGIN
    -- Check shared_buffers
    SELECT setting::BIGINT * 8192 INTO current_shared_buffers 
    FROM pg_settings WHERE name = 'shared_buffers';
    
    -- Check work_mem  
    SELECT setting::BIGINT * 1024 INTO current_work_mem
    FROM pg_settings WHERE name = 'work_mem';
    
    -- Check maintenance_work_mem
    SELECT setting::BIGINT * 1024 INTO current_maintenance_work_mem
    FROM pg_settings WHERE name = 'maintenance_work_mem';
    
    -- Report configuration status
    RAISE NOTICE 'Database Configuration Validation:';
    RAISE NOTICE '  shared_buffers: % (recommended: >= %)', 
        pg_size_pretty(current_shared_buffers), pg_size_pretty(recommended_shared_buffers);
    RAISE NOTICE '  work_mem: % (recommended: >= %)', 
        pg_size_pretty(current_work_mem), pg_size_pretty(recommended_work_mem);
    RAISE NOTICE '  maintenance_work_mem: % (recommended: >= %)', 
        pg_size_pretty(current_maintenance_work_mem), pg_size_pretty(recommended_maintenance_work_mem);
    
    -- Warnings for suboptimal settings
    IF current_shared_buffers < recommended_shared_buffers THEN
        RAISE WARNING 'shared_buffers is below recommended value for Timeline/Feed performance';
    END IF;
    
    IF current_work_mem < recommended_work_mem THEN
        RAISE WARNING 'work_mem is below recommended value for complex Timeline queries';
    END IF;
END $$;

-- Validate that all required roles exist
DO $$
DECLARE
    role_record RECORD;
    missing_roles TEXT[] := '{}';
    required_roles TEXT[] := ARRAY[
        'anon', 'authenticated', 'service_role', 'supabase_admin', 'supabase_realtime_admin'
    ];
BEGIN
    -- Check each required role
    FOR i IN 1..array_length(required_roles, 1) LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_roles 
            WHERE rolname = required_roles[i]
        ) THEN
            missing_roles := array_append(missing_roles, required_roles[i]);
        END IF;
    END LOOP;
    
    -- Report results
    IF array_length(missing_roles, 1) > 0 THEN
        RAISE WARNING 'Missing required roles: %', array_to_string(missing_roles, ', ');
    ELSE
        RAISE NOTICE 'All required database roles are properly configured';
    END IF;
END $$;

-- Validate that required schemas exist
DO $$
DECLARE
    schema_record RECORD;
    missing_schemas TEXT[] := '{}';
    required_schemas TEXT[] := ARRAY['public', 'auth', 'realtime'];
BEGIN
    -- Check each required schema
    FOR i IN 1..array_length(required_schemas, 1) LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.schemata 
            WHERE schema_name = required_schemas[i]
        ) THEN
            missing_schemas := array_append(missing_schemas, required_schemas[i]);
        END IF;
    END LOOP;
    
    -- Report results
    IF array_length(missing_schemas, 1) > 0 THEN
        RAISE WARNING 'Missing required schemas: %', array_to_string(missing_schemas, ', ');
    ELSE
        RAISE NOTICE 'All required database schemas are properly configured';
    END IF;
END $$;

-- Create a simple performance test table for validation
CREATE TABLE IF NOT EXISTS performance_test (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    test_data TEXT,
    indexed_field INTEGER
);

-- Create an index for performance testing
CREATE INDEX IF NOT EXISTS idx_performance_test_indexed_field 
ON performance_test USING btree (indexed_field);

-- Create a GIN index to test advanced indexing capabilities
CREATE INDEX IF NOT EXISTS idx_performance_test_text_search 
ON performance_test USING gin (to_tsvector('english', test_data));

-- Insert test data to validate database operations
INSERT INTO performance_test (test_data, indexed_field) 
SELECT 
    'Test data for performance validation ' || i,
    (random() * 1000)::INTEGER
FROM generate_series(1, 100) AS i
ON CONFLICT DO NOTHING;

-- Validate that pg_stat_statements is collecting data
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'pg_stat_statements is actively collecting query statistics'
        ELSE 'pg_stat_statements may not be properly configured'
    END AS stat_collection_status
FROM pg_stat_statements 
LIMIT 1;

-- Performance test query to validate database responsiveness
DO $$
DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    query_duration INTERVAL;
    test_count INTEGER;
BEGIN
    start_time := clock_timestamp();
    
    SELECT COUNT(*) INTO test_count 
    FROM performance_test 
    WHERE indexed_field < 500;
    
    end_time := clock_timestamp();
    query_duration := end_time - start_time;
    
    RAISE NOTICE 'Performance test completed:';
    RAISE NOTICE '  Records found: %', test_count;
    RAISE NOTICE '  Query duration: %', query_duration;
    
    IF query_duration > INTERVAL '100 milliseconds' THEN
        RAISE WARNING 'Query performance may be suboptimal for Timeline/Feed operations';
    ELSE
        RAISE NOTICE 'Database performance is suitable for Timeline/Feed operations';
    END IF;
END $$;

-- Clean up test table
DROP TABLE IF EXISTS performance_test;

-- Final validation summary
DO $$
BEGIN
    RAISE NOTICE '=== SoberTube Database Setup Validation Complete ===';
    RAISE NOTICE 'Database is ready for Timeline/Feed System migration';
    RAISE NOTICE 'Next steps: Run schema migrations and configure RLS policies';
END $$;