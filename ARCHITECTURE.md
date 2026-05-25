# EShop Backend Architecture

This document describes the project structure, code flow, and documentation flow for the EShop backend.

The codebase uses a layered Express architecture. Dependency wiring is done manually in `src/container.ts`.

## Goals

- Keep modules isolated by business domain.
- Keep controllers thin.
- Keep validation at the route layer.
- Keep business rules in services.
- Keep database access in repositories.
- Keep cross-cutting concerns in `shared`.
- Keep startup/shutdown logic in `server.ts`.
- Keep API docs synchronized with actual response envelopes.

## Folder Layers

```txt
src/
  config/
  infrastructure/
  modules/
  routes/
  shared/
  types/
  app.ts
  container.ts
  server.ts
```

## Layer Responsibilities

### `src/config`

Configuration and application-level setup helpers.

```txt
constants.ts    API prefix and project constants
env.ts          Environment variable validation
index.ts        Config object aggregation
logger.ts       Pino logger
swagger.ts      Swagger/OpenAPI setup
```

### `src/modules`

Domain-level feature modules.

Current modules:

```txt
auth/
products/
```

A module owns:

```txt
dtos/           TypeScript request/response/domain DTOs
interfaces/    Ports/contracts, usually repository interfaces
validators/    Zod request and response schemas
controller.ts  HTTP request/response translation
routes.ts      Express routes, validation, auth/RBAC middleware
service.ts     Business logic
```

### `src/infrastructure`

Adapters and external-facing implementations.

Current adapters:

```txt
auth/token.service.ts
database/prisma.client.ts
database/db.ts
database/repositories/*.repository.ts
oauth/google.oauth.ts
```

Repository implementations live in infrastructure because Prisma is an external database adapter.

### `src/shared`

Cross-cutting application concerns.

```txt
errors/         AppError and global error handler
middlewares/    Auth, RBAC, CORS, Helmet, validation, request logging
openapi/        Zod/OpenAPI registry
utils/          Shared helpers
```

### `src/routes`

Central API route mounting.

```txt
src/routes/index.ts
```

This file mounts module routers under their module-level path:

```txt
/auth
/products
```

`app.ts` mounts the centralized router under `config.constants.API_PREFIX`, currently:

```txt
/api/v1
```

### `src/container.ts`

Manual composition root.

This file wires:

```txt
Prisma client
  -> repositories
  -> services
  -> controllers
  -> routers
```

### `src/app.ts`

Express app configuration.

Responsibilities:

- Disable `x-powered-by`
- Register request ID middleware
- Register request logger
- Register security middleware
- Register JSON/body parsing
- Register Swagger UI
- Register health/root routes
- Mount `/api/v1`
- Register not-found and global error handlers

### `src/server.ts`

Startup lifecycle.

Responsibilities:

- Log startup
- Connect database
- Create Express app
- Start HTTP server
- Register graceful shutdown handlers
- Handle uncaught exceptions and unhandled rejections

Expected startup log order:

```txt
Starting EShop Backend...
Database connection established
🚀 Swagger UI available at: http://localhost:3000/api-docs
Express app configured
Server listening on port 3000
Environment: development
EShop Backend started successfully
```

## Request Flow

```txt
HTTP Request
  -> requestIdMiddleware
  -> requestLoggerMiddleware
  -> helmet/cors/body parser
  -> src/routes/index.ts
  -> module routes
  -> validate(...)
  -> authenticate / authorize when needed
  -> controller
  -> service
  -> repository
  -> Prisma
  -> PostgreSQL
```

## Validation Flow

Validation should happen once at the route layer.

Correct:

```ts
router.post('/login', validate(loginSchema), controller.login)
```

Controller then uses typed request data:

```ts
const result = await this.authService.login(req.body as LoginDto)
```

Avoid:

```ts
const data = loginSchema.parse(req.body)
```

inside controllers, because it duplicates route-level validation.

## Error Flow

Expected HTTP/domain errors should use `AppError` or subclasses:

```txt
UnauthorizedError
ForbiddenError
ConflictError
NotFoundError
```

Unhandled errors go to `globalErrorHandler`.

Response format:

```json
{
  "success": false,
  "error": {
    "message": "Error message"
  }
}
```

## Response Format

All JSON success responses should use:

```json
{
  "success": true,
  "data": {}
}
```

Examples:

```json
{
  "success": true,
  "data": {
    "accessToken": "..."
  }
}
```

```json
{
  "success": true,
  "data": {
    "product": {}
  }
}
```

Delete endpoints can return `204 No Content`.

## Documentation Flow

See `docs/SWAGGER_ANALYSIS.md` for full details.

Short version:

```txt
docs/openapi.yaml
  -> docs/paths/*.yaml
  -> docs/components/**/*.yaml
  -> src/shared/openapi/registry.ts
  -> validators/*.schema.ts
  -> validators/responses.ts
```

Docs must match actual controller responses.

## Adding a New Module

Example: `categories`

1. Create module folder:

```txt
src/modules/categories/
  dtos/
  interfaces/
  validators/
    category.schema.ts
    responses.ts
  category.controller.ts
  category.routes.ts
  category.service.ts
```

2. Create repository interface:

```txt
src/modules/categories/interfaces/category.repository.interface.ts
```

3. Create Prisma repository:

```txt
src/infrastructure/database/repositories/category.repository.ts
```

4. Wire it in `src/container.ts`.

5. Mount it in `src/routes/index.ts`.

6. Add OpenAPI path docs:

```txt
docs/paths/categories.yaml
```

7. Reference the path file from `docs/openapi.yaml`.

8. Run:

```bash
npx prisma generate
npm run typecheck
npm run build
```

## What Not To Do

- Do not put Prisma queries directly inside controllers.
- Do not duplicate Zod parsing inside controllers.
- Do not mount module routes directly in `app.ts`.
- Do not add fake startup logs for services that do not exist.
- Do not document response shapes that differ from actual controller output.
