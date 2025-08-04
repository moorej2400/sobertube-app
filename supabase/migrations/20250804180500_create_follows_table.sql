-- Create follows/relationships table schema for SoberTube follow functionality
-- This migration creates the follows table for user relationships and social connections

-- Create follows table with proper constraints
CREATE TABLE IF NOT EXISTS public.follows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    following_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Ensure a user can only follow another user once
    UNIQUE(follower_id, following_id),
    
    -- Ensure a user cannot follow themselves
    CHECK (follower_id != following_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS follows_follower_id_idx ON public.follows (follower_id);
CREATE INDEX IF NOT EXISTS follows_following_id_idx ON public.follows (following_id);
CREATE INDEX IF NOT EXISTS follows_created_at_idx ON public.follows (created_at DESC);
CREATE INDEX IF NOT EXISTS follows_follower_created_idx ON public.follows (follower_id, created_at DESC);
CREATE INDEX IF NOT EXISTS follows_following_created_idx ON public.follows (following_id, created_at DESC);

-- Function to safely toggle follow/unfollow relationship
CREATE OR REPLACE FUNCTION public.toggle_follow(
    p_follower_id uuid,
    p_following_id uuid
)
RETURNS TABLE (
    following boolean,
    follower_count integer,
    following_count integer
) 
LANGUAGE plpgsql
AS $$
DECLARE
    v_existing_follow_id uuid;
    v_follower_count integer;
    v_following_count integer;
    v_following boolean;
BEGIN
    -- Validate that user is not trying to follow themselves
    IF p_follower_id = p_following_id THEN
        RAISE EXCEPTION 'Users cannot follow themselves';
    END IF;
    
    -- Check if user already follows this person
    SELECT id INTO v_existing_follow_id
    FROM public.follows 
    WHERE follower_id = p_follower_id 
      AND following_id = p_following_id;
    
    IF v_existing_follow_id IS NOT NULL THEN
        -- User already follows them, so unfollow (remove relationship)
        DELETE FROM public.follows WHERE id = v_existing_follow_id;
        v_following := false;
    ELSE
        -- User doesn't follow them, so follow (add relationship)
        INSERT INTO public.follows (follower_id, following_id)
        VALUES (p_follower_id, p_following_id);
        v_following := true;
    END IF;
    
    -- Get updated follower count for the following user
    SELECT COUNT(*) INTO v_follower_count
    FROM public.follows
    WHERE following_id = p_following_id;
    
    -- Get updated following count for the follower user
    SELECT COUNT(*) INTO v_following_count
    FROM public.follows
    WHERE follower_id = p_follower_id;
    
    RETURN QUERY SELECT v_following, v_follower_count, v_following_count;
END;
$$;

-- Function to get user's followers with pagination
CREATE OR REPLACE FUNCTION public.get_user_followers(
    p_user_id uuid,
    p_limit integer DEFAULT 20,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    follower_id uuid,
    username text,
    display_name text,
    profile_picture_url text,
    bio text,
    followed_at timestamp with time zone,
    is_mutual boolean -- whether the followed user also follows back
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        f.follower_id,
        u.username,
        u.display_name,
        u.profile_picture_url,
        u.bio,
        f.created_at as followed_at,
        EXISTS(
            SELECT 1 FROM public.follows f2 
            WHERE f2.follower_id = p_user_id 
              AND f2.following_id = f.follower_id
        ) as is_mutual
    FROM public.follows f
    JOIN public.users u ON f.follower_id = u.id
    WHERE f.following_id = p_user_id
      AND u.privacy_level IN ('public', 'community')
    ORDER BY f.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Function to get user's following list with pagination
CREATE OR REPLACE FUNCTION public.get_user_following(
    p_user_id uuid,
    p_limit integer DEFAULT 20,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    following_id uuid,
    username text,
    display_name text,
    profile_picture_url text,
    bio text,
    followed_at timestamp with time zone,
    is_mutual boolean -- whether the following user also follows back
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        f.following_id,
        u.username,
        u.display_name,
        u.profile_picture_url,
        u.bio,
        f.created_at as followed_at,
        EXISTS(
            SELECT 1 FROM public.follows f2 
            WHERE f2.follower_id = f.following_id 
              AND f2.following_id = p_user_id
        ) as is_mutual
    FROM public.follows f
    JOIN public.users u ON f.following_id = u.id
    WHERE f.follower_id = p_user_id
      AND u.privacy_level IN ('public', 'community')
    ORDER BY f.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Function to get follow status between multiple users
CREATE OR REPLACE FUNCTION public.get_follow_status(
    p_user_id uuid,
    p_target_user_ids uuid[]
)
RETURNS TABLE (
    target_user_id uuid,
    is_following boolean,
    is_followed_by boolean,
    is_mutual boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
    target_id uuid;
BEGIN
    FOREACH target_id IN ARRAY p_target_user_ids
    LOOP
        RETURN QUERY
        SELECT 
            target_id,
            EXISTS(
                SELECT 1 FROM public.follows 
                WHERE follower_id = p_user_id AND following_id = target_id
            ) as is_following,
            EXISTS(
                SELECT 1 FROM public.follows 
                WHERE follower_id = target_id AND following_id = p_user_id
            ) as is_followed_by,
            EXISTS(
                SELECT 1 FROM public.follows f1
                WHERE f1.follower_id = p_user_id AND f1.following_id = target_id
                  AND EXISTS(
                      SELECT 1 FROM public.follows f2
                      WHERE f2.follower_id = target_id AND f2.following_id = p_user_id
                  )
            ) as is_mutual;
    END LOOP;
END;
$$;

-- Function to get suggested users to follow (users with mutual connections)
CREATE OR REPLACE FUNCTION public.get_follow_suggestions(
    p_user_id uuid,
    p_limit integer DEFAULT 10
)
RETURNS TABLE (
    user_id uuid,
    username text,
    display_name text,
    profile_picture_url text,
    bio text,
    mutual_followers_count integer,
    mutual_follower_usernames text[]
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH user_following AS (
        -- Users that the current user follows
        SELECT following_id FROM public.follows WHERE follower_id = p_user_id
    ),
    suggested_users AS (
        -- Users followed by people the current user follows, but not followed by current user
        SELECT 
            f.following_id as suggested_user_id,
            COUNT(*) as mutual_count,
            array_agg(u.username) as mutual_usernames
        FROM public.follows f
        JOIN user_following uf ON f.follower_id = uf.following_id
        JOIN public.users u ON f.follower_id = u.id
        WHERE f.following_id != p_user_id -- Don't suggest self
          AND f.following_id NOT IN (SELECT following_id FROM user_following) -- Not already following
        GROUP BY f.following_id
    )
    SELECT 
        su.suggested_user_id,
        u.username,
        u.display_name,
        u.profile_picture_url,
        u.bio,
        su.mutual_count::integer,
        su.mutual_usernames
    FROM suggested_users su
    JOIN public.users u ON su.suggested_user_id = u.id
    WHERE u.privacy_level IN ('public', 'community')
    ORDER BY su.mutual_count DESC, u.created_at DESC
    LIMIT p_limit;
END;
$$;

-- Function to get personalized feed content from followed users
CREATE OR REPLACE FUNCTION public.get_following_feed_items(
    p_user_id uuid,
    p_page_size integer DEFAULT 10,
    p_cursor_timestamp timestamp with time zone DEFAULT null,
    p_cursor_id uuid DEFAULT null
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
        -- Only show content from users that the current user follows
        fiw.user_id IN (
            SELECT f.following_id 
            FROM public.follows f 
            WHERE f.follower_id = p_user_id
        )
        -- Apply cursor-based pagination
        AND (p_cursor_timestamp IS NULL OR 
             fiw.created_at < p_cursor_timestamp OR 
             (fiw.created_at = p_cursor_timestamp AND fiw.id < p_cursor_id))
    ORDER BY fiw.created_at DESC, fiw.id DESC
    LIMIT p_page_size;
END;
$$;

-- Update user profiles to include follower/following counts
-- Add computed columns for follower and following counts
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS followers_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS following_count integer DEFAULT 0;

-- Function to update user follower/following counts
CREATE OR REPLACE FUNCTION public.update_user_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Update following count for follower
        UPDATE public.users 
        SET following_count = (
            SELECT COUNT(*) FROM public.follows WHERE follower_id = NEW.follower_id
        )
        WHERE id = NEW.follower_id;
        
        -- Update followers count for following
        UPDATE public.users 
        SET followers_count = (
            SELECT COUNT(*) FROM public.follows WHERE following_id = NEW.following_id
        )
        WHERE id = NEW.following_id;
        
        RETURN NEW;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        -- Update following count for follower
        UPDATE public.users 
        SET following_count = (
            SELECT COUNT(*) FROM public.follows WHERE follower_id = OLD.follower_id
        )
        WHERE id = OLD.follower_id;
        
        -- Update followers count for following
        UPDATE public.users 
        SET followers_count = (
            SELECT COUNT(*) FROM public.follows WHERE following_id = OLD.following_id
        )
        WHERE id = OLD.following_id;
        
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update follow counts
CREATE TRIGGER update_user_follow_counts_trigger
    AFTER INSERT OR DELETE ON public.follows
    FOR EACH ROW EXECUTE FUNCTION public.update_user_follow_counts();

-- Initialize existing user follow counts
UPDATE public.users 
SET 
    followers_count = (SELECT COUNT(*) FROM public.follows WHERE following_id = users.id),
    following_count = (SELECT COUNT(*) FROM public.follows WHERE follower_id = users.id);

-- Row Level Security (RLS) policies
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Anyone can view follows (for displaying follower counts and public relationships)
CREATE POLICY "Anyone can view follows" ON public.follows
    FOR SELECT USING (true);

-- Users can only insert their own follows
CREATE POLICY "Users can insert own follows" ON public.follows
    FOR INSERT WITH CHECK (auth.uid() = follower_id);

-- Users can only delete their own follows
CREATE POLICY "Users can delete own follows" ON public.follows
    FOR DELETE USING (auth.uid() = follower_id);

-- Grant permissions
GRANT SELECT ON public.follows TO authenticated;
GRANT SELECT ON public.follows TO anon;
GRANT INSERT, DELETE ON public.follows TO authenticated;

-- Grant execution permissions for follow functions
GRANT EXECUTE ON FUNCTION public.toggle_follow TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_followers TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_followers TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_following TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_following TO anon;
GRANT EXECUTE ON FUNCTION public.get_follow_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_follow_suggestions TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_following_feed_items TO authenticated;

-- Comments for documentation
COMMENT ON TABLE public.follows IS 'Table for tracking user follow relationships';
COMMENT ON FUNCTION public.toggle_follow IS 'Toggle follow/unfollow relationship and update counts atomically';
COMMENT ON FUNCTION public.get_user_followers IS 'Get paginated list of user followers with mutual follow status';
COMMENT ON FUNCTION public.get_user_following IS 'Get paginated list of users that a user follows';
COMMENT ON FUNCTION public.get_follow_status IS 'Get follow status between users for multiple targets';
COMMENT ON FUNCTION public.get_follow_suggestions IS 'Get suggested users to follow based on mutual connections';
COMMENT ON FUNCTION public.get_following_feed_items IS 'Get personalized feed content from followed users only';