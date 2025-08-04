# CODER AGENT TASK: Fix Authentication Issues (Phase 2.0)

## CRITICAL INSTRUCTIONS FOR CODER AGENT:
- You are running in WSL (Windows Subsystem for Linux) on Ubuntu
- ALWAYS use desktop commander MCP tools for docker and curl operations
- Follow TDD methodology strictly
- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary
- ALWAYS prefer editing existing files over creating new ones
- NEVER proactively create documentation files unless explicitly requested

## ASSIGNED SUB-FEATURE: 2.0 Username Uniqueness & Database Constraint Fix

### CURRENT ISSUE:
**PRIMARY PROBLEM**: Database constraint `"username_length"` violations causing registration failures
- Error: `"new row for relation \"users\" violates check constraint \"username_length\""`
- Test usernames like `"testuser1754317380551"` (21 chars) are being rejected
- Application validation vs database schema mismatch

### SPECIFIC TASKS:
- [ ] **2.0.0**: Analyze current username validation logic in auth controller
- [ ] **2.0.1**: Investigate database schema username constraints
- [ ] **2.0.2**: Fix mismatch between application validation and database constraints
- [ ] **2.0.3**: Ensure proper error response for constraint violations
- [ ] **2.0.4**: Verify auth-registration.test.ts passes username-related tests

### TECHNICAL CONTEXT:
- Working directory: /home/jared/dev/personal/sobertube-app
- Current test results: 13/19 auth tests passing
- Main failure: database constraint violations on username_length
- Application allows usernames that database rejects

### INVESTIGATION NEEDED:
1. **Database Schema Analysis**:
   - Check Supabase/PostgreSQL username constraints
   - Look at migration files for username_length constraint
   - Understand what the constraint actually enforces

2. **Application Validation Analysis**:
   - Check auth controller username validation
   - Review username validation rules in application
   - Compare with database constraint requirements

3. **Test Data Analysis**:
   - Understand why test-generated usernames are failing
   - Check if test usernames exceed database limits

### FILES TO EXAMINE:
- backend/src/controllers/auth.ts (username validation logic)
- supabase/migrations/*.sql (database schema and constraints)
- backend/tests/integration/auth-registration.test.ts (failing tests)
- backend/src/models/ (any user models or validation)

### TESTING REQUIREMENTS:
1. After fixes, run: `cd backend && npm test -- auth-registration.test.ts`
2. Verify no more "username_length" constraint violations
3. Ensure username validation is consistent between app and database
4. Test should improve from 13/19 to ideally 16-19/19 passing

### SUCCESS CRITERIA:
- [ ] No more database constraint violations on username_length
- [ ] Application validation matches database constraints exactly  
- [ ] Username validation tests pass consistently
- [ ] Registration works for valid usernames
- [ ] Clear error messages for invalid usernames
- [ ] Build system continues to work

### APPROACH:
1. **Analysis Phase**: Understand the constraint mismatch
2. **Schema Review**: Check what database actually enforces
3. **Code Fix**: Align application validation with database
4. **Testing**: Verify fix resolves the issue

### CONSTRAINTS:
- Do not modify database schema unless absolutely necessary
- Prefer fixing application validation to match database
- Maintain backward compatibility
- Ensure security is not compromised
- Follow existing code patterns

This is a targeted fix for the primary authentication issue blocking progress.