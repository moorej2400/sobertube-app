# SoberTube MVP Product Requirements Document

## Product Overview

SoberTube is a video-first recovery support platform that connects people in recovery through authentic storytelling, peer support, and community building. This MVP focuses on core social features that enable users to share their recovery journey, connect with peers, and build a supportive community.

### Mission
To make recovery education and peer support accessible to everyone through innovative video technology.

### Target Users
- Individuals in recovery (0-5+ years sober)
- People exploring recovery options  
- Family members supporting loved ones in recovery
- Recovery community advocates

## MVP Feature Set

### 1. User Account Creation & Authentication

**Core Requirements:**
- Email/password registration
- Email verification process
- Password reset functionality
- Account deletion capability

**Technical Implementation:**
- Supabase Auth for authentication
- Email confirmation via Supabase
- Secure password requirements (8+ chars, mixed case, numbers)
- Session management with JWT tokens

**Acceptance Criteria:**
- Users can create accounts with valid email addresses
- Email verification required before first login
- Password reset emails delivered within 1 minute
- Sessions persist for 30 days with remember me option

### 2. User Profiles

**Core Requirements:**
- Profile creation with basic information
- Privacy controls for profile visibility
- Sobriety date tracking
- Profile picture upload
- Bio/story section (500 character limit)

**Profile Fields:**
- Username (unique, 3-20 characters)
- Display name
- Sobriety date (optional)
- Location (city/state, optional)
- Bio/story
- Profile picture
- Recovery interests/tags

**Privacy Settings:**
- Public profile (visible to all users)
- Community only (visible to verified recovery community)
- Private (visible only to connections)

**Technical Implementation:**
- Supabase database schema for user profiles
- Image upload to Supabase Storage
- Real-time profile updates
- Form validation and error handling

### 3. Video Upload & Management

**Core Requirements:**
- Video upload (max 5 minutes for MVP)
- Basic video compression
- Video thumbnails
- Upload progress indicators
- Video deletion capability

**Video Specifications:**
- Max duration: 5 minutes
- Max file size: 500MB
- Supported formats: MP4, MOV, AVI
- Auto-generated thumbnails
- Mobile and desktop upload

**Content Guidelines:**
- Recovery-focused content only
- No triggering content (substances, etc.)
- Community guidelines enforcement
- Reporting system for inappropriate content

**Technical Implementation:**
- Supabase Storage for video files
- FFmpeg for video processing and thumbnails
- Progress tracking during upload
- Metadata storage in database

### 4. Timeline/Feed

**Core Requirements:**
- Chronological feed of community videos
- Video playback with basic controls
- Like/heart functionality
- Comment system
- Share to external platforms

**Feed Features:**
- Auto-play on scroll (muted by default)
- Infinite scroll pagination
- Video interaction metrics
- User can filter by recovery milestones
- Follow/unfollow functionality

**Video Player:**
- Play/pause controls
- Volume control
- Full-screen mode
- Seek bar
- Closed captions support (future enhancement)

**Technical Implementation:**
- Real-time feed updates using Supabase realtime
- Video streaming optimization
- Interaction tracking and analytics
- Efficient pagination with cursor-based loading

### 5. Posts & Text Content

**Core Requirements:**
- Text-only posts (500 character limit)
- Image posts (single image + caption)
- Milestone celebration posts
- Recovery tips and quotes
- Question/discussion posts

**Post Types:**
- **Recovery Update**: Daily/weekly check-ins
- **Milestone**: Sobriety anniversaries
- **Inspiration**: Motivational quotes/tips
- **Question**: Community discussion starters
- **Gratitude**: Thankfulness posts

**Interaction Features:**
- Like/heart posts
- Comment on posts
- Share posts
- Save posts for later
- Report inappropriate content

**Technical Implementation:**
- Post content stored in Supabase
- Rich text formatting (basic markdown)
- Image storage in Supabase Storage
- Real-time post updates
- Content moderation system

## Technical Architecture

### Backend: Supabase

**Database Schema:**
```sql
-- Users table
users (
  id uuid primary key,
  email text unique,
  username text unique,
  display_name text,
  bio text,
  profile_picture_url text,
  sobriety_date date,
  location text,
  privacy_level text,
  created_at timestamp,
  updated_at timestamp
)

-- Videos table  
videos (
  id uuid primary key,
  user_id uuid references users(id),
  title text,
  description text,
  video_url text,
  thumbnail_url text,
  duration integer,
  views_count integer default 0,
  likes_count integer default 0,
  created_at timestamp
)

-- Posts table
posts (
  id uuid primary key,
  user_id uuid references users(id),
  content text,
  post_type text,
  image_url text,
  likes_count integer default 0,
  comments_count integer default 0,
  created_at timestamp
)

-- Comments table
comments (
  id uuid primary key,
  user_id uuid references users(id),
  video_id uuid references videos(id),
  post_id uuid references posts(id),
  content text,
  created_at timestamp
)

-- Likes table
likes (
  id uuid primary key,
  user_id uuid references users(id),
  video_id uuid references videos(id),
  post_id uuid references posts(id),
  created_at timestamp
)
```

**Supabase Features Used:**
- Authentication & user management
- PostgreSQL database with Row Level Security
- Real-time subscriptions for live updates
- Storage for videos, images, and files
- Edge functions for video processing
- Built-in API generation

### Frontend: React

**Technology Stack:**
- React 18 with functional components and hooks
- TypeScript for type safety
- Vite for fast development and building
- Tailwind CSS for styling
- React Router for navigation
- React Query for data fetching and caching
- Supabase JS client library

**Key Components:**
```tsx
// Core layout components
<App />
<Header />
<Navigation />
<Sidebar />

// Authentication components
<LoginForm />
<SignupForm />
<ResetPassword />

// Profile components
<Profile />
<ProfileEditor />
<ProfileSettings />

// Video components
<VideoUpload />
<VideoPlayer />
<VideoCard />
<VideoFeed />

// Post components
<CreatePost />
<PostCard />
<PostFeed />
<CommentSection />

// UI components
<Button />
<Modal />
<LoadingSpinner />
<ErrorBoundary />
```

**State Management:**
- React Context for authentication state
- React Query for server state management
- Local state with useState/useReducer for UI state
- Supabase real-time for live data updates

**Responsive Design:**
- Mobile-first approach
- Responsive breakpoints: mobile (320px), tablet (768px), desktop (1024px)
- Touch-friendly interface elements
- Optimized video playback for mobile devices

## User Experience Flow

### Onboarding Flow
1. User visits landing page
2. Sign up with email/password
3. Email verification
4. Complete profile setup (username, bio, sobriety date)
5. Privacy settings configuration
6. Welcome to community feed

### Core User Journey
1. **Browse Feed**: View videos and posts from community
2. **Engage**: Like, comment, and share content
3. **Create Content**: Upload recovery videos or create posts
4. **Connect**: Follow other users and build network
5. **Celebrate**: Share milestones and achievements

### Content Creation Flow
1. Click "Create" button
2. Choose content type (video/post)
3. Upload/write content
4. Add title, description, tags
5. Set privacy level
6. Publish to community

## Success Metrics

### User Engagement
- Daily Active Users (DAU)
- Weekly Active Users (WAU)
- Average session duration
- Content creation rate (videos/posts per user)
- User retention (D1, D7, D30)

### Content Metrics
- Videos uploaded per day
- Average video completion rate
- Comments per video/post
- Likes per video/post
- Share rate

### Community Health
- User-to-user interactions
- Follow relationships
- Report rate (should be <1%)
- Content moderation response time
- User satisfaction score

## Security & Privacy

### Data Protection
- All data encrypted in transit and at rest
- GDPR/CCPA compliance
- User data export functionality
- Right to deletion/account closure
- Minimal data collection principle

### Content Safety
- Community guidelines enforcement
- User reporting system
- Content moderation queue
- AI-powered content screening (future)
- Crisis resource integration

### Privacy Controls
- Granular privacy settings
- Anonymous mode option
- Block/mute functionality
- Data sharing preferences
- Secure video streaming

## Future Enhancements (Post-MVP)

### Phase 2 Features
- Group support meetings (video rooms)
- Recovery milestone rewards
- Mentor/sponsee connections
- Progress tracking and analytics
- Push notifications

### Phase 3 Features
- AI-powered content recommendations
- Live streaming capabilities
- Recovery resource library
- Integration with recovery apps
- Enterprise/B2B features

## Development Timeline

### Sprint 1 (Weeks 1-2): Foundation
- Setup Supabase project and database schema
- Initialize React application with routing
- Implement authentication system
- Basic user profile creation

### Sprint 2 (Weeks 3-4): Core Features
- Video upload and storage
- Basic timeline/feed
- Post creation and display
- User interaction system (likes/comments)

### Sprint 3 (Weeks 5-6): Polish & Testing
- UI/UX improvements
- Mobile responsiveness
- Error handling and validation
- Performance optimization
- Beta testing preparation

### Sprint 4 (Weeks 7-8): Launch Prep
- Content moderation system
- Privacy controls implementation
- Final testing and bug fixes
- Documentation and deployment

## Technical Considerations

### Performance
- Video compression and optimization
- Lazy loading for feed content
- Image optimization and CDN usage
- Database query optimization
- Caching strategies with React Query

### Scalability
- Supabase auto-scaling capabilities
- Database indexing for performance
- CDN for global video delivery
- Modular component architecture
- API rate limiting

### Accessibility
- WCAG 2.1 AA compliance
- Screen reader compatibility
- Keyboard navigation support
- High contrast mode
- Closed captions for videos (future)

## Risk Mitigation

### Technical Risks
- Video upload failures → Retry mechanism and progress saving
- High bandwidth costs → Video compression and smart streaming
- Database performance → Query optimization and indexing
- Security vulnerabilities → Regular security audits

### Product Risks
- Low user engagement → A/B testing and user feedback loops
- Content quality issues → Community guidelines and moderation
- Privacy concerns → Transparent privacy policy and controls
- Platform abuse → Robust reporting and blocking features

This MVP provides a solid foundation for the SoberTube platform while maintaining focus on the core user needs of connection, support, and community building in recovery.