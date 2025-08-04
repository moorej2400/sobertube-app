-- Create likes table schema for SoberTube like functionality
-- This migration creates the likes table for tracking likes on videos and posts

-- Create likes table with proper constraints and polymorphic design
CREATE TABLE IF NOT EXISTS public.likes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content_type text NOT NULL CHECK (content_type IN ('video', 'post')),
    content_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Ensure a user can only like the same content once
    UNIQUE(user_id, content_type, content_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS likes_user_id_idx ON public.likes (user_id);
CREATE INDEX IF NOT EXISTS likes_content_idx ON public.likes (content_type, content_id);
CREATE INDEX IF NOT EXISTS likes_user_content_idx ON public.likes (user_id, content_type, content_id);
CREATE INDEX IF NOT EXISTS likes_created_at_idx ON public.likes (created_at DESC);

-- Create constraint function to ensure content_id references valid content
CREATE OR REPLACE FUNCTION public.validate_like_content_id()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate that content_id references a valid video or post
    IF NEW.content_type = 'video' THEN
        IF NOT EXISTS (SELECT 1 FROM public.videos WHERE id = NEW.content_id) THEN
            RAISE EXCEPTION 'Invalid video_id: %', NEW.content_id;
        END IF;
    ELSIF NEW.content_type = 'post' THEN
        IF NOT EXISTS (SELECT 1 FROM public.posts WHERE id = NEW.content_id) THEN
            RAISE EXCEPTION 'Invalid post_id: %', NEW.content_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate content references
CREATE TRIGGER validate_like_content_trigger
    BEFORE INSERT OR UPDATE ON public.likes
    FOR EACH ROW EXECUTE FUNCTION public.validate_like_content_id();

-- Function to safely toggle like/unlike for content
CREATE OR REPLACE FUNCTION public.toggle_like(
    p_user_id uuid,
    p_content_type text,
    p_content_id uuid
)
RETURNS TABLE (
    liked boolean,
    total_likes integer
) 
LANGUAGE plpgsql
AS $$
DECLARE
    v_existing_like_id uuid;
    v_likes_count integer;
    v_liked boolean;
BEGIN
    -- Check if user already liked this content
    SELECT id INTO v_existing_like_id
    FROM public.likes 
    WHERE user_id = p_user_id 
      AND content_type = p_content_type 
      AND content_id = p_content_id;
    
    IF v_existing_like_id IS NOT NULL THEN
        -- User already liked it, so unlike (remove like)
        DELETE FROM public.likes WHERE id = v_existing_like_id;
        v_liked := false;
    ELSE
        -- User hasn't liked it, so like (add like)
        INSERT INTO public.likes (user_id, content_type, content_id)
        VALUES (p_user_id, p_content_type, p_content_id);
        v_liked := true;
    END IF;
    
    -- Get updated likes count
    SELECT COUNT(*) INTO v_likes_count
    FROM public.likes
    WHERE content_type = p_content_type AND content_id = p_content_id;
    
    -- Update the likes_count in the respective table
    IF p_content_type = 'video' THEN
        UPDATE public.videos 
        SET likes_count = v_likes_count, updated_at = now()
        WHERE id = p_content_id;
    ELSIF p_content_type = 'post' THEN
        UPDATE public.posts 
        SET likes_count = v_likes_count, updated_at = now()
        WHERE id = p_content_id;
    END IF;
    
    RETURN QUERY SELECT v_liked, v_likes_count;
END;
$$;

-- Function to get user's like status for multiple items
CREATE OR REPLACE FUNCTION public.get_user_like_status(
    p_user_id uuid,
    p_items jsonb -- Array of {content_type, content_id}
)
RETURNS TABLE (
    content_type text,
    content_id uuid,
    liked boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
    item jsonb;
BEGIN
    FOR item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        RETURN QUERY
        SELECT 
            (item->>'content_type')::text,
            (item->>'content_id')::uuid,
            EXISTS(
                SELECT 1 FROM public.likes l
                WHERE l.user_id = p_user_id
                  AND l.content_type = (item->>'content_type')::text
                  AND l.content_id = (item->>'content_id')::uuid
            ) as liked;
    END LOOP;
END;
$$;

-- Function to get user's liked content (their likes history)
CREATE OR REPLACE FUNCTION public.get_user_liked_content(
    p_user_id uuid,
    p_content_type text DEFAULT null,
    p_limit integer DEFAULT 20,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    content_type text,
    content_id uuid,
    liked_at timestamp with time zone,
    -- Content details
    content_title text,
    content_body text,
    content_author_username text,
    content_created_at timestamp with time zone
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.id,
        l.content_type,
        l.content_id,
        l.created_at as liked_at,
        -- Get content details based on type
        CASE 
            WHEN l.content_type = 'video' THEN (
                SELECT v.title FROM public.videos v WHERE v.id = l.content_id
            )
            WHEN l.content_type = 'post' THEN (
                SELECT left(p.content, 100) FROM public.posts p WHERE p.id = l.content_id
            )
        END as content_title,
        CASE 
            WHEN l.content_type = 'video' THEN (
                SELECT v.description FROM public.videos v WHERE v.id = l.content_id
            )
            WHEN l.content_type = 'post' THEN (
                SELECT p.content FROM public.posts p WHERE p.id = l.content_id
            )
        END as content_body,
        CASE 
            WHEN l.content_type = 'video' THEN (
                SELECT u.username FROM public.videos v 
                JOIN public.users u ON v.user_id = u.id 
                WHERE v.id = l.content_id
            )
            WHEN l.content_type = 'post' THEN (
                SELECT u.username FROM public.posts p 
                JOIN public.users u ON p.user_id = u.id 
                WHERE p.id = l.content_id
            )
        END as content_author_username,
        CASE 
            WHEN l.content_type = 'video' THEN (
                SELECT v.created_at FROM public.videos v WHERE v.id = l.content_id
            )
            WHEN l.content_type = 'post' THEN (
                SELECT p.created_at FROM public.posts p WHERE p.id = l.content_id
            )
        END as content_created_at
    FROM public.likes l
    WHERE l.user_id = p_user_id
      AND (p_content_type IS NULL OR l.content_type = p_content_type)
    ORDER BY l.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Row Level Security (RLS) policies
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

-- Users can view all likes (for displaying like counts)
CREATE POLICY "Anyone can view likes" ON public.likes
    FOR SELECT USING (true);

-- Users can only insert their own likes
CREATE POLICY "Users can insert own likes" ON public.likes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own likes
CREATE POLICY "Users can delete own likes" ON public.likes
    FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT ON public.likes TO authenticated;
GRANT SELECT ON public.likes TO anon;
GRANT INSERT, DELETE ON public.likes TO authenticated;

-- Grant execution permissions for like functions
GRANT EXECUTE ON FUNCTION public.toggle_like TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_like_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_liked_content TO authenticated;

-- Comments for documentation
COMMENT ON TABLE public.likes IS 'Table for tracking user likes on videos and posts';
COMMENT ON FUNCTION public.toggle_like IS 'Toggle like/unlike for content and update counts atomically';
COMMENT ON FUNCTION public.get_user_like_status IS 'Get user like status for multiple content items';
COMMENT ON FUNCTION public.get_user_liked_content IS 'Get user''s liked content history with details';