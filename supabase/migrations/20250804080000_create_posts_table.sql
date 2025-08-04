-- Create posts table for SoberTube text content
-- This migration creates the core posts table with proper constraints and policies

-- Create posts table with proper constraints and indexes
CREATE TABLE IF NOT EXISTS public.posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content text NOT NULL CHECK (char_length(content) <= 500 AND char_length(content) > 0),
    post_type text NOT NULL CHECK (post_type IN ('Recovery Update', 'Milestone', 'Inspiration', 'Question', 'Gratitude')),
    image_url text,
    likes_count integer DEFAULT 0 CHECK (likes_count >= 0),
    comments_count integer DEFAULT 0 CHECK (comments_count >= 0),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS posts_user_id_idx ON public.posts (user_id);
CREATE INDEX IF NOT EXISTS posts_created_at_idx ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS posts_post_type_idx ON public.posts (post_type);
CREATE INDEX IF NOT EXISTS posts_user_created_idx ON public.posts (user_id, created_at DESC);

-- Create trigger to automatically update updated_at on row changes
-- Note: The update_updated_at_column function is already created by the users table migration
CREATE TRIGGER update_posts_updated_at 
    BEFORE UPDATE ON public.posts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Anyone can view posts (public content)
CREATE POLICY "Anyone can view posts" ON public.posts
    FOR SELECT USING (true);

-- Users can only insert their own posts
CREATE POLICY "Users can insert own posts" ON public.posts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own posts
CREATE POLICY "Users can update own posts" ON public.posts
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can only delete their own posts
CREATE POLICY "Users can delete own posts" ON public.posts
    FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT ON public.posts TO authenticated;
GRANT SELECT ON public.posts TO anon;
GRANT INSERT, UPDATE, DELETE ON public.posts TO authenticated;