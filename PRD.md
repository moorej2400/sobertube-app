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

## Incremental Development Plan

### Test-Driven Development Requirements
- **EVERYTHING must be unit and integration tested**
- Features must be developed so each sub-feature is fully testable and verifiable
- Testing is mandatory before proceeding to next development step
- If errors occur during development:
  - STOP immediately
  - Ask user for help to unblock
  - Never proceed with known issues

### Critical Development Rules
- **ALWAYS develop incrementally**: small working feature → test → validate → repeat
- Use a simple, incremental approach where we can measure progress
- **NEVER change the plan without user approval**
- **NEVER fake tests** just to get something to pass
- **NEVER implement mock methods** with fake responses just to compile and move on
- Follow strict TDD methodology to verify working functionality
- Use real integration tests that actually call the system

### Test Organization
- Tests must be properly organized
- **ALWAYS place tests** in the appropriate location within the test folder
- Maintain clear separation between unit and integration tests

---

## Phase-Based Implementation

### Phase 1: Infrastructure Setup

**Phase 1.1: Docker Environment Setup**
- [x] Create docker-compose.yml with Supabase local development
- [x] Configure PostgreSQL database service
- [x] Set up Supabase local instance
- [x] Configure environment variables and secrets management
- [x] **Tests Required:** Docker services start successfully, database connection tests
- [x] **Acceptance Criteria:** All services run via docker-compose, database accessible

**Phase 1.2: Project Structure & CI/CD**
- [x] Initialize project workspace structure (backend/frontend separation)
- [x] Setup shared environment configuration ✅
- [x] Configure development/testing/production environments
- [x] **Tests Required:** Environment variable validation, build process tests ✅
- [x] **Acceptance Criteria:** Consistent environment setup across all stages ✅

### Phase 2: Backend Development

**Phase 2.1: Backend Foundation**
- [x] Initialize Node.js/TypeScript backend project
- [x] Setup test framework (Jest + Supertest)
- [x] Configure Supabase client and database connection
- [x] Implement basic error handling and logging
- [x] **Tests Required:** Server startup tests, database connection tests, error handling tests ✅
- [x] **Acceptance Criteria:** Backend server runs, connects to database, handles errors gracefully ✅

**Phase 2.2: Authentication System (Backend)**
- [x] Implement user registration endpoint
- [x] Implement login/logout endpoints
- [x] JWT token management and validation middleware
- [ ] Session management with refresh tokens
- [ ] **Tests Required:** Registration endpoint tests, login flow tests, token validation tests
- [ ] **Acceptance Criteria:** Users can register/login via API, tokens work correctly

**Phase 2.3: User Profile System (Backend)**
- [ ] Create users table schema and migrations
- [ ] Implement profile CRUD endpoints (Create, Read, Update)
- [ ] Username uniqueness validation
- [ ] Profile data validation and sanitization
- [ ] **Tests Required:** Database schema tests, CRUD endpoint tests, validation tests
- [ ] **Acceptance Criteria:** Profile API endpoints work correctly with proper validation

**Phase 2.4: Posts System (Backend)**
- [ ] Create posts table schema and migrations
- [ ] Implement post CRUD endpoints
- [ ] Character limit validation (500 chars)
- [ ] User authorization (users can only edit their posts)
- [ ] **Tests Required:** Post CRUD tests, validation tests, authorization tests
- [ ] **Acceptance Criteria:** Post API endpoints work with proper permissions

**Phase 2.5: Interactions System (Backend)**
- [ ] Create likes and comments table schemas
- [ ] Implement like/unlike endpoints with proper constraints
- [ ] Implement comment CRUD endpoints
- [ ] Real-time updates using Supabase subscriptions
- [ ] **Tests Required:** Interaction endpoint tests, real-time update tests, constraint tests
- [ ] **Acceptance Criteria:** Like/comment systems work with real-time updates

**Phase 2.6: File Storage System (Backend)**
- [ ] Configure Supabase storage buckets and policies
- [ ] Implement file upload endpoints (images/videos)
- [ ] File validation (type, size limits)
- [ ] Generate thumbnails for videos
- [ ] **Tests Required:** File upload tests, validation tests, storage policy tests
- [ ] **Acceptance Criteria:** Files upload successfully with proper validation

### Phase 3: Frontend Development

**Phase 3.1: Frontend Foundation & Architecture**
- [ ] Initialize React + TypeScript + Vite project
- [ ] Setup test framework (Jest + React Testing Library)
- [ ] Configure Tailwind CSS and component library
- [ ] Setup routing structure with React Router
- [ ] Configure state management (React Context + React Query)
- [ ] **Tests Required:** Build process tests, routing tests, state management tests
- [ ] **Acceptance Criteria:** Frontend builds successfully, routing works, state management functional

**Phase 3.2: API Client & WebSocket Setup**
- [ ] Configure Supabase client for frontend
- [ ] Setup API client with proper error handling
- [ ] Configure real-time subscriptions
- [ ] Implement retry logic and offline handling
- [ ] **Tests Required:** API client tests, WebSocket connection tests, error handling tests
- [ ] **Acceptance Criteria:** Frontend connects to backend APIs, real-time updates work

**Phase 3.3: Authentication UI Implementation**
- [ ] Create login form component
- [ ] Create registration form component  
- [ ] Create password reset form component
- [ ] Implement form validation and error display
- [ ] Add loading states and user feedback
- [ ] **Tests Required:** Form component tests, validation tests, user interaction tests
- [ ] **Acceptance Criteria:** Authentication forms work correctly with proper UX

**Phase 3.4: Core Navigation & Layout**
- [ ] Create app shell and main layout components
- [ ] Implement header with navigation
- [ ] Create responsive sidebar/mobile menu
- [ ] Add route protection for authenticated pages
- [ ] **Tests Required:** Layout component tests, responsive design tests, route protection tests
- [ ] **Acceptance Criteria:** Navigation works across devices, protected routes function

**Phase 3.5: Profile Management UI**
- [ ] Create profile view component
- [ ] Create profile editing form
- [ ] Implement profile picture upload with preview
- [ ] Add form validation and error handling
- [ ] **Tests Required:** Profile component tests, form validation tests, image upload tests
- [ ] **Acceptance Criteria:** Users can view and edit profiles with image uploads

**Phase 3.6: Content Creation & Display**
- [ ] Create post creation form
- [ ] Create post display components (PostCard)
- [ ] Implement character counting and validation
- [ ] Add post timestamp and author display
- [ ] **Tests Required:** Post creation tests, display component tests, validation tests
- [ ] **Acceptance Criteria:** Users can create and view posts with proper formatting

**Phase 3.7: Feed System Implementation**
- [ ] Create main feed component with infinite scroll
- [ ] Implement pagination with React Query
- [ ] Add loading states and skeletons
- [ ] Create empty states for no content
- [ ] **Tests Required:** Feed component tests, pagination tests, loading state tests
- [ ] **Acceptance Criteria:** Feed loads posts efficiently with good UX

**Phase 3.8: Interaction Features**
- [ ] Implement like button with optimistic updates
- [ ] Create comment section components
- [ ] Add real-time updates for likes/comments
- [ ] Implement proper loading and error states
- [ ] **Tests Required:** Interaction component tests, real-time update tests, optimistic update tests
- [ ] **Acceptance Criteria:** Users can like/comment with real-time feedback

**Phase 3.9: Video Features**
- [ ] Create video upload component with progress
- [ ] Implement basic video player component
- [ ] Add video thumbnail display
- [ ] Handle video loading and error states
- [ ] **Tests Required:** Video upload tests, player component tests, error handling tests
- [ ] **Acceptance Criteria:** Users can upload and play videos successfully

**Phase 3.10: Polish & Enhancement**
- [ ] Add loading spinners and error boundaries
- [ ] Implement toast notifications system
- [ ] Add keyboard navigation support
- [ ] Optimize performance and bundle size
- [ ] **Tests Required:** Error boundary tests, accessibility tests, performance tests
- [ ] **Acceptance Criteria:** App handles errors gracefully, accessible, performs well

### Testing Strategy for Each Phase

**Unit Tests Must Cover:**
- All component rendering
- All form validations
- All utility functions
- All state management logic

**Integration Tests Must Cover:**
- Database operations
- API calls to Supabase
- Authentication flows
- File upload operations
- Real data flow from UI to database

**Acceptance Testing:**
- Each phase must be manually tested
- All acceptance criteria must pass
- No known bugs before proceeding to next phase

**Test Organization:**
```
tests/
├── unit/
│   ├── components/
│   ├── utils/
│   └── hooks/
├── integration/
│   ├── auth/
│   ├── database/
│   └── storage/
└── e2e/
    └── user-flows/
```

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