# SoberTube Cloud-Agnostic Migration Guide

## Overview

This guide provides step-by-step instructions for migrating the current SoberTube application (95% complete with custom implementations) to a cloud-agnostic architecture using self-hosted Supabase services.

## Pre-Migration Assessment

### Current System Analysis

**Existing Components:**
- ✅ Custom Node.js/Express backend with TypeScript
- ✅ Custom WebSocket server for real-time features
- ✅ Direct PostgreSQL database queries
- ✅ Custom JWT authentication middleware
- ✅ Basic file storage implementation
- ✅ 95% complete social features (likes, comments, follows)

**Migration Benefits:**
- Standardized Supabase ecosystem
- Cloud-agnostic deployment flexibility
- Reduced custom infrastructure maintenance
- Enhanced security with RLS policies
- Better real-time performance
- Simplified development workflow

### Migration Readiness Checklist

**Infrastructure:**
- [ ] Docker and Docker Compose installed
- [ ] Kubernetes cluster available (for production)
- [ ] CI/CD pipeline ready for new deployment
- [ ] Monitoring tools configured
- [ ] Backup procedures in place

**Development Environment:**
- [ ] Development team trained on Supabase concepts
- [ ] Local development environment tested
- [ ] Feature flags implemented for gradual rollout
- [ ] Testing framework ready for new architecture

**Data Preparation:**
- [ ] Current database schema documented
- [ ] Data backup created and verified
- [ ] User accounts and sessions inventoried
- [ ] File storage content catalogued

## Migration Phases

## Phase 1: Local Development Environment Setup (1-2 weeks)

### Step 1.1: Repository Preparation

**1.1.1: Create Migration Branch**
```bash
# Create feature branch for cloud-agnostic migration
git checkout -b feature/cloud-agnostic-architecture
git push -u origin feature/cloud-agnostic-architecture
```

**1.1.2: Add Docker Configuration Files**
```bash
# Copy the provided configuration files
cp docker-compose.local.yml docker-compose.yml
cp .env.local.example .env.local
cp .env.production.example .env.production

# Create necessary directories
mkdir -p nginx/conf.d
mkdir -p nginx/ssl
mkdir -p database/init
mkdir -p database/migrations
mkdir -p monitoring/prometheus
mkdir -p monitoring/grafana/provisioning
mkdir -p monitoring/grafana/dashboards
mkdir -p supabase/functions
```

**1.1.3: Configure Environment Variables**
```bash
# Generate secure secrets
openssl rand -hex 32  # For JWT_SECRET
openssl rand -hex 32  # For REALTIME_ENCRYPTION_KEY
openssl rand -hex 64  # For REALTIME_SECRET_KEY_BASE

# Update .env.local with generated secrets
nano .env.local
```

### Step 1.2: Docker Compose Environment

**1.2.1: Start Core Services**
```bash
# Start all services
docker-compose up -d

# Verify all services are healthy
docker-compose ps

# Check service logs
docker-compose logs postgres
docker-compose logs realtime
docker-compose logs auth
```

**1.2.2: Verify Service Communication**
```bash
# Test PostgreSQL connection
docker exec -it sobertube_postgres psql -U supabase_admin -d postgres -c "SELECT version();"

# Test PostgREST API
curl http://localhost:3000/

# Test GoTrue Auth
curl http://localhost:9999/health

# Test Realtime WebSocket
curl http://localhost:4000/health

# Test Storage API
curl http://localhost:5000/status
```

**1.2.3: Initialize Development Data**
```bash
# Create database schema
docker exec -it sobertube_postgres psql -U supabase_admin -d postgres -f /docker-entrypoint-initdb.d/init.sql

# Seed development data
docker exec -it sobertube_postgres psql -U supabase_admin -d postgres -f /docker-entrypoint-initdb.d/seed.sql
```

### Step 1.3: Frontend Configuration

**1.3.1: Install Supabase Client**
```bash
# Install Supabase JavaScript client
npm install @supabase/supabase-js

# Update environment configuration
echo "VITE_SUPABASE_URL=http://localhost:8000" >> .env.local
echo "VITE_SUPABASE_ANON_KEY=your_anon_key_here" >> .env.local
```

**1.3.2: Create Supabase Client Configuration**
```typescript
// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    channels: {
      self: true,
    },
  },
})
```

## Phase 2: Database Schema Migration (1-2 weeks)

### Step 2.1: Schema Analysis and Design

**2.1.1: Document Current Schema**
```bash
# Export current database schema
pg_dump --schema-only --no-owner --no-privileges current_database > current_schema.sql

# Analyze table structure
psql -d current_database -c "\dt"
psql -d current_database -c "\d+ users"
psql -d current_database -c "\d+ posts"
# ... for all tables
```

**2.1.2: Design Supabase-Optimized Schema**
```sql
-- database/migrations/001_initial_schema.sql
-- Users table with RLS
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    bio TEXT,
    profile_picture_url TEXT,
    sobriety_date DATE,
    location TEXT,
    privacy_level TEXT DEFAULT 'public' CHECK (privacy_level IN ('public', 'community', 'private')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view public profiles" ON public.users
    FOR SELECT USING (privacy_level = 'public');

CREATE POLICY "Users can view their own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

-- Posts table with RLS
CREATE TABLE IF NOT EXISTS public.posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    post_type TEXT DEFAULT 'update' CHECK (post_type IN ('update', 'milestone', 'inspiration', 'question', 'gratitude')),
    image_url TEXT,
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for posts
CREATE POLICY "Users can view public posts" ON public.posts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = posts.user_id 
            AND users.privacy_level = 'public'
        )
    );

CREATE POLICY "Users can view their own posts" ON public.posts
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own posts" ON public.posts
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own posts" ON public.posts
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own posts" ON public.posts
    FOR DELETE USING (user_id = auth.uid());
```

**2.1.3: Create Migration Scripts**
```sql
-- database/migrations/002_create_functions.sql
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON public.posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update post stats
CREATE OR REPLACE FUNCTION update_post_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update likes count
    IF TG_TABLE_NAME = 'likes' THEN
        IF TG_OP = 'INSERT' THEN
            UPDATE public.posts 
            SET likes_count = likes_count + 1 
            WHERE id = NEW.post_id;
        ELSIF TG_OP = 'DELETE' THEN
            UPDATE public.posts 
            SET likes_count = likes_count - 1 
            WHERE id = OLD.post_id;
        END IF;
    END IF;
    
    -- Update comments count
    IF TG_TABLE_NAME = 'comments' THEN
        IF TG_OP = 'INSERT' THEN
            UPDATE public.posts 
            SET comments_count = comments_count + 1 
            WHERE id = NEW.post_id;
        ELSIF TG_OP = 'DELETE' THEN
            UPDATE public.posts 
            SET comments_count = comments_count - 1 
            WHERE id = OLD.post_id;
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
```

### Step 2.2: Data Migration

**2.2.1: Export Existing Data**
```bash
# Export user data
pg_dump --data-only --table=users current_database > data/users_export.sql

# Export posts data
pg_dump --data-only --table=posts current_database > data/posts_export.sql

# Export all related data
pg_dump --data-only --exclude-table=sessions current_database > data/full_export.sql
```

**2.2.2: Transform Data for New Schema**
```bash
# Create data transformation script
cat > scripts/transform_data.py << 'EOF'
#!/usr/bin/env python3
import psycopg2
import uuid
from datetime import datetime

# Connect to both databases
old_conn = psycopg2.connect("postgresql://user:pass@localhost/old_db")
new_conn = psycopg2.connect("postgresql://supabase_admin:pass@localhost/postgres")

def migrate_users():
    old_cur = old_conn.cursor()
    new_cur = new_conn.cursor()
    
    # Fetch users from old database
    old_cur.execute("SELECT * FROM users")
    users = old_cur.fetchall()
    
    for user in users:
        # Transform user data
        user_data = {
            'id': str(uuid.uuid4()),
            'email': user[1],
            'username': user[2],
            # ... transform other fields
        }
        
        # Insert into new database
        new_cur.execute("""
            INSERT INTO public.users (id, email, username, ...)
            VALUES (%(id)s, %(email)s, %(username)s, ...)
        """, user_data)
    
    new_conn.commit()

if __name__ == "__main__":
    migrate_users()
    print("Migration completed successfully")
EOF

python3 scripts/transform_data.py
```

**2.2.3: Verify Data Migration**
```bash
# Verify record counts
docker exec -it sobertube_postgres psql -U supabase_admin -d postgres -c "SELECT COUNT(*) FROM public.users;"
docker exec -it sobertube_postgres psql -U supabase_admin -d postgres -c "SELECT COUNT(*) FROM public.posts;"

# Verify data integrity
docker exec -it sobertube_postgres psql -U supabase_admin -d postgres -c "SELECT * FROM public.users LIMIT 5;"
```

## Phase 3: Authentication Migration (1-2 weeks)

### Step 3.1: GoTrue Configuration

**3.1.1: Configure GoTrue Settings**
```bash
# Update .env.local with proper GoTrue configuration
cat >> .env.local << 'EOF'
# GoTrue Configuration
GOTRUE_SITE_URL=http://localhost:3000
GOTRUE_DISABLE_SIGNUP=false
GOTRUE_EMAIL_CONFIRM_ENABLED=true
GOTRUE_EMAIL_AUTOCONFIRM=false
GOTRUE_SMS_AUTOCONFIRM=false
GOTRUE_MAILER_AUTOCONFIRM=false
EOF

# Restart auth service
docker-compose restart auth
```

**3.1.2: Create User Migration Script**
```javascript
// scripts/migrate_auth_users.js
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');

const supabase = createClient(
  'http://localhost:8000',
  'service_key_here'
);

async function migrateUsers() {
  // Get users from old system
  const oldUsers = await getOldUsers();
  
  for (const user of oldUsers) {
    try {
      // Create user in GoTrue
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: generateTemporaryPassword(),
        email_confirm: true,
        user_metadata: {
          username: user.username,
          display_name: user.display_name,
          migrated: true
        }
      });
      
      if (error) {
        console.error(`Failed to migrate user ${user.email}:`, error);
      } else {
        console.log(`Successfully migrated user ${user.email}`);
      }
    } catch (err) {
      console.error(`Error migrating user ${user.email}:`, err);
    }
  }
}

migrateUsers();
```

### Step 3.2: Frontend Authentication Update

**3.2.1: Update Authentication Components**
```typescript
// src/hooks/useAuth.ts
import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  };

  const signUp = async (email: string, password: string, metadata?: any) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
      },
    });
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  return {
    user,
    loading,
    signIn,
    signUp,
    signOut,
  };
}
```

**3.2.2: Update Login Component**
```typescript
// src/components/LoginForm.tsx
import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await signIn(email, password);
    
    if (error) {
      setError(error.message);
    }
    
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      {error && <div className="error">{error}</div>}
      <button type="submit" disabled={loading}>
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
}
```

## Phase 4: Real-Time Migration (1-2 weeks)

### Step 4.1: Replace Custom WebSocket

**4.1.1: Remove Custom WebSocket Server**
```bash
# Backup current WebSocket implementation
cp -r src/websocket src/websocket.backup

# Create feature flag for gradual migration
echo "ENABLE_SUPABASE_REALTIME=false" >> .env.local
```

**4.1.2: Implement Supabase Realtime**
```typescript
// src/hooks/useRealtime.ts
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useRealtimePosts() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    // Subscribe to posts changes
    const channel = supabase
      .channel('posts_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'posts'
        },
        (payload) => {
          console.log('Posts change received!', payload);
          
          if (payload.eventType === 'INSERT') {
            setPosts(current => [payload.new, ...current]);
          } else if (payload.eventType === 'UPDATE') {
            setPosts(current => 
              current.map(post => 
                post.id === payload.new.id ? payload.new : post
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setPosts(current => 
              current.filter(post => post.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return posts;
}
```

**4.1.3: Implement Presence Tracking**
```typescript
// src/hooks/usePresence.ts
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export function usePresence(roomId: string) {
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    const channel = supabase.channel(roomId, {
      config: {
        presence: {
          key: 'user_id',
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const newState = channel.presenceState();
        setOnlineUsers(Object.values(newState).flat());
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('User joined:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('User left:', key, leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Track presence
          await channel.track({
            user_id: supabase.auth.user()?.id,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  return onlineUsers;
}
```

## Phase 5: Storage Migration (1-2 weeks)

### Step 5.1: Configure Storage Policies

**5.1.1: Create Storage Buckets and Policies**
```sql
-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('avatars', 'avatars', true),
  ('posts', 'posts', true),
  ('videos', 'videos', true);

-- Storage policies for avatars
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own avatar" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for posts
CREATE POLICY "Post images are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'posts');

CREATE POLICY "Users can upload post images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'posts' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

**5.1.2: Migrate Existing Files**
```bash
# Create file migration script
cat > scripts/migrate_files.py << 'EOF'
#!/usr/bin/env python3
import os
import shutil
from supabase import create_client

# Initialize Supabase client
supabase = create_client("http://localhost:8000", "service_key_here")

def migrate_files():
    # Get list of files from old storage
    old_storage_path = "/path/to/old/storage"
    
    for root, dirs, files in os.walk(old_storage_path):
        for file in files:
            old_file_path = os.path.join(root, file)
            
            # Determine bucket and new path
            if 'avatars' in root:
                bucket = 'avatars'
            elif 'posts' in root:
                bucket = 'posts'
            else:
                continue
                
            # Upload to Supabase Storage
            with open(old_file_path, 'rb') as f:
                result = supabase.storage.from_(bucket).upload(
                    file_path=f"migrated/{file}",
                    file=f,
                    file_options={"content-type": "image/jpeg"}
                )
                
            if result.error:
                print(f"Error uploading {file}: {result.error}")
            else:
                print(f"Successfully uploaded {file}")

migrate_files()
EOF

python3 scripts/migrate_files.py
```

### Step 5.2: Update Frontend Storage Integration

**5.2.1: Create Storage Helper Functions**
```typescript
// src/lib/storage.ts
import { supabase } from './supabaseClient';

export async function uploadFile(
  bucket: string,
  path: string,
  file: File
): Promise<{ data: any; error: any }> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false
    });

  return { data, error };
}

export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);
    
  return data.publicUrl;
}

export async function deleteFile(
  bucket: string,
  path: string
): Promise<{ data: any; error: any }> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .remove([path]);

  return { data, error };
}
```

**5.2.2: Update File Upload Components**
```typescript
// src/components/FileUpload.tsx
import React, { useState } from 'react';
import { uploadFile, getPublicUrl } from '../lib/storage';

interface FileUploadProps {
  bucket: string;
  onUpload: (url: string) => void;
}

export function FileUpload({ bucket, onUpload }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);

      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select a file to upload.');
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error } = await uploadFile(bucket, filePath, file);

      if (error) {
        throw error;
      }

      const publicUrl = getPublicUrl(bucket, filePath);
      onUpload(publicUrl);
    } catch (error) {
      alert('Error uploading file!');
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="button primary block" htmlFor="single">
        {uploading ? 'Uploading...' : 'Upload'}
      </label>
      <input
        style={{
          visibility: 'hidden',
          position: 'absolute',
        }}
        type="file"
        id="single"
        accept="image/*"
        onChange={handleUpload}
        disabled={uploading}
      />
    </div>
  );
}
```

## Phase 6: Testing and Validation (1 week)

### Step 6.1: Automated Testing

**6.1.1: Update Integration Tests**
```typescript
// tests/integration/auth.test.ts
import { supabase } from '../../src/lib/supabaseClient';

describe('Authentication Integration', () => {
  test('should sign up a new user', async () => {
    const email = `test-${Date.now()}@example.com`;
    const password = 'testpassword123';

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    expect(error).toBeNull();
    expect(data.user).toBeTruthy();
    expect(data.user?.email).toBe(email);
  });

  test('should sign in with valid credentials', async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'testpassword123',
    });

    expect(error).toBeNull();
    expect(data.user).toBeTruthy();
  });
});
```

**6.1.2: Test Real-Time Features**
```typescript
// tests/integration/realtime.test.ts
import { supabase } from '../../src/lib/supabaseClient';

describe('Real-Time Integration', () => {
  test('should receive post updates', (done) => {
    const channel = supabase
      .channel('test_posts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts'
        },
        (payload) => {
          expect(payload.new).toBeTruthy();
          done();
        }
      )
      .subscribe();

    // Create a test post
    setTimeout(async () => {
      await supabase
        .from('posts')
        .insert([
          { content: 'Test post', user_id: 'test-user-id' }
        ]);
    }, 100);
  });
});
```

### Step 6.2: Performance Testing

**6.2.1: Load Testing Configuration**
```javascript
// tests/load/k6-load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 }, // Below normal load
    { duration: '5m', target: 100 },
    { duration: '2m', target: 200 }, // Normal load
    { duration: '5m', target: 200 },
    { duration: '2m', target: 300 }, // Around the breaking point
    { duration: '5m', target: 300 },
    { duration: '2m', target: 400 }, // Beyond the breaking point
    { duration: '5m', target: 400 },
    { duration: '10m', target: 0 }, // Scale down. Recovery stage.
  ],
};

export default function () {
  let response = http.get('http://localhost:8000/rest/v1/posts');
  check(response, { 'status was 200': (r) => r.status == 200 });
  sleep(1);
}
```

**6.2.2: Run Performance Tests**
```bash
# Install k6
curl https://github.com/grafana/k6/releases/download/v0.46.0/k6-v0.46.0-linux-amd64.tar.gz -L | tar xvz --strip-components 1

# Run load tests
./k6 run tests/load/k6-load-test.js
```

## Phase 7: Production Deployment (1-2 weeks)

### Step 7.1: Production Environment Setup

**7.1.1: Choose Deployment Target**
```bash
# For AWS EKS
eksctl create cluster --name sobertube-prod --region us-east-1

# For Google GKE
gcloud container clusters create sobertube-prod --zone us-central1-a

# For Azure AKS
az aks create --resource-group sobertube-rg --name sobertube-prod --node-count 3
```

**7.1.2: Deploy Infrastructure**
```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmaps.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/supabase-services.yaml
kubectl apply -f k8s/ingress.yaml

# Verify deployment
kubectl get pods -n sobertube
kubectl get services -n sobertube
```

### Step 7.2: Data Migration to Production

**7.2.1: Production Database Migration**
```bash
# Create production database backup
pg_dump --clean --no-owner --no-privileges local_database > production_migration.sql

# Apply to production database
kubectl exec -it postgres-pod -- psql -U postgres -d sobertube_prod -f /tmp/production_migration.sql
```

**7.2.2: File Storage Migration**
```bash
# Sync files to production storage
aws s3 sync local_storage/ s3://sobertube-prod-storage/
# or
gsutil -m rsync -r local_storage/ gs://sobertube-prod-storage/
```

### Step 7.3: DNS and Traffic Cutover

**7.3.1: Configure DNS**
```bash
# Update DNS records to point to new infrastructure
# Example for AWS Route 53
aws route53 change-resource-record-sets --hosted-zone-id Z123456789 --change-batch file://dns-changes.json
```

**7.3.2: Gradual Traffic Migration**
```bash
# Use weighted routing for gradual migration
# Start with 10% traffic to new system
# Gradually increase to 100% over 24-48 hours
```

## Phase 8: Post-Migration Optimization (1 week)

### Step 8.1: Performance Monitoring

**8.1.1: Configure Monitoring**
```bash
# Deploy monitoring stack
kubectl apply -f k8s/monitoring/prometheus.yaml
kubectl apply -f k8s/monitoring/grafana.yaml

# Access Grafana dashboard
kubectl port-forward service/grafana 3000:3000
```

**8.1.2: Set Up Alerts**
```yaml
# monitoring/alerts.yaml
groups:
  - name: sobertube.rules
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: High error rate detected
          description: "Error rate is {{ $value }} errors per second"
```

### Step 8.2: Cleanup and Documentation

**8.2.1: Remove Old Infrastructure**
```bash
# Decommission old servers
# Update documentation
# Archive old code
git tag v1.0.0-pre-migration
git branch archive/pre-cloud-agnostic
```

**8.2.2: Team Training**
```bash
# Create operational runbooks
# Train team on new architecture
# Update CI/CD pipelines
# Document troubleshooting procedures
```

## Rollback Procedures

### Emergency Rollback Plan

**If Critical Issues Occur:**
1. **Immediate DNS Rollback**: Revert DNS to old infrastructure
2. **Database Rollback**: Restore from backup if needed
3. **Code Rollback**: Deploy previous version
4. **Communication**: Notify stakeholders of rollback

**Rollback Commands:**
```bash
# DNS rollback
aws route53 change-resource-record-sets --hosted-zone-id Z123456789 --change-batch file://rollback-dns.json

# Application rollback
kubectl rollout undo deployment/app-deployment

# Database rollback (if needed)
pg_restore --clean --no-owner backup_before_migration.sql
```

## Success Criteria

### Migration Success Metrics
- [ ] All existing functionality preserved
- [ ] Performance equal or better than before
- [ ] Zero data loss during migration
- [ ] All users successfully migrated
- [ ] Real-time features working correctly
- [ ] File uploads/downloads working
- [ ] Authentication working seamlessly

### Post-Migration Benefits
- [ ] Reduced infrastructure maintenance overhead
- [ ] Improved development velocity
- [ ] Better security with RLS policies
- [ ] Enhanced real-time capabilities
- [ ] Cloud deployment flexibility
- [ ] Standardized Supabase ecosystem

## Troubleshooting Guide

### Common Issues and Solutions

**Database Connection Issues:**
```bash
# Check PostgreSQL logs
kubectl logs postgres-pod
# Verify connection string
kubectl describe secret database-secrets
```

**Authentication Issues:**
```bash
# Check GoTrue logs
kubectl logs gotrue-pod
# Verify JWT configuration
curl http://localhost:9999/health
```

**Real-Time Issues:**
```bash
# Check Realtime server logs
kubectl logs realtime-pod
# Test WebSocket connection
wscat -c ws://localhost:4000/socket/websocket
```

**Storage Issues:**
```bash
# Check Storage API logs
kubectl logs storage-api-pod
# Verify MinIO connection
mc admin info myminio
```

This comprehensive migration guide provides step-by-step instructions for successfully transitioning to a cloud-agnostic architecture while maintaining all existing functionality and improving system reliability and maintainability.