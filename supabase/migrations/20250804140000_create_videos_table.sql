-- Create videos table for SoberTube video content
-- This migration creates the core videos table with proper constraints, indexes, and policies

-- Create videos table with proper constraints and indexes
CREATE TABLE IF NOT EXISTS public.videos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title varchar(200) NOT NULL CHECK (char_length(title) <= 200 AND char_length(title) > 0),
    description text CHECK (char_length(description) <= 2000),
    video_url text NOT NULL CHECK (char_length(video_url) > 0),
    thumbnail_url text,
    duration integer NOT NULL CHECK (duration > 0 AND duration <= 300), -- max 5 minutes in seconds
    file_size bigint NOT NULL CHECK (file_size > 0 AND file_size <= 524288000), -- max 500MB in bytes
    format varchar(10) NOT NULL CHECK (format IN ('mp4', 'mov', 'avi')),
    views_count integer DEFAULT 0 CHECK (views_count >= 0),
    likes_count integer DEFAULT 0 CHECK (likes_count >= 0),
    comments_count integer DEFAULT 0 CHECK (comments_count >= 0),
    status varchar(20) DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS videos_user_id_idx ON public.videos (user_id);
CREATE INDEX IF NOT EXISTS videos_created_at_idx ON public.videos (created_at DESC);
CREATE INDEX IF NOT EXISTS videos_status_idx ON public.videos (status);
CREATE INDEX IF NOT EXISTS videos_user_created_idx ON public.videos (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS videos_user_status_idx ON public.videos (user_id, status);

-- Create trigger to automatically update updated_at on row changes
-- Note: The update_updated_at_column function is already created by the users table migration
CREATE TRIGGER update_videos_updated_at 
    BEFORE UPDATE ON public.videos
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

-- Anyone can view ready videos (public content)
CREATE POLICY "Anyone can view ready videos" ON public.videos
    FOR SELECT USING (status = 'ready');

-- Users can only insert their own videos
CREATE POLICY "Users can insert own videos" ON public.videos
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can only update their own videos
CREATE POLICY "Users can update own videos" ON public.videos
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can only delete their own videos
CREATE POLICY "Users can delete own videos" ON public.videos
    FOR DELETE USING (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT ON public.videos TO authenticated;
GRANT SELECT ON public.videos TO anon;
GRANT INSERT, UPDATE, DELETE ON public.videos TO authenticated;