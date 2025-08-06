# CODER-AGENT Task: Sub-feature 1.1.0 - Real-Time Likes System

## CRITICAL CONTEXT
You are operating as a CODER-AGENT in WSL (Windows Subsystem for Linux) on Ubuntu, working ONLY on Sub-feature 1.1.0.

## CRITICAL INSTRUCTIONS FOR OPERATIONS
- ALWAYS use desktop commander MCP tools for docker and curl operations
- Follow TDD (Test-Driven Development) methodology strictly
- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary for achieving your goal
- ALWAYS prefer editing existing files over creating new ones
- NEVER proactively create documentation files unless explicitly requested

## SINGLE SUB-FEATURE ASSIGNMENT
**Sub-feature 1.1.0: Real-Time Likes System**

Your ONLY responsibility is to implement these specific tasks:
- [ ] Integrate WebSocket events with existing likes API
- [ ] Implement instant like notifications to post authors
- [ ] Add real-time like count updates to all viewers
- [ ] Create like activity feed updates
- [ ] Add optimistic UI updates for likes
- [ ] Implement like event batching for performance

## FOUNDATION CONTEXT
**✅ WebSocket Infrastructure Available:**
- Socket.IO server with TypeScript integration in `backend/src/websocket/`
- JWT authentication for WebSocket connections
- Connection management with user session tracking
- Event routing and subscription management
- Complete TypeScript interfaces and error handling

**✅ Existing Social APIs:**
- Complete likes system implemented in social interaction controllers
- All CRUD operations for likes working
- Authentication and authorization in place
- Database models and relationships established

## TECHNICAL REQUIREMENTS

### 1. Integration with Existing Likes API
- Locate existing likes controller/routes in the backend
- Add WebSocket event emission when likes are created/removed
- Ensure backward compatibility with existing like functionality
- Maintain existing authentication and authorization

### 2. Real-Time Event Implementation
- Create WebSocket events for like actions:
  - `like:created` - When a user likes content
  - `like:removed` - When a user unlikes content
  - `like:count_updated` - For real-time count updates
- Implement event payload structures with TypeScript interfaces
- Add proper error handling for all WebSocket events

### 3. Notification System
- Send instant notifications to content authors when their content is liked
- Implement real-time like count updates for all viewers of the content
- Create activity feed updates for social interactions
- Ensure notifications don't spam users with redundant information

### 4. Performance Optimization
- Implement event batching to prevent spam during rapid likes/unlikes
- Add debouncing for like count updates
- Optimize database queries for real-time operations
- Implement proper rate limiting for like events

### 5. TypeScript Implementation
- Create comprehensive TypeScript interfaces for all like events
- Ensure type safety across WebSocket event handlers
- Add proper error typing and handling
- Maintain consistency with existing codebase patterns

## WORKING DIRECTORY
/home/jared/dev/personal/sobertube-app

## KEY DIRECTORIES TO WORK WITH
- `backend/src/websocket/` - WebSocket infrastructure (already implemented)
- `backend/src/controllers/` - Existing social interaction controllers
- `backend/src/routes/` - API routes that need WebSocket integration
- `backend/src/models/` - Database models for likes system
- `backend/src/types/` - TypeScript interfaces

## SUCCESS CRITERIA
1. **WebSocket Integration**: Existing likes API emits real-time events
2. **Instant Notifications**: Content authors receive immediate like notifications
3. **Live Updates**: Like counts update in real-time for all viewers
4. **Performance**: Optimized event batching and rate limiting
5. **Type Safety**: Complete TypeScript implementation
6. **Testing**: Comprehensive tests for all real-time like functionality
7. **Backward Compatibility**: Existing likes API continues to work unchanged

## IMPLEMENTATION APPROACH
1. **Start with existing likes controller** - Identify and examine current implementation
2. **Add WebSocket event emission** - Integrate real-time events into existing like/unlike operations
3. **Create event handlers** - Implement WebSocket listeners for like events
4. **Add notification system** - Build real-time notifications for content authors
5. **Implement live updates** - Create real-time like count updates for viewers
6. **Add performance optimizations** - Implement batching and rate limiting
7. **Write comprehensive tests** - Test all real-time functionality

## CONSTRAINTS
- Work ONLY on Sub-feature 1.1.0 - Do not implement other sub-features
- Build upon existing WebSocket infrastructure - Do not recreate it
- Maintain existing API contracts - Do not break backward compatibility
- Follow established TypeScript patterns in the codebase
- Use existing authentication and authorization systems

## EXPECTED DELIVERABLES
- Modified likes controller with WebSocket event emission
- WebSocket event handlers for like notifications
- Real-time like count update system
- TypeScript interfaces for all like events
- Performance optimizations (batching, rate limiting)
- Comprehensive tests for real-time like functionality
- Updated documentation for new real-time like events

Focus ONLY on this sub-feature. Do not work on comments, follows, or any other features.