# CODER AGENT TASK: Fix Test Path Resolution (Phase 0.0)

## CRITICAL INSTRUCTIONS FOR CODER AGENT:
- You are running in WSL (Windows Subsystem for Linux) on Ubuntu
- ALWAYS use desktop commander MCP tools for docker and curl operations
- Follow TDD methodology strictly
- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary
- ALWAYS prefer editing existing files over creating new ones
- NEVER proactively create documentation files unless explicitly requested

## ASSIGNED SUB-FEATURE: 0.0 Test Path Resolution Fix

### CURRENT ISSUE:
Tests in backend/tests/integration/ are failing because they use incorrect import paths:
- Currently using: `import { app } from '../src/app';`
- Should be using: `import { app } from '../../src/app';` 
- Tests are one directory deeper than expected

### SPECIFIC TASKS:
- [ ] **0.0.0**: Analyze all test files in backend/tests/ for incorrect import paths
- [ ] **0.0.1**: Fix import paths in auth-registration.test.ts (change '../src/' to '../../src/')
- [ ] **0.0.2**: Fix import paths in all other integration test files with same pattern
- [ ] **0.0.3**: Fix import paths in unit test files if they have similar issues
- [ ] **0.0.4**: Update helper imports in test files (change './helpers/' to '../helpers/' if needed)

### TECHNICAL CONTEXT:
- Working directory: /home/jared/dev/personal/sobertube-app
- Backend directory: /home/jared/dev/personal/sobertube-app/backend
- Test files location: backend/tests/integration/, backend/tests/unit/, backend/tests/helpers/
- Source files location: backend/src/
- Jest runs from backend/ directory, so paths are relative to that

### ERROR EXAMPLE:
```
error TS2307: Cannot find module '../src/app' or its corresponding type declarations.
    7 import { app } from '../src/app';
```

### EXPECTED BEHAVIOR:
After fixes, when running from backend directory:
```bash
cd backend && npm test -- auth-registration.test.ts
```
Should not show module resolution errors.

### FILES TO EXAMINE AND FIX:
- backend/tests/integration/auth-registration.test.ts
- backend/tests/integration/auth-login-logout.test.ts  
- backend/tests/integration/auth-refresh-session.test.ts
- backend/tests/integration/posts-crud.test.ts
- backend/tests/integration/jwt-middleware.test.ts
- backend/tests/integration/profile-endpoints.test.ts
- backend/tests/integration/profile-flow.integration.test.ts
- backend/tests/integration/posts-flow.integration.test.ts
- All other integration test files
- Any unit test files with similar path issues

### TESTING REQUIREMENTS:
1. After making changes, run: `cd backend && npm run build` (must pass)
2. After making changes, run: `cd backend && npm test -- auth-registration.test.ts` (should not have import errors)
3. Verify at least one test can load modules without path resolution errors

### SUCCESS CRITERIA:
- [ ] All test files have correct import paths relative to backend/ directory
- [ ] No TypeScript module resolution errors when running tests
- [ ] Build system continues to work (npm run build passes)
- [ ] Ready for next phase (test system validation)

### CONSTRAINTS:
- Only fix import paths, do not modify test logic or functionality
- Do not create new files, only edit existing ones
- Do not modify Jest configuration unless absolutely necessary
- Focus solely on path resolution issues
- Each import path must be verified to point to correct location

This is a focused, surgical fix for test import paths only. Do not attempt to fix any failing test logic or implement new features.