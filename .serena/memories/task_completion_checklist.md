# Task Completion Checklist

## Mandatory Steps After Completing Any Development Task

### 1. Code Quality Checks
```bash
# Backend code quality
cd backend
npm run lint              # Fix any linting errors
npm run build            # Ensure TypeScript compiles

# Frontend code quality  
cd frontend
npm run lint             # Fix any linting errors
npm run build            # Ensure Vite builds successfully
```

### 2. Testing Requirements (CRITICAL)
```bash
# Backend testing - MUST PASS
cd backend
npm test                 # All tests must pass
npm run test:coverage    # Coverage must be ≥80%

# Frontend testing - MUST PASS
cd frontend
npm test                 # All tests must pass
npm run test:coverage    # Coverage validation

# Integration testing
npm test                 # Root level integration tests
```

### 3. Database Integrity
```bash
# If database changes were made
supabase db reset        # Test schema migrations
supabase db push         # Validate schema changes
supabase gen types typescript --local  # Update TypeScript types
```

### 4. Manual Testing Verification
- [ ] Feature works as expected in development environment
- [ ] Error handling works correctly
- [ ] Authentication flows work (if applicable)
- [ ] API endpoints respond correctly
- [ ] UI components render properly (if frontend changes)
- [ ] Responsive design works on mobile/tablet (if frontend changes)

### 5. Performance Verification
- [ ] No memory leaks in development
- [ ] Database queries are optimized
- [ ] API response times are acceptable (<500ms)
- [ ] Frontend bundle size is reasonable
- [ ] No console errors or warnings

### 6. Documentation Updates
- [ ] Update API documentation if endpoints changed
- [ ] Update README if new setup steps required
- [ ] Update CLAUDE.md if development process changed
- [ ] Add inline code comments for complex logic

### 7. Git Best Practices
```bash
git add .
git commit -m "descriptive message following conventional commits"
# Format: type(scope): description
# Example: feat(auth): implement refresh token rotation
```

### 8. Error Recovery Testing
- [ ] Test error scenarios (network failures, invalid inputs)
- [ ] Verify graceful degradation
- [ ] Test error messages are user-friendly
- [ ] Confirm proper error logging

## Test-Driven Development Requirements

### NEVER Proceed Without:
- ✅ All existing tests passing
- ✅ New tests written for new functionality
- ✅ Integration tests verify real data flow
- ✅ No failing test cases
- ✅ Coverage thresholds met (≥80%)

### If Tests Fail:
1. **STOP IMMEDIATELY** - Do not continue development
2. Fix the failing tests before proceeding
3. Understand why tests failed
4. Ask user for help if blocked
5. Never skip or disable tests to make progress

### Development Philosophy:
- Small, incremental changes
- Test each change immediately
- Real integration tests with actual database calls
- No mock implementations that fake functionality
- Measure progress through working, tested features