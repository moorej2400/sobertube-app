# CODER-AGENT INSTRUCTIONS: SUB-FEATURE 1.1.1 - REAL-TIME COMMENTS SYSTEM

## CRITICAL ENVIRONMENT & METHODOLOGY REQUIREMENTS

### Environment Context
- **Platform**: WSL (Windows Subsystem for Linux) on Ubuntu  
- **Working Directory**: `/home/jared/dev/personal/sobertube-app`
- **MANDATORY**: ALWAYS use desktop commander MCP tools for docker and curl operations
- **MANDATORY**: Follow TDD (Test-Driven Development) methodology strictly
- **MANDATORY**: Do what has been asked; nothing more, nothing less
- **MANDATORY**: NEVER create files unless absolutely necessary
- **MANDATORY**: ALWAYS prefer editing existing files over creating new ones
- **MANDATORY**: NEVER proactively create documentation files unless explicitly requested

### Assignment Scope
**ONLY WORK ON SUB-FEATURE 1.1.1**: Real-Time Comments System
- **DO NOT** work on multiple features or sub-features
- **DO NOT** work on any other phase, feature, or sub-feature
- **FOCUS ONLY** on integrating WebSocket events with the existing comments API

## SUB-FEATURE 1.1.1 IMPLEMENTATION REQUIREMENTS

### Objective
Integrate WebSocket events with existing comments API to enable real-time comment notifications and updates.

### Specific Tasks (from TASK-timeline-feed-realtime-features.md)
1. ✅ Integrate WebSocket events with existing comments API
2. ✅ Implement instant comment notifications  
3. ✅ Add real-time comment thread updates
4. ✅ Create comment reply notifications
5. ✅ Implement comment moderation events
6. ✅ Add comment editing and deletion events

### SUCCESS PATTERN TO FOLLOW
**REFERENCE**: Sub-feature 1.1.0 (Real-Time Likes System) - COMPLETED & OPERATIONAL
- Location: `/home/jared/dev/personal/sobertube-app/backend/src/controllers/likes.ts` (lines 170-185)
- Pattern: After successful database operation, call `webSocketEventsService.emitLikeEvent()`
- WebSocket Service: `/home/jared/dev/personal/sobertube-app/backend/src/services/websocketEvents.ts`

### CURRENT STATE ANALYSIS
1. **Comments Controller**: `/backend/src/controllers/comments.ts` - EXISTS, fully functional CRUD operations
2. **WebSocket Events Service**: `/backend/src/services/websocketEvents.ts` - EXISTS, has `emitCommentEvent()` method ready
3. **WebSocket Infrastructure**: COMPLETE and operational (sub-feature 1.1.0 proves this)
4. **Missing Integration**: Comments controller does not call websocket events service

## TECHNICAL IMPLEMENTATION PLAN

### Phase 1: Create Comment WebSocket Integration
**File**: `/backend/src/controllers/comments.ts`
**Action**: Edit existing file to add websocket event calls

#### 1.1. Import WebSocket Service (if missing)
```typescript
import { webSocketEventsService } from '../services/websocketEvents';
```

#### 1.2. Integrate in createComment method (around line 150)
After successful comment creation, add:
```typescript
// Emit real-time WebSocket event for new comment
if (comment && comment.id) {
  try {
    await webSocketEventsService.emitCommentEvent(
      comment.id,
      content_id, // postId
      authorId, // Get from content owner
      userId,
      req.user.username || 'Unknown User',
      comment.content,
      parent_comment_id
    );
    
    logger.info('WebSocket comment event emitted successfully', {
      commentId: comment.id,
      contentType: content_type,
      contentId: content_id,
      commenterId: userId,
      requestId: req.requestId
    });
  } catch (wsError) {
    logger.error('Failed to emit WebSocket comment event', {
      error: wsError instanceof Error ? wsError.message : 'Unknown error',
      commentId: comment.id,
      requestId: req.requestId
    });
    // Don't fail the request if WebSocket fails
  }
}
```

### Phase 2: Update Comment WebSocket Integration  
**File**: `/backend/src/controllers/comments.ts`
**Action**: Edit updateComment method to emit update events

#### 2.1. Add WebSocket event for comment updates
After successful comment update, add websocket event emission for comment edits.

### Phase 3: Delete Comment WebSocket Integration
**File**: `/backend/src/controllers/comments.ts`  
**Action**: Edit deleteComment method to emit deletion events

#### 3.1. Add WebSocket event for comment deletions
After successful comment deletion, add websocket event emission for comment removals.

### Phase 4: Enhance WebSocket Events Service (if needed)
**File**: `/backend/src/services/websocketEvents.ts`
**Action**: Review and enhance emitCommentEvent method if needed for additional event types

## WEBSOCKET SERVICE METHODS AVAILABLE

### Current emitCommentEvent Signature
```typescript
public async emitCommentEvent(
  commentId: string,
  postId: string,
  authorId: string,
  commenterId: string,
  commenterUsername: string,
  content: string,
  parentCommentId?: string
): Promise<void>
```

### Required Additional Methods (if not present)
- `emitCommentUpdateEvent()` - for comment edits
- `emitCommentDeleteEvent()` - for comment deletions

## TESTING REQUIREMENTS

### TDD Methodology
1. **Write tests FIRST** before implementing
2. **Test each integration point** - websocket event calls
3. **Test error handling** - websocket failures should not break API
4. **Test all comment operations** - create, update, delete with websocket events

### Test Files to Create/Update
- Integration tests for comment websocket events
- Unit tests for websocket service comment methods
- End-to-end tests for real-time comment notifications

## DELIVERABLES & SUCCESS CRITERIA

### Required Deliverables
1. **Modified Comments Controller** with websocket integration
2. **Enhanced WebSocket Events Service** (if additional methods needed)
3. **Comprehensive Tests** following TDD methodology
4. **Working Real-Time Comments** - instant notifications working

### Success Verification
1. Comments create/update/delete trigger websocket events
2. Real-time notifications work for comment authors and viewers
3. All existing comment API functionality remains intact
4. Tests pass and coverage maintained
5. No performance degradation

## CRITICAL REMINDERS
- **ONE SUB-FEATURE ONLY**: 1.1.1 Real-Time Comments System
- **WSL Environment**: Use desktop commander for docker/curl operations
- **TDD Methodology**: Write tests first, implement second
- **Edit, Don't Create**: Prefer editing existing files
- **Reference Working Pattern**: Follow the successful likes system implementation
- **Error Handling**: WebSocket failures must not break API functionality

## COMPLETION CRITERIA
Sub-feature 1.1.1 is COMPLETE when:
- [x] WebSocket events integrated with existing comments API
- [x] Instant comment notifications implemented
- [x] Real-time comment thread updates working
- [x] Comment reply notifications functional  
- [x] Comment moderation events implemented
- [x] Comment editing and deletion events working
- [x] All tests passing
- [x] No regressions in existing functionality