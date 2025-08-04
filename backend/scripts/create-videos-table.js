/**
 * Script to create videos table for testing
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.test' });

async function createVideosTable() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('Creating videos table...');

  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS public.videos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      title varchar(200) NOT NULL CHECK (char_length(title) <= 200 AND char_length(title) > 0),
      description text CHECK (char_length(description) <= 2000),
      video_url text NOT NULL CHECK (char_length(video_url) > 0),
      thumbnail_url text,
      duration integer NOT NULL CHECK (duration > 0 AND duration <= 300),
      file_size bigint NOT NULL CHECK (file_size > 0 AND file_size <= 524288000),
      format varchar(10) NOT NULL CHECK (format IN ('mp4', 'mov', 'avi')),
      views_count integer DEFAULT 0 CHECK (views_count >= 0),
      likes_count integer DEFAULT 0 CHECK (likes_count >= 0),
      comments_count integer DEFAULT 0 CHECK (comments_count >= 0),
      status varchar(20) DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
      created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
      updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
    );
  `;

  const createIndexesSQL = `
    CREATE INDEX IF NOT EXISTS videos_user_id_idx ON public.videos (user_id);
    CREATE INDEX IF NOT EXISTS videos_created_at_idx ON public.videos (created_at DESC);
    CREATE INDEX IF NOT EXISTS videos_status_idx ON public.videos (status);
    CREATE INDEX IF NOT EXISTS videos_user_created_idx ON public.videos (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS videos_user_status_idx ON public.videos (user_id, status);
  `;

  const enableRLSSQL = `
    ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
  `;

  try {
    // Execute SQL statements
    const { error: tableError } = await supabase.rpc('exec_sql', { sql: createTableSQL });
    if (tableError) {
      console.error('Error creating table:', tableError);
      return;
    }
    console.log('✅ Videos table created successfully');

    const { error: indexError } = await supabase.rpc('exec_sql', { sql: createIndexesSQL });
    if (indexError) {
      console.error('Error creating indexes:', indexError);
      return;
    }
    console.log('✅ Indexes created successfully');

    const { error: rlsError } = await supabase.rpc('exec_sql', { sql: enableRLSSQL });
    if (rlsError) {
      console.error('Error enabling RLS:', rlsError);
      return;
    }
    console.log('✅ RLS enabled successfully');

    console.log('🎉 Videos table setup complete!');
  } catch (error) {
    console.error('Error:', error);
  }
}

createVideosTable();