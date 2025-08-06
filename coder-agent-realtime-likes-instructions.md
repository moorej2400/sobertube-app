# Coder Agent Instructions: Real-Time Likes System (Sub-feature 1.1.0)

## CRITICAL CONSTRAINTS AND ENVIRONMENT

### Environment Requirements
- **Platform**: WSL (Windows Subsystem for Linux) on Ubuntu
- **Working Directory**: `/home/jared/dev/personal/sobertube-app`
- **MANDATORY**: ALWAYS use desktop commander MCP tools for docker and curl operations
- **MANDATORY**: Follow TDD methodology strictly
- **MANDATORY**: Do what has been asked; nothing more, nothing less
- **MANDATORY**: NEVER create files unless absolutely necessary
- **MANDATORY**: ALWAYS prefer editing existing files over creating new ones
- **MANDATORY**: NEVER proactively create documentation files unless explicitly requested

### Agent Scope Limitation
- **CRITICAL**: Work ONLY on Sub-feature 1.1.0: Real-Time Likes System
- **CRITICAL**: Do NOT work on multiple features or sub-features simultaneously
- **CRITICAL**: Do NOT deviate from the specific requirements below

## TASK SPECIFICATION: Real-Time Likes System (Sub-feature 1.1.0)

### Objective
Integrate WebSocket events with existing likes API to enable:
1. Instant like notifications to post authors
2. Real-time like count updates to all viewers
3. Like activity feed updates
4. Optimistic UI updates for likes
5. Like event batching for performance

### Current System Analysis
- ✅ WebSocket infrastructure is 100% complete (`backend/src/websocket/server.ts`)
- ✅ WebSocket events service exists with placeholder methods (`backend/src/services/websocketEvents.ts`)
- ✅ Likes controller exists (`backend/src/controllers/likes.ts`)
- ✅ Authentication and connection management working
- ❌ **MISSING**: Integration between likes controller and WebSocket events

### Implementation Requirements

#### 1. Integrate WebSocket Events with Likes Controller
**File to Edit**: `backend/src/controllers/likes.ts`

**Required Changes**:
- Import `webSocketEventsService` from `../services/websocketEvents`
- Modify existing like/unlike endpoints to emit WebSocket events
- Ensure proper error handling if WebSocket emission fails
- Maintain existing API response format (no breaking changes)

**Expected Integration Points**:
```typescript
// After successful like/unlike database operation:
await webSocketEventsService.emitLikeEvent(
  'post', // or 'video' based on content type
  postId,
  authorId, // from post/video data
  userId, // from authenticated user
  username, // from authenticated user
  isLiked, // true for like, false for unlike
  newLikeCount // updated total
);
```

#### 2. Enhance WebSocket Events Service (if needed)
**File to Edit**: `backend/src/services/websocketEvents.ts`

**Potential Enhancements**:
- Ensure `emitLikeEvent` method is fully functional
- Add error handling for missing WebSocket server
- Optimize event payload structure
- Add logging for debugging and monitoring

#### 3. Update WebSocket Types (if needed)
**File to Edit**: `backend/src/websocket/types.ts`

**Ensure Proper Types**:
- `LikeEventPayload` interface is complete
- All required fields are properly typed
- Event naming conventions are consistent

### Test-Driven Development Requirements

#### Test Files to Create/Update
1. **Unit Tests**: `tests/controllers/likes.test.ts`
   - Test WebSocket event emission on like/unlike
   - Test error handling when WebSocket fails
   - Test proper event payload structure

2. **Integration Tests**: `tests/websocket/likes-events.test.ts`
   - Test real-time like notifications
   - Test like count updates to viewers
   - Test multi-user like scenarios

#### Test Scenarios Required
- Like a post → Author receives notification
- Unlike a post → Author receives notification  
- Multiple users viewing same post → All receive like count updates
- WebSocket offline → API still works without errors
- Invalid user/post data → Proper error handling

### Success Criteria
- [ ] Like API endpoints emit WebSocket events successfully
- [ ] Post authors receive instant like notifications
- [ ] All viewers see real-time like count updates
- [ ] API continues working even if WebSocket fails
- [ ] All tests pass with >90% coverage
- [ ] No breaking changes to existing API
- [ ] Proper error handling and logging implemented

### Files You Are Authorized to Modify
1. `backend/src/controllers/likes.ts` - **PRIMARY TARGET**
2. `backend/src/services/websocketEvents.ts` - **IF NEEDED**
3. `backend/src/websocket/types.ts` - **IF NEEDED**
4. `tests/controllers/likes.test.ts` - **CREATE/UPDATE**
5. `tests/websocket/likes-events.test.ts` - **CREATE IF NEEDED**

### Files You Must NOT Modify
- WebSocket server files (infrastructure is complete)
- Database models or migrations
- Frontend components
- Configuration files
- Documentation files (unless explicitly requested)

### Validation Requirements
After implementation:
1. Run existing tests to ensure no regressions
2. Test WebSocket integration manually with multiple clients
3. Verify API still works when WebSocket server is down
4. Check logs for proper event emission tracking

### Deliverables
1. Modified `likes.ts` controller with WebSocket integration
2. Updated/created test files with comprehensive coverage
3. Verification that all existing functionality still works
4. Confirmation that real-time like events are properly emitted

## DEVELOPMENT WORKFLOW

### Step 1: Analysis
- Examine current likes controller implementation
- Understand existing WebSocket events service
- Identify exact integration points

### Step 2: TDD Implementation
- Write tests first for WebSocket integration
- Implement integration code to make tests pass
- Ensure no existing functionality breaks

### Step 3: Testing
- Run all existing tests
- Test WebSocket integration manually
- Verify error handling scenarios

### Step 4: Validation
- Confirm real-time functionality works
- Check performance impact
- Validate logs and error handling

## IMPORTANT REMINDERS
- Use desktop commander MCP for ALL docker and curl operations
- Work ONLY on sub-feature 1.1.0 - do not expand scope
- Follow TDD methodology strictly
- Edit existing files rather than creating new ones when possible
- Ensure no breaking changes to existing API
- Focus on integration, not infrastructure changes