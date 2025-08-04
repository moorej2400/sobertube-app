-- Create comments table schema for SoberTube comment functionality
-- This migration creates the comments table for tracking comments on videos and posts

-- Create comments table with proper constraints and polymorphic design
CREATE TABLE IF NOT EXISTS public.comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content_type text NOT NULL CHECK (content_type IN ('video', 'post')),
    content_id uuid NOT NULL,
    parent_comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE, -- For threaded comments
    content text NOT NULL CHECK (char_length(content) <= 2000 AND char_length(content) > 0),
    likes_count integer DEFAULT 0 CHECK (likes_count >= 0),
    replies_count integer DEFAULT 0 CHECK (replies_count >= 0),
    is_edited boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS comments_user_id_idx ON public.comments (user_id);
CREATE INDEX IF NOT EXISTS comments_content_idx ON public.comments (content_type, content_id);
CREATE INDEX IF NOT EXISTS comments_content_created_idx ON public.comments (content_type, content_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_parent_idx ON public.comments (parent_comment_id);
CREATE INDEX IF NOT EXISTS comments_created_at_idx ON public.comments (created_at DESC);

-- Create trigger to automatically update updated_at on row changes
CREATE TRIGGER update_comments_updated_at 
    BEFORE UPDATE ON public.comments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create constraint function to ensure content_id references valid content
CREATE OR REPLACE FUNCTION public.validate_comment_content_id()
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
    
    -- Validate parent comment if specified
    IF NEW.parent_comment_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.comments 
            WHERE id = NEW.parent_comment_id 
              AND content_type = NEW.content_type 
              AND content_id = NEW.content_id
        ) THEN
            RAISE EXCEPTION 'Parent comment must belong to the same content';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate content and parent references
CREATE TRIGGER validate_comment_content_trigger
    BEFORE INSERT OR UPDATE ON public.comments
    FOR EACH ROW EXECUTE FUNCTION public.validate_comment_content_id();

-- Function to update comment counts in content tables
CREATE OR REPLACE FUNCTION public.update_comment_counts()
RETURNS TRIGGER AS $$
DECLARE
    v_comments_count integer;
    v_replies_count integer;
BEGIN
    -- Handle INSERT operations
    IF TG_OP = 'INSERT' THEN
        -- Update content table comment count
        SELECT COUNT(*) INTO v_comments_count
        FROM public.comments
        WHERE content_type = NEW.content_type AND content_id = NEW.content_id;
        
        IF NEW.content_type = 'video' THEN
            UPDATE public.videos 
            SET comments_count = v_comments_count, updated_at = now()
            WHERE id = NEW.content_id;
        ELSIF NEW.content_type = 'post' THEN
            UPDATE public.posts 
            SET comments_count = v_comments_count, updated_at = now()
            WHERE id = NEW.content_id;
        END IF;
        
        -- Update parent comment replies count if this is a reply
        IF NEW.parent_comment_id IS NOT NULL THEN
            SELECT COUNT(*) INTO v_replies_count
            FROM public.comments
            WHERE parent_comment_id = NEW.parent_comment_id;
            
            UPDATE public.comments
            SET replies_count = v_replies_count, updated_at = now()
            WHERE id = NEW.parent_comment_id;
        END IF;
        
        RETURN NEW;
    END IF;
    
    -- Handle DELETE operations
    IF TG_OP = 'DELETE' THEN
        -- Update content table comment count
        SELECT COUNT(*) INTO v_comments_count
        FROM public.comments
        WHERE content_type = OLD.content_type AND content_id = OLD.content_id;
        
        IF OLD.content_type = 'video' THEN
            UPDATE public.videos 
            SET comments_count = v_comments_count, updated_at = now()
            WHERE id = OLD.content_id;
        ELSIF OLD.content_type = 'post' THEN
            UPDATE public.posts 
            SET comments_count = v_comments_count, updated_at = now()
            WHERE id = OLD.content_id;
        END IF;
        
        -- Update parent comment replies count if this was a reply
        IF OLD.parent_comment_id IS NOT NULL THEN
            SELECT COUNT(*) INTO v_replies_count
            FROM public.comments
            WHERE parent_comment_id = OLD.parent_comment_id;
            
            UPDATE public.comments
            SET replies_count = v_replies_count, updated_at = now()
            WHERE id = OLD.parent_comment_id;
        END IF;
        
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update comment counts
CREATE TRIGGER update_comment_counts_trigger
    AFTER INSERT OR DELETE ON public.comments
    FOR EACH ROW EXECUTE FUNCTION public.update_comment_counts();

-- Function to get comments for content with pagination and threading
CREATE OR REPLACE FUNCTION public.get_comments_for_content(
    p_content_type text,
    p_content_id uuid,
    p_parent_comment_id uuid DEFAULT null,
    p_limit integer DEFAULT 20,
    p_offset integer DEFAULT 0,
    p_sort_order text DEFAULT 'newest' -- 'newest', 'oldest', 'most_liked'
)
RETURNS TABLE (
    id uuid,
    user_id uuid,
    username text,
    display_name text,
    profile_picture_url text,
    content text,
    likes_count integer,
    replies_count integer,
    is_edited boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent_comment_id uuid
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_order_clause text;
BEGIN
    -- Determine sort order
    CASE p_sort_order
        WHEN 'oldest' THEN v_order_clause := 'c.created_at ASC';
        WHEN 'most_liked' THEN v_order_clause := 'c.likes_count DESC, c.created_at DESC';
        ELSE v_order_clause := 'c.created_at DESC'; -- newest (default)
    END CASE;
    
    RETURN QUERY EXECUTE format('
        SELECT 
            c.id,
            c.user_id,
            u.username,
            u.display_name,
            u.profile_picture_url,
            c.content,
            c.likes_count,
            c.replies_count,
            c.is_edited,
            c.created_at,
            c.updated_at,
            c.parent_comment_id
        FROM public.comments c
        JOIN public.users u ON c.user_id = u.id
        WHERE c.content_type = $1 
          AND c.content_id = $2
          AND ($3 IS NULL AND c.parent_comment_id IS NULL OR c.parent_comment_id = $3)
        ORDER BY %s
        LIMIT $4 OFFSET $5
    ', v_order_clause)
    USING p_content_type, p_content_id, p_parent_comment_id, p_limit, p_offset;
END;
$$;

-- Function to create a new comment
CREATE OR REPLACE FUNCTION public.create_comment(
    p_user_id uuid,
    p_content_type text,
    p_content_id uuid,
    p_content text,
    p_parent_comment_id uuid DEFAULT null
)
RETURNS TABLE (
    id uuid,
    user_id uuid,
    username text,
    display_name text,
    profile_picture_url text,
    content text,
    likes_count integer,
    replies_count integer,
    is_edited boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent_comment_id uuid
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_comment_id uuid;
BEGIN
    -- Insert the comment
    INSERT INTO public.comments (user_id, content_type, content_id, content, parent_comment_id)
    VALUES (p_user_id, p_content_type, p_content_id, p_content, p_parent_comment_id)
    RETURNING comments.id INTO v_comment_id;
    
    -- Return the created comment with user details
    RETURN QUERY
    SELECT 
        c.id,
        c.user_id,
        u.username,
        u.display_name,
        u.profile_picture_url,
        c.content,
        c.likes_count,
        c.replies_count,
        c.is_edited,
        c.created_at,
        c.updated_at,
        c.parent_comment_id
    FROM public.comments c
    JOIN public.users u ON c.user_id = u.id
    WHERE c.id = v_comment_id;
END;
$$;

-- Function to update a comment
CREATE OR REPLACE FUNCTION public.update_comment(
    p_comment_id uuid,
    p_user_id uuid,
    p_new_content text
)
RETURNS TABLE (
    id uuid,
    user_id uuid,
    username text,
    display_name text,
    profile_picture_url text,
    content text,
    likes_count integer,
    replies_count integer,
    is_edited boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent_comment_id uuid
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update the comment
    UPDATE public.comments 
    SET content = p_new_content, 
        is_edited = true,
        updated_at = now()
    WHERE id = p_comment_id AND user_id = p_user_id;
    
    -- Return the updated comment with user details
    RETURN QUERY
    SELECT 
        c.id,
        c.user_id,
        u.username,
        u.display_name,
        u.profile_picture_url,
        c.content,
        c.likes_count,
        c.replies_count,
        c.is_edited,
        c.created_at,
        c.updated_at,
        c.parent_comment_id
    FROM public.comments c
    JOIN public.users u ON c.user_id = u.id
    WHERE c.id = p_comment_id;
END;
$$;

-- Row Level Security (RLS) policies
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Anyone can view comments
CREATE POLICY "Anyone can view comments" ON public.comments
    FOR SELECT USING (true);

-- Users can only insert their own comments
CREATE POLICY "Users can insert own comments" ON public.comments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own comments
CREATE POLICY "Users can update own comments" ON public.comments
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can only delete their own comments
CREATE POLICY "Users can delete own comments" ON public.comments
    FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT ON public.comments TO authenticated;
GRANT SELECT ON public.comments TO anon;
GRANT INSERT, UPDATE, DELETE ON public.comments TO authenticated;

-- Grant execution permissions for comment functions
GRANT EXECUTE ON FUNCTION public.get_comments_for_content TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_comments_for_content TO anon;
GRANT EXECUTE ON FUNCTION public.create_comment TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_comment TO authenticated;

-- Comments for documentation
COMMENT ON TABLE public.comments IS 'Table for storing comments on videos and posts with threading support';
COMMENT ON FUNCTION public.get_comments_for_content IS 'Get paginated comments for content with threading and sorting options';
COMMENT ON FUNCTION public.create_comment IS 'Create a new comment and return it with user details';
COMMENT ON FUNCTION public.update_comment IS 'Update a comment and return the updated version with user details';