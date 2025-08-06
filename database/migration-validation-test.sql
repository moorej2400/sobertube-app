-- SoberTube Database Migration Validation Tests
-- Sub-feature 4.2.2: Database Migration Execution
-- These tests validate that all Supabase migrations were applied successfully

-- ==============================================
-- TEST 1: VERIFY ALL REQUIRED TABLES EXIST
-- ==============================================

-- Check that all core tables exist
SELECT 
    CASE 
        WHEN COUNT(*) = 6 THEN 'PASS: All 6 core tables exist'
        ELSE 'FAIL: Missing tables. Found: ' || COUNT(*)::text
    END as table_test_result
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'posts', 'videos', 'likes', 'comments', 'follows');

-- ==============================================
-- TEST 2: VERIFY ALL REQUIRED VIEWS EXIST
-- ==============================================

-- Check that feed views exist
SELECT 
    CASE 
        WHEN COUNT(*) >= 2 THEN 'PASS: Feed views exist'
        ELSE 'FAIL: Missing feed views. Found: ' || COUNT(*)::text
    END as view_test_result
FROM information_schema.views 
WHERE table_schema = 'public' 
AND table_name IN ('feed_items', 'feed_items_with_users');

-- ==============================================
-- TEST 3: VERIFY RLS POLICIES ARE ENABLED
-- ==============================================

-- Check that RLS is enabled on all core tables
SELECT 
    tablename,
    CASE 
        WHEN rowsecurity THEN 'PASS: RLS enabled'
        ELSE 'FAIL: RLS disabled'
    END as rls_status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'posts', 'videos', 'likes', 'comments', 'follows')
ORDER BY tablename;

-- ==============================================
-- TEST 4: VERIFY PRIMARY KEYS AND CONSTRAINTS
-- ==============================================

-- Check primary keys exist on all tables
SELECT 
    t.table_name,
    CASE 
        WHEN c.constraint_name IS NOT NULL THEN 'PASS: Primary key exists'
        ELSE 'FAIL: No primary key'
    END as pk_status
FROM information_schema.tables t
LEFT JOIN information_schema.table_constraints c 
    ON t.table_name = c.table_name 
    AND c.constraint_type = 'PRIMARY KEY'
WHERE t.table_schema = 'public' 
AND t.table_name IN ('users', 'posts', 'videos', 'likes', 'comments', 'follows')
ORDER BY t.table_name;

-- ==============================================
-- TEST 5: VERIFY FOREIGN KEY RELATIONSHIPS
-- ==============================================

-- Check foreign key constraints
SELECT 
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    'PASS: Foreign key exists' as fk_status
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- ==============================================
-- TEST 6: VERIFY INDEXES EXIST
-- ==============================================

-- Check critical indexes exist
SELECT 
    schemaname,
    tablename,
    indexname,
    'PASS: Index exists' as index_status
FROM pg_indexes 
WHERE schemaname = 'public'
AND tablename IN ('users', 'posts', 'videos', 'likes', 'comments', 'follows')
ORDER BY tablename, indexname;

-- ==============================================
-- TEST 7: VERIFY TRIGGERS ARE ACTIVE
-- ==============================================

-- Check update triggers exist
SELECT 
    t.trigger_name,
    t.event_object_table,
    'PASS: Trigger exists' as trigger_status
FROM information_schema.triggers t
WHERE t.trigger_schema = 'public'
AND t.event_object_table IN ('users', 'posts', 'videos', 'likes', 'comments', 'follows')
ORDER BY t.event_object_table, t.trigger_name;

-- ==============================================
-- TEST 8: VERIFY DATABASE FUNCTIONS
-- ==============================================

-- Check custom functions exist
SELECT 
    p.proname as function_name,
    'PASS: Function exists' as function_status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN (
    'update_updated_at_column',
    'validate_like_content_id', 
    'update_comment_counts',
    'update_user_follow_counts'
)
ORDER BY p.proname;

-- ==============================================
-- TEST 9: FUNCTIONAL TEST - DATA OPERATIONS
-- ==============================================

-- Clean up any existing test data first
DELETE FROM comments WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE 'migration-test%'
);
DELETE FROM likes WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE 'migration-test%'
);
DELETE FROM follows WHERE follower_id IN (
    SELECT id FROM users WHERE email LIKE 'migration-test%'
) OR following_id IN (
    SELECT id FROM users WHERE email LIKE 'migration-test%'
);
DELETE FROM posts WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE 'migration-test%'
);
DELETE FROM videos WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE 'migration-test%'
);
DELETE FROM users WHERE email LIKE 'migration-test%';

-- Create test users
INSERT INTO users (id, email, username, display_name) VALUES 
('11111111-1111-1111-1111-111111111111', 'migration-test1@example.com', 'migtest1', 'Migration Test User 1'),
('22222222-2222-2222-2222-222222222222', 'migration-test2@example.com', 'migtest2', 'Migration Test User 2');

-- Create test post
INSERT INTO posts (id, user_id, content, post_type) VALUES 
('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Migration test post', 'Recovery Update');

-- Create test like (should trigger validation)
INSERT INTO likes (user_id, content_type, content_id) VALUES 
('22222222-2222-2222-2222-222222222222', 'post', '33333333-3333-3333-3333-333333333333');

-- Create test comment (should update counts)
INSERT INTO comments (user_id, content_type, content_id, content) VALUES 
('22222222-2222-2222-2222-222222222222', 'post', '33333333-3333-3333-3333-333333333333', 'Great migration test!');

-- Create test follow (should update counts)
INSERT INTO follows (follower_id, following_id) VALUES 
('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');

-- Verify the functional test results
SELECT 
    'FUNCTIONAL TESTS' as test_category,
    (SELECT COUNT(*) FROM users WHERE email LIKE 'migration-test%') as users_created,
    (SELECT COUNT(*) FROM posts WHERE user_id = '11111111-1111-1111-1111-111111111111') as posts_created,
    (SELECT COUNT(*) FROM likes WHERE content_id = '33333333-3333-3333-3333-333333333333') as likes_created,
    (SELECT COUNT(*) FROM comments WHERE content_id = '33333333-3333-3333-3333-333333333333') as comments_created,
    (SELECT COUNT(*) FROM follows WHERE following_id = '11111111-1111-1111-1111-111111111111') as follows_created;

-- Verify trigger functionality (comment count should be 1)
SELECT 
    'TRIGGER TESTS' as test_category,
    p.comments_count,
    CASE 
        WHEN p.comments_count = 1 THEN 'PASS: Comment count trigger working'
        ELSE 'FAIL: Comment count trigger not working'
    END as comment_trigger_test
FROM posts p 
WHERE p.id = '33333333-3333-3333-3333-333333333333';

-- Verify follow count triggers
SELECT 
    'FOLLOW COUNT TESTS' as test_category,
    u1.following_count as user1_following,
    u2.followers_count as user2_followers,
    CASE 
        WHEN u1.following_count = 1 AND u2.followers_count = 1 THEN 'PASS: Follow count triggers working'
        ELSE 'FAIL: Follow count triggers not working'
    END as follow_trigger_test
FROM users u1, users u2 
WHERE u1.email = 'migration-test2@example.com' 
AND u2.email = 'migration-test1@example.com';

-- Verify feed view functionality
SELECT 
    'FEED VIEW TESTS' as test_category,
    COUNT(*) as items_in_feed,
    CASE 
        WHEN COUNT(*) >= 1 THEN 'PASS: Feed view working'
        ELSE 'FAIL: Feed view not working'
    END as feed_view_test
FROM feed_items 
WHERE user_id = '11111111-1111-1111-1111-111111111111';

-- ==============================================
-- MIGRATION SUCCESS SUMMARY
-- ==============================================

SELECT 
    '=== MIGRATION VALIDATION SUMMARY ===' as summary,
    NOW() as validation_timestamp,
    'Sub-feature 4.2.2: Database Migration Execution COMPLETED' as status;

-- Clean up test data
DELETE FROM comments WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE 'migration-test%'
);
DELETE FROM likes WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE 'migration-test%'
);
DELETE FROM follows WHERE follower_id IN (
    SELECT id FROM users WHERE email LIKE 'migration-test%'
) OR following_id IN (
    SELECT id FROM users WHERE email LIKE 'migration-test%'
);
DELETE FROM posts WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE 'migration-test%'
);
DELETE FROM videos WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE 'migration-test%'
);
DELETE FROM users WHERE email LIKE 'migration-test%';

SELECT 'Test data cleaned up successfully' as cleanup_status;