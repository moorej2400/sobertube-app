# TASK: SoberTube Authentication Fixes and Posts System Implementation

## Project Context
- **Repository**: /home/jared/dev/personal/sobertube-app
- **Environment**: WSL Ubuntu, Node.js/TypeScript backend with Supabase
- **Current Status**: Phase 2.2 (Authentication System Backend) has failing tests
- **Next Phase**: Phase 2.4 (Posts System Backend)

## Current Issues to Fix
1. **Duplicate Username Validation**: Test failing - users can register with duplicate usernames
2. **Rate Limiting**: Test failing - no rate limiting implementation 
3. **Session Management**: Refresh token functionality needs completion

## Implementation Phases

### Phase 0: Fix Authentication Issues
**Priority**: HIGH - Must fix before proceeding

#### 0.0 Duplicate Username Validation Fix
- [ ] **0.0.0**: Analyze current username validation logic in auth controller
- [ ] **0.0.1**: Add unique constraint check for usernames in registration endpoint
- [ ] **0.0.2**: Update validation logic to check username uniqueness in database
- [ ] **0.0.3**: Ensure proper error response for duplicate username attempts
- [ ] **0.0.4**: Run auth-registration.test.ts to verify duplicate username test passes

#### 0.1 Rate Limiting Implementation  
- [ ] **0.1.0**: Install and configure express-rate-limit middleware
- [ ] **0.1.1**: Add rate limiting to registration endpoint (5 attempts per 15 minutes)
- [ ] **0.1.2**: Add rate limiting to login endpoint (10 attempts per 15 minutes) 
- [ ] **0.1.3**: Update tests to properly simulate rate limiting behavior
- [ ] **0.1.4**: Run auth-registration.test.ts to verify rate limiting test passes

#### 0.2 Session Management Completion
- [ ] **0.2.0**: Review current refresh token implementation in auth controller
- [ ] **0.2.1**: Complete refresh token rotation logic 
- [ ] **0.2.2**: Add refresh token storage and cleanup in database
- [ ] **0.2.3**: Update auth middleware to handle token refresh scenarios
- [ ] **0.2.4**: Run auth-refresh-session.test.ts to verify all session tests pass

### Phase 1: Posts System Implementation (Backend)
**Priority**: MEDIUM - Next major feature

#### 1.0 Database Schema Setup
- [ ] **1.0.0**: Create posts table migration with proper schema
- [ ] **1.0.1**: Add indexes for performance (user_id, created_at, post_type)
- [ ] **1.0.2**: Set up Row Level Security policies for posts table
- [ ] **1.0.3**: Create database connection tests for posts table
- [ ] **1.0.4**: Run schema tests to verify posts table structure

#### 1.1 Posts Model Implementation
- [ ] **1.1.0**: Create Post TypeScript interface and validation schemas
- [ ] **1.1.1**: Implement posts service with CRUD operations
- [ ] **1.1.2**: Add post content validation (500 char limit, post type validation)
- [ ] **1.1.3**: Implement user authorization checks (users can only edit their posts)
- [ ] **1.1.4**: Write unit tests for posts service methods

#### 1.2 Posts Controller Implementation  
- [ ] **1.2.0**: Create posts controller with create post endpoint
- [ ] **1.2.1**: Implement get posts endpoint with pagination
- [ ] **1.2.2**: Add update post endpoint with proper authorization
- [ ] **1.2.3**: Implement delete post endpoint with ownership validation
- [ ] **1.2.4**: Add get single post by ID endpoint

#### 1.3 Posts Routes Setup
- [ ] **1.3.0**: Create posts routes file with proper middleware
- [ ] **1.3.1**: Add authentication middleware to protected endpoints
- [ ] **1.3.2**: Configure rate limiting for post creation (10 posts per hour)
- [ ] **1.3.3**: Add input validation middleware for post data
- [ ] **1.3.4**: Register posts routes in main app router

#### 1.4 Posts API Testing
- [ ] **1.4.0**: Write integration tests for post creation endpoint
- [ ] **1.4.1**: Create tests for post retrieval with pagination
- [ ] **1.4.2**: Add tests for post update with authorization checks
- [ ] **1.4.3**: Implement tests for post deletion with ownership validation
- [ ] **1.4.4**: Add tests for post validation and error handling

## Technical Requirements

### Authentication Fixes Requirements
- Username uniqueness must be enforced at database and application level
- Rate limiting must use Redis or in-memory store with proper cleanup
- Refresh tokens must be securely stored and rotated
- All authentication endpoints must have comprehensive error handling

### Posts System Requirements  
- Posts table must support text content, post types, and metadata
- All post endpoints must have proper authorization
- Post content must be validated and sanitized
- Pagination must be efficient with cursor-based approach
- Real-time updates should be prepared for (but not implemented yet)

### Testing Requirements
- All endpoints must have integration tests with real database calls
- Authentication must be tested with valid JWT tokens
- Error scenarios must be comprehensively tested
- Database constraints must be tested (uniqueness, foreign keys)
- Rate limiting must be properly tested with actual delay mechanisms

## Success Criteria

### Phase 0 Complete When:
- [ ] All authentication tests pass (auth-registration.test.ts, auth-refresh-session.test.ts)
- [ ] Username duplicates are properly rejected with 409 status
- [ ] Rate limiting works with 429 status codes after threshold
- [ ] Refresh token rotation works correctly
- [ ] No failing tests in authentication system

### Phase 1 Complete When:
- [ ] Posts table exists with proper schema and constraints
- [ ] All CRUD operations work for posts with proper authorization
- [ ] Post validation enforces character limits and required fields
- [ ] Pagination works efficiently for large post datasets
- [ ] All posts integration tests pass
- [ ] Posts API properly handles all error scenarios

## File Structure Expected

```
backend/
├── src/
│   ├── controllers/
│   │   ├── auth.ts (fix duplicate username, rate limiting)
│   │   └── posts.ts (new - posts CRUD)
│   ├── models/
│   │   └── post.ts (new - post model and types)
│   ├── routes/
│   │   └── posts.ts (new - posts routes)
│   ├── services/
│   │   └── posts.ts (new - posts business logic)
│   └── middleware/
│       └── rateLimiting.ts (new - rate limiting config)
├── tests/
│   ├── auth-registration.test.ts (fix failing tests)
│   ├── posts-crud.test.ts (new)
│   ├── posts-authorization.test.ts (new)
│   └── posts-validation.test.ts (new)
└── supabase/
    └── migrations/
        └── 003_create_posts_table.sql (new)
```

## Environment Notes
- Running in WSL Ubuntu environment  
- Must use desktop commander MCP for docker and curl operations
- Follow TDD methodology strictly
- Each sub-feature must be fully tested before proceeding
- Use Supabase for database operations and authentication