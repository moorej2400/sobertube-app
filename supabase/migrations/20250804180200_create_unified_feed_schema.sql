-- Create unified feed schema for SoberTube Timeline/Feed System
-- This migration creates views and functions for combining videos and posts into a unified feed

-- Create feed_items view that combines videos and posts with unified structure
CREATE OR REPLACE VIEW public.feed_items AS
-- Video items in feed format
SELECT 
    v.id,
    'video' as content_type,
    v.user_id,
    v.title as content_title,
    v.description as content_body,
    v.video_url as media_url,
    v.thumbnail_url,
    v.duration,
    v.file_size,
    v.format as media_format,
    v.views_count,
    v.likes_count,
    v.comments_count,
    v.status,
    v.created_at,
    v.updated_at,
    -- Additional computed fields for feed
    extract(epoch from (now() - v.created_at)) as age_seconds,
    case 
        when v.created_at > now() - interval '1 hour' then 'recent'
        when v.created_at > now() - interval '1 day' then 'today' 
        when v.created_at > now() - interval '7 days' then 'week'
        else 'older'
    end as recency_category
FROM public.videos v
WHERE v.status = 'ready'

UNION ALL

-- Post items in feed format  
SELECT 
    p.id,
    'post' as content_type,
    p.user_id,
    left(p.content, 50) as content_title, -- First 50 chars as title
    p.content as content_body,
    p.image_url as media_url,
    null as thumbnail_url,
    null as duration,
    null as file_size,
    null as media_format,
    0 as views_count, -- Posts don't have views (yet)
    p.likes_count,  
    p.comments_count,
    'ready' as status, -- Posts are always ready
    p.created_at,
    p.updated_at,
    -- Additional computed fields for feed
    extract(epoch from (now() - p.created_at)) as age_seconds,
    case 
        when p.created_at > now() - interval '1 hour' then 'recent'
        when p.created_at > now() - interval '1 day' then 'today'
        when p.created_at > now() - interval '7 days' then 'week' 
        else 'older'
    end as recency_category
FROM public.posts p;

-- Create enriched feed view with user information
CREATE OR REPLACE VIEW public.feed_items_with_users AS
SELECT 
    fi.*,
    u.username,
    u.display_name,
    u.profile_picture_url,
    u.privacy_level,
    -- Engagement rate calculation
    case 
        when fi.content_type = 'video' and fi.views_count > 0 
        then (fi.likes_count + fi.comments_count)::float / fi.views_count * 100
        else (fi.likes_count + fi.comments_count)::float
    end as engagement_score
FROM public.feed_items fi
JOIN public.users u ON fi.user_id = u.id
WHERE u.privacy_level IN ('public', 'community'); -- Respect privacy settings

-- Create indexes for better feed query performance
CREATE INDEX IF NOT EXISTS feed_items_created_at_idx ON public.videos (created_at DESC);
CREATE INDEX IF NOT EXISTS feed_items_user_created_idx ON public.videos (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_created_at_idx ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS posts_user_created_idx ON public.posts (user_id, created_at DESC);

-- Create composite index for efficient feed pagination
CREATE INDEX IF NOT EXISTS videos_feed_pagination_idx ON public.videos (status, created_at DESC, id);
CREATE INDEX IF NOT EXISTS posts_feed_pagination_idx ON public.posts (created_at DESC, id);

-- Function to get paginated feed items with cursor-based pagination
CREATE OR REPLACE FUNCTION public.get_feed_items(
    page_size integer DEFAULT 10,
    cursor_timestamp timestamp with time zone DEFAULT null,
    cursor_id uuid DEFAULT null,
    content_type_filter text DEFAULT null,
    user_id_filter uuid DEFAULT null
)
RETURNS TABLE (
    id uuid,
    content_type text,
    user_id uuid,
    username text,
    display_name text,
    profile_picture_url text,
    content_title text,
    content_body text,
    media_url text,
    thumbnail_url text,
    duration integer,
    file_size bigint,
    media_format text,
    views_count integer,
    likes_count integer,
    comments_count integer,
    status text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    age_seconds numeric,
    recency_category text,
    engagement_score numeric
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM public.feed_items_with_users fiw
    WHERE 
        -- Apply cursor-based pagination
        (cursor_timestamp IS NULL OR 
         fiw.created_at < cursor_timestamp OR 
         (fiw.created_at = cursor_timestamp AND fiw.id < cursor_id))
        -- Apply content type filter
        AND (content_type_filter IS NULL OR fiw.content_type = content_type_filter)
        -- Apply user filter
        AND (user_id_filter IS NULL OR fiw.user_id = user_id_filter)
    ORDER BY fiw.created_at DESC, fiw.id DESC
    LIMIT page_size;
END;
$$;

-- Function to get trending feed items (high engagement in recent time)
CREATE OR REPLACE FUNCTION public.get_trending_feed_items(
    page_size integer DEFAULT 10,
    hours_back integer DEFAULT 24
)
RETURNS TABLE (
    id uuid,
    content_type text,
    user_id uuid,
    username text,
    display_name text,
    profile_picture_url text,
    content_title text,
    content_body text,
    media_url text,
    thumbnail_url text,
    duration integer,
    file_size bigint,
    media_format text,
    views_count integer,
    likes_count integer,
    comments_count integer,
    status text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    age_seconds numeric,
    recency_category text,
    engagement_score numeric
)
LANGUAGE plpgsql  
AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM public.feed_items_with_users fiw
    WHERE fiw.created_at > now() - (hours_back || ' hours')::interval
    ORDER BY fiw.engagement_score DESC, fiw.created_at DESC
    LIMIT page_size;
END;
$$;

-- Function to get user-specific feed (following-based)
-- Note: This will be enhanced when the follows system is implemented
CREATE OR REPLACE FUNCTION public.get_user_feed_items(
    requesting_user_id uuid,
    page_size integer DEFAULT 10,
    cursor_timestamp timestamp with time zone DEFAULT null,
    cursor_id uuid DEFAULT null
)
RETURNS TABLE (
    id uuid,
    content_type text,
    user_id uuid,
    username text,
    display_name text,
    profile_picture_url text,
    content_title text,
    content_body text,
    media_url text,
    thumbnail_url text,
    duration integer,
    file_size bigint,
    media_format text,
    views_count integer,
    likes_count integer,
    comments_count integer,
    status text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    age_seconds numeric,
    recency_category text,
    engagement_score numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- For now, return all public content (will be enhanced with follows)
    -- TODO: Add follows table join when follows system is implemented
    RETURN QUERY
    SELECT *
    FROM public.feed_items_with_users fiw
    WHERE 
        -- Apply cursor-based pagination
        (cursor_timestamp IS NULL OR 
         fiw.created_at < cursor_timestamp OR 
         (fiw.created_at = cursor_timestamp AND fiw.id < cursor_id))
        -- Only public content for now
        AND fiw.privacy_level = 'public'
    ORDER BY fiw.created_at DESC, fiw.id DESC
    LIMIT page_size;
END;
$$;

-- Grant permissions for feed views and functions
GRANT SELECT ON public.feed_items TO authenticated;
GRANT SELECT ON public.feed_items TO anon;
GRANT SELECT ON public.feed_items_with_users TO authenticated;
GRANT SELECT ON public.feed_items_with_users TO anon;

-- Grant execution permissions for feed functions
GRANT EXECUTE ON FUNCTION public.get_feed_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_feed_items TO anon;
GRANT EXECUTE ON FUNCTION public.get_trending_feed_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trending_feed_items TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_feed_items TO authenticated;

-- Comments for documentation
COMMENT ON VIEW public.feed_items IS 'Unified view combining videos and posts into a single feed format';
COMMENT ON VIEW public.feed_items_with_users IS 'Enriched feed view with user information and engagement metrics';
COMMENT ON FUNCTION public.get_feed_items IS 'Get paginated feed items with cursor-based pagination and filtering';
COMMENT ON FUNCTION public.get_trending_feed_items IS 'Get trending content based on engagement in recent time period';
COMMENT ON FUNCTION public.get_user_feed_items IS 'Get personalized feed for a specific user (follows-aware when implemented)';