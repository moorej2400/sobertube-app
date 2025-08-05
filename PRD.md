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

## Phase 4: Cloud-Agnostic Architecture Migration (MIGRATION PHASE - PRIORITY)

### Current Implementation Status
- **95% Complete Timeline/Feed System**: Custom WebSocket implementation with social interactions fully working
- **Existing Custom Implementations**: Custom Node.js WebSocket server, direct PostgreSQL queries, custom JWT middleware
- **Basic Supabase Usage**: Authentication and basic storage, but NOT using Supabase's advanced features
- **Migration Required**: Transform existing working system to cloud-agnostic architecture using self-hosted Supabase ecosystem

### Phase 4 Objective
**CRITICAL**: This phase focuses on MIGRATING the existing 95% complete, working application to a cloud-agnostic architecture using self-hosted Supabase services. This is a refactoring/migration phase, NOT new feature development.

**Key Migration Principle**: Preserve all existing functionality while transforming the underlying architecture to be cloud-agnostic and leverage Supabase's full ecosystem capabilities.

### Phase 4.1: Local Development Environment Setup (MIGRATION FOUNDATION)

**Phase 4.1.1: Repository Preparation and Docker Environment**
- [ ] Create migration branch: `feature/cloud-agnostic-architecture`
- [ ] Add Docker configuration files (docker-compose.local.yml, environment files)
- [ ] Create necessary directories for nginx, database, monitoring, supabase functions
- [ ] Generate secure secrets for JWT, Realtime encryption, and database
- [ ] **Tests Required**: Repository setup tests, Docker configuration validation tests
- [ ] **Expected Outcome**: Complete local development environment ready for migration

**Phase 4.1.2: Core Supabase Services Deployment**
- [ ] Start all self-hosted Supabase services using Docker Compose (PostgreSQL, Realtime, Auth, Storage, PostgREST)
- [ ] Verify service health and inter-service communication
- [ ] Test PostgreSQL connection, PostgREST API, GoTrue Auth, Realtime WebSocket, Storage API
- [ ] **Tests Required**: Service startup tests, health check tests, API connectivity tests
- [ ] **Expected Outcome**: All Supabase services running locally and communicating properly

**Phase 4.1.3: Frontend Supabase Client Configuration**
- [ ] Install @supabase/supabase-js client library
- [ ] Create Supabase client configuration with local endpoints
- [ ] Configure environment variables for local Supabase services
- [ ] **Tests Required**: Client connection tests, environment configuration tests
- [ ] **Expected Outcome**: Frontend configured to use local self-hosted Supabase services

### Phase 4.2: Database Schema Migration (DATA PRESERVATION)

**Phase 4.2.1: Current Schema Analysis and Migration Planning**
- [ ] Export current database schema and analyze table structures
- [ ] Document existing data relationships and constraints
- [ ] Design Supabase-optimized schema with RLS policies
- [ ] Create migration scripts for schema transformation
- [ ] **Tests Required**: Schema analysis tests, migration script validation tests
- [ ] **Expected Outcome**: Complete understanding of existing data and migration plan

**Phase 4.2.2: Database Migration Execution**
- [ ] Create Supabase-compatible schema with RLS policies for users, posts, videos, comments, likes, follows
- [ ] Implement database functions for complex operations (create_comment, update_post_stats, etc.)
- [ ] Create triggers for automatic timestamp updates and stat calculations
- [ ] **Tests Required**: Schema creation tests, RLS policy tests, database function tests
- [ ] **Expected Outcome**: New database schema ready with all RLS policies and functions

**Phase 4.2.3: Data Migration and Validation**
- [ ] Export existing data from current database
- [ ] Transform data to match new schema requirements (UUID conversion, relationship mapping)
- [ ] Import data into new Supabase-compatible database
- [ ] Verify data integrity and record counts after migration
- [ ] **Tests Required**: Data export tests, transformation tests, import validation tests
- [ ] **Expected Outcome**: All existing data successfully migrated to new schema without loss

### Phase 4.3: Authentication Migration (PRESERVE USER SESSIONS)

**Phase 4.3.1: GoTrue Configuration and Setup**
- [ ] Configure self-hosted GoTrue with proper settings (site URL, email confirmation, etc.)
- [ ] Set up SMTP configuration for email verification and password resets
- [ ] Configure GoTrue with existing user database structure
- [ ] **Tests Required**: GoTrue configuration tests, SMTP delivery tests
- [ ] **Expected Outcome**: GoTrue authentication service ready for user migration

**Phase 4.3.2: User Account Migration**
- [ ] Create user migration script to transfer existing accounts to GoTrue
- [ ] Generate temporary passwords for existing users and send reset instructions
- [ ] Migrate user metadata and profile information
- [ ] **Tests Required**: User migration tests, password reset tests, metadata migration tests
- [ ] **Expected Outcome**: All existing users migrated to GoTrue with profile data intact

**Phase 4.3.3: Frontend Authentication Updates**
- [ ] Replace custom JWT authentication with Supabase Auth (useAuth hook)
- [ ] Update login/register components to use Supabase Auth methods
- [ ] Implement session management using Supabase Auth state
- [ ] **Tests Required**: Authentication flow tests, session management tests
- [ ] **Expected Outcome**: Frontend using Supabase Auth, existing user sessions preserved

### Phase 4.4: Real-Time Migration (REPLACE CUSTOM WEBSOCKET)

**Phase 4.4.1: Custom WebSocket Analysis and Replacement Strategy**
- [ ] Document existing WebSocket events and handlers (likes, comments, follows, presence)
- [ ] Create feature flag to toggle between custom WebSocket and Supabase Realtime
- [ ] Backup existing WebSocket implementation for rollback capability
- [ ] **Tests Required**: WebSocket analysis tests, feature flag tests
- [ ] **Expected Outcome**: Clear understanding of migration scope and rollback plan

**Phase 4.4.2: Supabase Realtime Implementation**
- [ ] Implement Supabase Realtime hooks (useRealtimePosts, usePresence)
- [ ] Replace custom WebSocket events with PostgreSQL change subscriptions
- [ ] Implement presence tracking using Supabase Realtime presence feature
- [ ] Create broadcast channels for custom real-time events not tied to database tables
- [ ] **Tests Required**: Real-time subscription tests, presence tests, broadcast tests
- [ ] **Expected Outcome**: Real-time features working through Supabase Realtime

**Phase 4.4.3: WebSocket Migration Validation and Cleanup**
- [ ] Test all real-time features (likes, comments, follows, presence) using Supabase Realtime
- [ ] Validate performance and reliability compared to custom implementation
- [ ] Remove custom WebSocket server after successful migration
- [ ] **Tests Required**: End-to-end real-time tests, performance comparison tests
- [ ] **Expected Outcome**: Custom WebSocket completely replaced with Supabase Realtime

### Phase 4.5: Storage Migration (FILE SYSTEM TO SUPABASE STORAGE)

**Phase 4.5.1: Storage Infrastructure Setup**
- [ ] Configure self-hosted Supabase Storage with MinIO backend
- [ ] Create storage buckets with appropriate policies (avatars, posts, videos)
- [ ] Set up image transformation pipeline for avatar and post images
- [ ] **Tests Required**: Storage service tests, bucket policy tests, transformation tests
- [ ] **Expected Outcome**: Supabase Storage ready with proper access controls

**Phase 4.5.2: File Migration Process**
- [ ] Create file migration script to transfer existing files to Supabase Storage
- [ ] Update database references to point to new Supabase Storage URLs
- [ ] Implement file upload helpers and URL generation functions
- [ ] **Tests Required**: File migration tests, URL reference tests, upload helper tests
- [ ] **Expected Outcome**: All files migrated to Supabase Storage with working references

**Phase 4.5.3: Frontend Storage Integration**
- [ ] Update file upload components to use Supabase Storage API
- [ ] Replace existing file serving with Supabase Storage public URLs
- [ ] Implement file management features (delete, update) through Storage API
- [ ] **Tests Required**: File upload tests, URL generation tests, file management tests
- [ ] **Expected Outcome**: Frontend using Supabase Storage for all file operations

### Phase 4.6: Testing and Validation (ENSURE NO FUNCTIONALITY LOSS)

**Phase 4.6.1: Migration Testing Framework**
- [ ] Create comprehensive integration tests for migrated authentication flow
- [ ] Implement real-time feature tests using Supabase Realtime
- [ ] Add storage functionality tests for file upload/download operations
- [ ] **Tests Required**: Authentication integration tests, real-time tests, storage tests
- [ ] **Expected Outcome**: All migrated features tested and verified working

**Phase 4.6.2: Performance and Load Testing**
- [ ] Run load tests on Supabase Realtime vs. custom WebSocket performance
- [ ] Test concurrent user scenarios with new architecture
- [ ] Validate memory usage and resource consumption after migration
- [ ] **Tests Required**: Load tests, concurrent user tests, resource usage tests
- [ ] **Expected Outcome**: Performance equal or better than custom implementation

**Phase 4.6.3: End-to-End Migration Validation**
- [ ] Test complete user journeys (signup, login, post creation, real-time interactions)
- [ ] Validate data integrity and consistency after all migrations
- [ ] Perform rollback testing to ensure migration is reversible
- [ ] **Tests Required**: End-to-end user journey tests, data integrity tests, rollback tests
- [ ] **Expected Outcome**: Complete confidence in migrated system functionality

### Phase 4.7: Production Deployment Preparation (CLOUD-AGNOSTIC SETUP)

**Phase 4.7.1: Kubernetes Deployment Manifests**
- [ ] Create Kubernetes manifests for all Supabase services (PostgreSQL, Realtime, Auth, Storage)
- [ ] Configure service discovery and networking between components
- [ ] Set up ingress controllers and load balancers for external access
- [ ] **Tests Required**: Kubernetes deployment tests, service networking tests
- [ ] **Expected Outcome**: Production-ready Kubernetes deployment configuration

**Phase 4.7.2: Multi-Cloud Deployment Templates**
- [ ] Create AWS deployment templates (EKS, RDS, S3, CloudFront)
- [ ] Create GCP deployment templates (GKE, Cloud SQL, Cloud Storage, Cloud CDN)
- [ ] Create Azure deployment templates (AKS, Azure Database, Blob Storage, Azure CDN)
- [ ] **Tests Required**: Multi-cloud deployment tests, template validation tests
- [ ] **Expected Outcome**: Ability to deploy to any major cloud provider

**Phase 4.7.3: Production Migration and Cutover**
- [ ] Plan production database migration with minimal downtime
- [ ] Implement gradual traffic cutover using weighted routing
- [ ] Set up monitoring and alerting for new production environment
- [ ] **Tests Required**: Production migration tests, traffic routing tests, monitoring tests
- [ ] **Expected Outcome**: Successful production deployment with zero data loss

### Phase 4.8: Post-Migration Optimization and Monitoring

**Phase 4.8.1: Performance Monitoring and Optimization**
- [ ] Deploy comprehensive monitoring stack (Prometheus, Grafana, AlertManager)
- [ ] Configure application performance monitoring for all services
- [ ] Implement log aggregation and centralized logging
- [ ] **Tests Required**: Monitoring setup tests, alerting tests, log collection tests
- [ ] **Expected Outcome**: Complete observability of migrated system

**Phase 4.8.2: Security and Compliance Hardening**
- [ ] Implement end-to-end TLS/SSL for all communications
- [ ] Configure database-level security with RLS policies
- [ ] Add API rate limiting and DDoS protection
- [ ] **Tests Required**: Security tests, RLS policy tests, rate limiting tests
- [ ] **Expected Outcome**: Production-grade security implementation

**Phase 4.8.3: Documentation and Team Training**
- [ ] Create operational runbooks for new architecture
- [ ] Document troubleshooting procedures for common issues
- [ ] Train development team on new Supabase-based workflow
- [ ] **Tests Required**: Documentation validation tests, team training assessment
- [ ] **Expected Outcome**: Team ready to maintain and enhance migrated system

### Migration Success Criteria
- **Zero Data Loss**: All existing user data, posts, videos, and relationships preserved
- **Functionality Preservation**: All features work identically to pre-migration system
- **Performance Maintenance**: System performance equal or better after migration  
- **Cloud Agnosticism Achieved**: Can deploy to any cloud provider or on-premises
- **Development Experience Improved**: Faster development with Supabase ecosystem benefits

### Rollback Plan
- **Database Rollback**: Restore from backup if migration issues occur
- **Application Rollback**: Deploy previous version using feature flags
- **DNS Rollback**: Route traffic back to old infrastructure if needed
- **Communication Plan**: Notify stakeholders of any rollback procedures

### Phase 4.2: Authentication & Authorization Enhancement (POST-MIGRATION)

**Phase 4.2.1: Advanced RLS Policy Implementation (POST-MIGRATION)**
- [ ] Enhance RLS policies for complex privacy scenarios (community-only posts, follower-only content)
- [ ] Implement dynamic policies based on user relationships and follow status
- [ ] Add role-based access control for admin and moderator functions
- [ ] Create audit logging policies for all data modifications
- [ ] **Tests Required**: Advanced RLS policy tests, role-based access tests, audit logging tests
- [ ] **Expected Benefits**: Enhanced security, granular access control, compliance readiness

**Phase 4.2.2: Social Login and MFA Enhancement (POST-MIGRATION)**
- [ ] Add social login providers (Google, Apple, Facebook) through self-hosted GoTrue
- [ ] Implement multi-factor authentication with TOTP and SMS options
- [ ] Configure custom email templates for branding consistency
- [ ] Add account linking and unlinking capabilities
- [ ] **Tests Required**: Social login tests, MFA tests, email template tests, account linking tests
- [ ] **Expected Benefits**: Improved user experience, enhanced security, brand consistency

**Phase 4.2.3: User Management and Analytics (POST-MIGRATION)**
- [ ] Implement advanced user analytics and behavior tracking
- [ ] Add user engagement metrics and retention analysis
- [ ] Create user management dashboard for admins
- [ ] Implement user feedback and satisfaction measurement
- [ ] **Tests Required**: Analytics tests, dashboard tests, feedback system tests
- [ ] **Expected Benefits**: Data-driven user experience improvements, better community management

### Phase 4.3: Storage Enhancement and Optimization (POST-MIGRATION)

**Phase 4.3.1: Advanced Storage Features Implementation**
- [ ] Implement advanced image transformation pipeline (WebP conversion, progressive JPEGs, responsive images)
- [ ] Add video transcoding and compression for optimal streaming
- [ ] Configure content-aware image optimization and lazy loading
- [ ] Implement automated backup and versioning for user content
- [ ] **Tests Required**: Image transformation tests, video transcoding tests, backup tests
- [ ] **Expected Benefits**: Improved performance, reduced bandwidth usage, data protection

**Phase 4.3.2: CDN and Global Distribution Setup**
- [ ] Configure global CDN for worldwide content delivery
- [ ] Implement edge caching strategies for static and dynamic content
- [ ] Add geographic content distribution for reduced latency
- [ ] Configure cache invalidation and purging mechanisms
- [ ] **Tests Required**: CDN performance tests, cache invalidation tests, global distribution tests
- [ ] **Expected Benefits**: Global performance optimization, reduced server load, better user experience

**Phase 4.3.3: Storage Analytics and Cost Optimization**
- [ ] Implement storage usage analytics and reporting
- [ ] Add cost optimization strategies (storage tiering, compression)
- [ ] Configure storage quotas and usage alerts
- [ ] Implement content lifecycle management and archival
- [ ] **Tests Required**: Analytics tests, cost optimization tests, quota management tests
- [ ] **Expected Benefits**: Cost control, usage insights, efficient resource utilization

### Phase 4.4: Advanced Edge Functions and Serverless Logic (POST-MIGRATION)

**Phase 4.4.1: Business Logic Migration to Edge Functions**
- [ ] Migrate complex business logic to Deno edge functions (post processing, notifications, analytics)
- [ ] Implement serverless image and video processing functions
- [ ] Create recommendation engine functions for personalized content
- [ ] Add real-time content moderation and safety functions
- [ ] **Tests Required**: Business logic tests, processing function tests, recommendation tests, moderation tests
- [ ] **Expected Benefits**: Scalable processing, improved performance, cost optimization

**Phase 4.4.2: Advanced Function Capabilities**
- [ ] Implement scheduled functions for maintenance tasks (cleanup, aggregation, reports)
- [ ] Add webhook processing functions for external integrations
- [ ] Create analytics and reporting functions for user insights
- [ ] Implement AI/ML functions for content analysis and recommendations
- [ ] **Tests Required**: Scheduled function tests, webhook tests, analytics tests, AI/ML tests
- [ ] **Expected Benefits**: Automated operations, external integrations, intelligent features

**Phase 4.4.3: Function Performance and Monitoring**
- [ ] Implement comprehensive function monitoring and alerting
- [ ] Add function performance optimization and caching
- [ ] Configure function auto-scaling and resource management
- [ ] Create function debugging and troubleshooting tools
- [ ] **Tests Required**: Monitoring tests, performance tests, auto-scaling tests, debugging tests
- [ ] **Expected Benefits**: Optimal performance, cost efficiency, operational visibility

### Phase 4.5: Advanced Database Features and Optimization (POST-MIGRATION)

**Phase 4.5.1: Database Performance and Scaling**
- [ ] Implement database performance monitoring and optimization
- [ ] Configure read replicas for improved query performance
- [ ] Add database connection pooling and optimization
- [ ] Implement database sharding strategies for future scaling
- [ ] **Tests Required**: Performance tests, replica tests, connection pooling tests, sharding tests
- [ ] **Expected Benefits**: Improved performance, horizontal scaling capability, optimized resource usage

**Phase 4.5.2: Advanced Database Analytics and Insights**
- [ ] Implement comprehensive database analytics for user behavior insights
- [ ] Add real-time dashboard for system metrics and KPIs
- [ ] Configure advanced query optimization and indexing strategies
- [ ] Create automated database maintenance and optimization procedures
- [ ] **Tests Required**: Analytics tests, dashboard tests, query optimization tests, maintenance tests
- [ ] **Expected Benefits**: Data-driven decisions, system optimization, automated maintenance

**Phase 4.5.3: Database Security and Compliance Enhancement**
- [ ] Implement advanced database security measures (encryption, access logging)
- [ ] Add compliance features for GDPR, CCPA, and other privacy regulations
- [ ] Configure data retention and deletion policies
- [ ] Implement data anonymization and pseudonymization features
- [ ] **Tests Required**: Security tests, compliance tests, data retention tests, anonymization tests
- [ ] **Expected Benefits**: Enhanced security, regulatory compliance, user privacy protection

### Phase 4.6: Advanced Deployment and DevOps (POST-MIGRATION)

**Phase 4.6.1: CI/CD Pipeline Enhancement**
- [ ] Implement advanced CI/CD pipelines with automated testing and deployment
- [ ] Add blue-green deployment strategies for zero-downtime updates
- [ ] Configure automated rollback mechanisms for failed deployments
- [ ] Implement infrastructure testing and validation in CI/CD
- [ ] **Tests Required**: CI/CD pipeline tests, blue-green deployment tests, rollback tests, infrastructure validation tests
- [ ] **Expected Benefits**: Reliable deployments, zero downtime, automated quality assurance

**Phase 4.6.2: Advanced Monitoring and Observability**
- [ ] Implement distributed tracing across all services for performance analysis
- [ ] Add advanced application performance monitoring (APM) with alerting
- [ ] Configure log aggregation with intelligent parsing and searching
- [ ] Create custom dashboards for business metrics and KPIs
- [ ] **Tests Required**: Tracing tests, APM tests, log aggregation tests, dashboard tests
- [ ] **Expected Benefits**: Complete system visibility, proactive issue detection, data-driven optimization

**Phase 4.6.3: Disaster Recovery and Business Continuity**
- [ ] Implement comprehensive backup and disaster recovery procedures
- [ ] Configure multi-region failover capabilities
- [ ] Add automated disaster recovery testing and validation
- [ ] Create business continuity plans and runbooks
- [ ] **Tests Required**: Backup/restore tests, failover tests, disaster recovery tests, runbook validation
- [ ] **Expected Benefits**: Business resilience, minimal downtime, regulatory compliance

### Phase 4.7: Advanced Feature Development (POST-MIGRATION)

**Phase 4.7.1: AI-Powered Features Implementation**
- [ ] Implement AI-powered content recommendation engine using edge functions
- [ ] Add automated content moderation using machine learning models
- [ ] Create intelligent user matching for peer support connections
- [ ] Implement sentiment analysis for community health monitoring
- [ ] **Tests Required**: AI recommendation tests, content moderation tests, user matching tests, sentiment analysis tests
- [ ] **Expected Benefits**: Personalized user experience, safer community, better connections, community insights

**Phase 4.7.2: Advanced Social Features**
- [ ] Implement group support meetings with video chat integration
- [ ] Add recovery milestone tracking and celebration features
- [ ] Create mentor-mentee matching and communication tools
- [ ] Implement community challenges and goal-setting features
- [ ] **Tests Required**: Video chat tests, milestone tracking tests, mentoring feature tests, community challenge tests
- [ ] **Expected Benefits**: Enhanced community support, goal achievement, structured mentoring, engaging experiences

**Phase 4.7.3: Analytics and Business Intelligence**
- [ ] Implement comprehensive user analytics and behavior tracking
- [ ] Add community health metrics and reporting dashboards
- [ ] Create engagement analytics and retention analysis tools
- [ ] Implement A/B testing framework for feature experimentation
- [ ] **Tests Required**: Analytics tests, dashboard tests, retention analysis tests, A/B testing framework tests
- [ ] **Expected Benefits**: Data-driven decisions, community insights, feature optimization, user retention improvement

### Phase 4.8: Enterprise and Scaling Features (POST-MIGRATION)

**Phase 4.8.1: Enterprise Integration and APIs**
- [ ] Develop comprehensive REST and GraphQL APIs for external integrations
- [ ] Implement partner integration capabilities for treatment centers and organizations
- [ ] Add enterprise authentication and single sign-on (SSO) capabilities
- [ ] Create white-label solutions for organizations and healthcare providers
- [ ] **Tests Required**: API tests, partner integration tests, SSO tests, white-label tests
- [ ] **Expected Benefits**: Business partnerships, revenue opportunities, healthcare integration, scalable solutions

**Phase 4.8.2: Advanced Security and Compliance**
- [ ] Implement HIPAA compliance features for healthcare integrations
- [ ] Add advanced fraud detection and prevention systems
- [ ] Create comprehensive audit logging and compliance reporting
- [ ] Implement data governance and privacy management tools
- [ ] **Tests Required**: HIPAA compliance tests, fraud detection tests, audit logging tests, privacy management tests
- [ ] **Expected Benefits**: Healthcare market access, security assurance, regulatory compliance, user trust

### Phase 4.9: Performance Optimization and Scaling (POST-MIGRATION)

**Phase 4.9.1: Performance Engineering and Optimization**
- [ ] Implement comprehensive performance monitoring and optimization
- [ ] Add intelligent caching strategies at multiple levels (CDN, application, database)
- [ ] Configure auto-scaling policies based on usage patterns and performance metrics
- [ ] Implement performance budgets and alerting for regression detection
- [ ] **Tests Required**: Performance optimization tests, caching tests, auto-scaling tests, performance budget tests
- [ ] **Expected Benefits**: Optimal system performance, cost efficiency, scalable architecture, performance assurance

**Phase 4.9.2: Global Distribution and Edge Computing**
- [ ] Implement global content distribution network for worldwide performance
- [ ] Add edge computing capabilities for low-latency user interactions
- [ ] Configure geo-distributed database replicas for regional performance
- [ ] Implement intelligent traffic routing based on user location and server health
- [ ] **Tests Required**: Global distribution tests, edge computing tests, database replica tests, traffic routing tests
- [ ] **Expected Benefits**: Global performance optimization, reduced latency, improved user experience worldwide

### Phase 4.10: Innovation and Future Technology Integration (POST-MIGRATION)

**Phase 4.10.1: Emerging Technology Integration**
- [ ] Implement blockchain features for achievement verification and community tokens
- [ ] Add virtual reality (VR) and augmented reality (AR) support for immersive recovery experiences
- [ ] Create voice interface and natural language processing for accessibility
- [ ] Implement Internet of Things (IoT) integration for health and wellness tracking
- [ ] **Tests Required**: Blockchain tests, VR/AR tests, voice interface tests, IoT integration tests
- [ ] **Expected Benefits**: Cutting-edge features, competitive advantage, enhanced user engagement, accessibility improvements

**Phase 4.10.2: Research and Development Framework**
- [ ] Establish research and development processes for continuous innovation
- [ ] Create experimentation framework for testing new features and technologies
- [ ] Implement user feedback loops and feature request management
- [ ] Add metrics and analytics for measuring innovation impact
- [ ] **Tests Required**: R&D process tests, experimentation framework tests, feedback system tests, impact measurement tests
- [ ] **Expected Benefits**: Continuous innovation, user-driven development, competitive advantage, long-term growth

## Docker Compose Development Environment Configuration

### Core Services Configuration
```yaml
version: '3.8'
services:
  # PostgreSQL Database with Supabase Extensions
  postgres:
    image: supabase/postgres:15.1.0.94
    environment:
      POSTGRES_DB: postgres
      POSTGRES_USER: supabase_admin
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_PORT: 5432
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/init:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U supabase_admin -d postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Supabase Realtime Server
  realtime:
    image: supabase/realtime:2.25.66
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      PORT: 4000
      DB_HOST: postgres
      DB_PORT: 5432
      DB_USER: supabase_admin
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      DB_NAME: postgres
      DB_AFTER_CONNECT_QUERY: "SET search_path TO realtime"
      DB_ENC_KEY: ${REALTIME_ENCRYPTION_KEY}
      SECRET_KEY_BASE: ${REALTIME_SECRET_KEY_BASE}
      JWT_SECRET: ${JWT_SECRET}
      REPLICATION_MODE: RLS
      REPLICATION_POLL_INTERVAL: 100
      SECURE_CHANNELS: true
      SLOT_NAME: supabase_realtime_rls
      TEMPORARY_SLOT: true
    ports:
      - "4000:4000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  # GoTrue Authentication Service
  auth:
    image: supabase/gotrue:v2.151.0
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: 9999
      API_EXTERNAL_URL: ${API_EXTERNAL_URL}
      GOTRUE_URL: ${GOTRUE_URL}
      GOTRUE_SITE_URL: ${SITE_URL}
      GOTRUE_JWT_SECRET: ${JWT_SECRET}
      GOTRUE_JWT_EXP: 3600
      GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: postgresql://supabase_admin:${POSTGRES_PASSWORD}@postgres:5432/postgres?search_path=auth
      GOTRUE_SMTP_HOST: ${SMTP_HOST}
      GOTRUE_SMTP_PORT: ${SMTP_PORT}
      GOTRUE_SMTP_USER: ${SMTP_USER}
      GOTRUE_SMTP_PASS: ${SMTP_PASS}
      GOTRUE_SMTP_ADMIN_EMAIL: ${SMTP_ADMIN_EMAIL}
      GOTRUE_MAILER_SUBJECTS_INVITE: "You have been invited"
      GOTRUE_MAILER_SUBJECTS_CONFIRMATION: "Confirm Your Email"
      GOTRUE_MAILER_SUBJECTS_RECOVERY: "Reset Your Password"
    ports:
      - "9999:9999"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9999/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  # PostgREST API Server
  rest:
    image: postgrest/postgrest:v12.0.1
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      PGRST_DB_URI: postgresql://supabase_admin:${POSTGRES_PASSWORD}@postgres:5432/postgres
      PGRST_DB_SCHEMAS: public
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: ${JWT_SECRET}
      PGRST_DB_USE_LEGACY_GUCS: "false"
      PGRST_APP_SETTINGS_JWT_SECRET: ${JWT_SECRET}
      PGRST_APP_SETTINGS_JWT_EXP: 3600
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/"]
      interval: 10s
      timeout: 5s
      retries: 5

  # MinIO S3-Compatible Storage
  minio:
    image: minio/minio:RELEASE.2024-01-16T16-07-38Z
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
      MINIO_DEFAULT_BUCKETS: ${MINIO_DEFAULT_BUCKETS}
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Supabase Storage API
  storage:
    image: supabase/storage-api:v0.46.4
    depends_on:
      postgres:
        condition: service_healthy
      minio:
        condition: service_healthy
    environment:
      ANON_KEY: ${ANON_KEY}
      SERVICE_KEY: ${SERVICE_KEY}
      POSTGREST_URL: http://rest:3000
      PGRST_JWT_SECRET: ${JWT_SECRET}
      DATABASE_URL: postgresql://supabase_admin:${POSTGRES_PASSWORD}@postgres:5432/postgres
      FILE_SIZE_LIMIT: 52428800
      STORAGE_BACKEND: s3
      GLOBAL_S3_BUCKET: ${MINIO_DEFAULT_BUCKETS}
      REGION: us-east-1
      GLOBAL_S3_ENDPOINT: http://minio:9000
      GLOBAL_S3_ACCESS_KEY_ID: ${MINIO_ROOT_USER}
      GLOBAL_S3_SECRET_ACCESS_KEY: ${MINIO_ROOT_PASSWORD}
      GLOBAL_S3_FORCE_PATH_STYLE: true
      ENABLE_IMAGE_TRANSFORMATION: true
      IMGPROXY_URL: http://imgproxy:8080
    ports:
      - "5000:5000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/status"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Image Processing Service
  imgproxy:
    image: darthsim/imgproxy:v3.21
    environment:
      IMGPROXY_BIND: 0.0.0.0:8080
      IMGPROXY_LOCAL_FILESYSTEM_ROOT: /
      IMGPROXY_USE_ETAG: true
      IMGPROXY_ENABLE_WEBP_DETECTION: true
    ports:
      - "8080:8080"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Deno Edge Functions Runtime
  edge-functions:
    image: supabase/edge-runtime:v1.45.2
    environment:
      SUPABASE_URL: ${SUPABASE_URL}
      SUPABASE_ANON_KEY: ${ANON_KEY}
      SUPABASE_SERVICE_ROLE_KEY: ${SERVICE_KEY}
      VERIFY_JWT: false
    volumes:
      - ./supabase/functions:/home/deno/functions:ro
    ports:
      - "54321:9000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Local SMTP Server for Development
  inbucket:
    image: inbucket/inbucket:3.0.3
    ports:
      - "2500:2500"  # SMTP
      - "9110:9110"  # Web UI
      - "1100:1100"  # POP3

  # Redis for Caching and Sessions
  redis:
    image: redis:7.2-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Nginx Reverse Proxy and CDN Simulation
  nginx:
    image: nginx:1.25-alpine
    depends_on:
      - rest
      - auth
      - realtime
      - storage
      - edge-functions
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    ports:
      - "80:80"
      - "443:443"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  minio_data:
  redis_data:
```

### Environment Configuration Management
```bash
# .env.local - Local Development Environment
POSTGRES_PASSWORD=your_super_secure_postgres_password
REALTIME_ENCRYPTION_KEY=your_32_character_encryption_key_here
REALTIME_SECRET_KEY_BASE=your_64_character_secret_key_base_here
JWT_SECRET=your_jwt_secret_key_here
API_EXTERNAL_URL=http://localhost:8000
GOTRUE_URL=http://localhost:9999
SITE_URL=http://localhost:3000
SMTP_HOST=inbucket
SMTP_PORT=2500
SMTP_USER=
SMTP_PASS=
SMTP_ADMIN_EMAIL=admin@sobertube.local
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123
MINIO_DEFAULT_BUCKETS=sobertube-storage
ANON_KEY=your_anon_key_here
SERVICE_KEY=your_service_key_here
SUPABASE_URL=http://localhost:8000

# .env.production - Production Environment Template
POSTGRES_PASSWORD=${POSTGRES_PASSWORD_SECRET}
REALTIME_ENCRYPTION_KEY=${REALTIME_ENCRYPTION_KEY_SECRET}
REALTIME_SECRET_KEY_BASE=${REALTIME_SECRET_KEY_BASE_SECRET}
JWT_SECRET=${JWT_SECRET_SECRET}
API_EXTERNAL_URL=https://api.sobertube.com
GOTRUE_URL=https://auth.sobertube.com
SITE_URL=https://sobertube.com
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_USER=${SMTP_USER_SECRET}
SMTP_PASS=${SMTP_PASS_SECRET}
SMTP_ADMIN_EMAIL=admin@sobertube.com
```

## Deployment Architecture

### Multi-Cloud Deployment Support

**AWS Deployment Stack:**
- **Compute**: EKS (Kubernetes) or ECS (Containers)
- **Database**: RDS PostgreSQL with Multi-AZ
- **Storage**: S3 with CloudFront CDN
- **Load Balancer**: Application Load Balancer
- **DNS**: Route 53 with health checks
- **Monitoring**: CloudWatch + custom Prometheus/Grafana

**Google Cloud Deployment Stack:**
- **Compute**: GKE (Kubernetes) or Cloud Run
- **Database**: Cloud SQL PostgreSQL with High Availability
- **Storage**: Cloud Storage with Cloud CDN
- **Load Balancer**: Cloud Load Balancing
- **DNS**: Cloud DNS with health checks
- **Monitoring**: Cloud Monitoring + custom stack

**Azure Deployment Stack:**
- **Compute**: AKS (Kubernetes) or Container Instances
- **Database**: Azure Database for PostgreSQL
- **Storage**: Blob Storage with Azure CDN
- **Load Balancer**: Azure Load Balancer
- **DNS**: Azure DNS with traffic manager
- **Monitoring**: Azure Monitor + custom stack

**On-Premises Deployment Stack:**
- **Compute**: Kubernetes (k8s, k3s, or OpenShift)
- **Database**: PostgreSQL with streaming replication
- **Storage**: MinIO cluster with distributed storage
- **Load Balancer**: HAProxy or nginx
- **DNS**: Internal DNS with health checks
- **Monitoring**: Prometheus/Grafana stack

### Migration Strategy from Current Custom Implementation

**Phase 1: Parallel Implementation (2-3 weeks)**
- Deploy self-hosted Supabase services alongside existing custom implementation
- Configure Docker Compose for local development with both systems
- Create feature flags to toggle between implementations
- Implement data synchronization between systems

**Phase 2: Service-by-Service Migration (4-6 weeks)**
- **Week 1-2:** Migrate authentication from custom JWT to GoTrue
- **Week 3-4:** Replace custom WebSocket with Supabase Realtime
- **Week 5-6:** Migrate file storage to self-hosted Storage API
- Test each migration thoroughly before proceeding

**Phase 3: Database Migration (2-3 weeks)**
- Implement RLS policies to replace custom authorization
- Migrate existing data to new schema optimized for Supabase
- Replace direct SQL queries with PostgREST API calls
- Test all data access patterns and performance

**Phase 4: Production Deployment (2-3 weeks)**
- Deploy to chosen cloud provider using Infrastructure as Code
- Configure monitoring, logging, and alerting
- Perform load testing and performance optimization
- Execute final cutover with rollback plan

**Phase 5: Cleanup and Optimization (1-2 weeks)**
- Remove old custom implementation code
- Optimize performance and resource usage
- Complete documentation and runbooks
- Train team on new architecture

## Expected Benefits Summary

**Cloud Agnosticism:**
- Deploy to AWS, GCP, Azure, or on-premises without code changes
- Avoid vendor lock-in and negotiate better pricing
- Comply with data sovereignty requirements
- Maintain control over infrastructure and costs

**Development Velocity:**
- Identical local and production environments
- Faster debugging with proper logging and monitoring
- Reduced custom infrastructure maintenance
- Better TypeScript integration and type safety

**Operational Excellence:**
- Enterprise-grade security and compliance features
- Automated scaling and high availability
- Comprehensive monitoring and alerting
- Disaster recovery and backup strategies

**Cost Optimization:**
- Choose optimal cloud provider for each region
- Scale resources based on actual usage
- Avoid premium managed service fees
- Optimize costs through multi-cloud strategies

### Timeline Estimate
- **Phase 4.1-4.3 (Core Services Migration)**: 6-8 weeks
- **Phase 4.4-4.6 (Advanced Features & Infrastructure)**: 4-6 weeks
- **Phase 4.7-4.9 (Operations & Security)**: 3-4 weeks
- **Phase 4.10 (Testing & Quality Assurance)**: 2-3 weeks
- **Total**: 15-21 weeks for complete cloud-agnostic migration

### Risk Mitigation
- Implement changes incrementally with comprehensive testing
- Maintain feature flags for easy rollback
- Create comprehensive monitoring and alerting
- Develop disaster recovery and backup procedures
- Perform extensive load and performance testing
- Train team on new architecture and operations

This cloud-agnostic architecture ensures SoberTube can be deployed anywhere while maintaining all the benefits of the Supabase ecosystem through self-hosted services, providing complete control over data, costs, and infrastructure.