# SoberTube Code Style and Conventions

## TypeScript Configuration
- **Target**: ES2020
- **Module**: CommonJS (backend), ESM (frontend)  
- **Strict Mode**: Enabled with all strict checks
- **Path Mapping**: `@/*` maps to `./src/*`
- **Declaration Files**: Generated for backend
- **Source Maps**: Enabled for debugging

## Code Style Standards

### Naming Conventions
- **Files**: kebab-case (e.g., `auth-middleware.ts`)
- **Directories**: camelCase or kebab-case
- **Variables/Functions**: camelCase
- **Classes**: PascalCase
- **Constants**: UPPER_SNAKE_CASE
- **Interfaces**: PascalCase (no "I" prefix)
- **Types**: PascalCase

### File Organization
```
backend/src/
├── controllers/     # Request handlers
├── middleware/      # Express middleware
├── routes/         # Route definitions
├── services/       # Business logic
├── models/         # Data models (future)
├── utils/          # Utility functions
├── types/          # Type definitions
└── config/         # Configuration

backend/tests/
├── unit/           # Unit tests
├── integration/    # Integration tests
└── helpers/        # Test utilities
```

### Documentation Standards
- **JSDoc Comments**: Required for all public functions and classes
- **Type Annotations**: Explicit types preferred over inference
- **Error Messages**: Descriptive and user-friendly
- **API Documentation**: Follow OpenAPI/Swagger standards

### Error Handling
- **Custom Error Classes**: Extend base Error class
- **HTTP Status Codes**: Use appropriate status codes
- **Error Logging**: Structured logging with Winston
- **Validation**: Joi schemas for input validation

### Import/Export Style
- **Named Imports**: Preferred over default imports
- **Absolute Imports**: Use `@/` path mapping
- **Barrel Exports**: Use index.ts files sparingly
- **No Unused Imports**: Enforced by ESLint

### Database Conventions
- **Table Names**: Snake_case (e.g., `user_profiles`)
- **Column Names**: Snake_case
- **Foreign Keys**: Reference table name + `_id`
- **Timestamps**: `created_at`, `updated_at`
- **UUIDs**: Use for primary keys

### Testing Conventions
- **File Naming**: `*.test.ts` or `*.spec.ts`
- **Test Organization**: Group by feature/component
- **Mocking**: Use Jest mocks for external dependencies
- **Assertions**: Descriptive test names and assertions
- **Coverage**: Minimum 80% coverage threshold