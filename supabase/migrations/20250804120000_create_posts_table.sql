-- Create posts table for SoberTube content
-- This migration creates the posts table for user-generated content

-- Create posts table with proper constraints and indexes
CREATE TABLE IF NOT EXISTS public.posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content text NOT NULL,
    post_type text NOT NULL DEFAULT 'Recovery Update',
    image_url text,
    likes_count integer DEFAULT 0 NOT NULL,
    comments_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Content constraints
    CONSTRAINT content_length CHECK (char_length(content) >= 1 AND char_length(content) <= 500),
    
    -- Post type constraints
    CONSTRAINT post_type_valid CHECK (post_type IN ('Recovery Update', 'Milestone', 'Inspiration', 'Question', 'Gratitude')),
    
    -- Count constraints
    CONSTRAINT likes_count_non_negative CHECK (likes_count >= 0),
    CONSTRAINT comments_count_non_negative CHECK (comments_count >= 0)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS posts_user_id_idx ON public.posts (user_id);
CREATE INDEX IF NOT EXISTS posts_created_at_idx ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS posts_post_type_idx ON public.posts (post_type);
CREATE INDEX IF NOT EXISTS posts_user_created_idx ON public.posts (user_id, created_at DESC);

-- Trigger to automatically update updated_at on row changes
CREATE TRIGGER update_posts_updated_at 
    BEFORE UPDATE ON public.posts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all public posts
CREATE POLICY "Posts are viewable by everyone" 
ON public.posts FOR SELECT 
USING (true);

-- Policy: Users can insert their own posts
CREATE POLICY "Users can insert their own posts" 
ON public.posts FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own posts
CREATE POLICY "Users can update their own posts" 
ON public.posts FOR UPDATE 
USING (auth.uid() = user_id);

-- Policy: Users can delete their own posts
CREATE POLICY "Users can delete their own posts" 
ON public.posts FOR DELETE 
USING (auth.uid() = user_id);

-- Add helpful comments
COMMENT ON TABLE public.posts IS 'User-generated posts for the SoberTube recovery community';
COMMENT ON COLUMN public.posts.content IS 'Post content with 500 character limit';
COMMENT ON COLUMN public.posts.post_type IS 'Type of post: Recovery Update, Milestone, Inspiration, Question, or Gratitude';
COMMENT ON COLUMN public.posts.likes_count IS 'Cached count of likes for performance';
COMMENT ON COLUMN public.posts.comments_count IS 'Cached count of comments for performance';