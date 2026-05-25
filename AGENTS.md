# AGENTS.md

## Project Setup

1. Install dependencies: `npm install`
2. Create environment file: copy `.env.example` to `.env`
3. Generate Prisma Client: `npx prisma generate`
4. Run migrations when needed: `npx prisma migrate dev`
5. Start dev server: `npm run dev`

## Verification Commands

Run these after code, docs, Prisma, or structure changes:

```bash
npx prisma generate
npm run typecheck
npm run build
npm run dev
```

Smoke-test:

```txt
GET http://localhost:3000/health
GET http://localhost:3000/
GET http://localhost:3000/api-docs
```

## Architecture Rules

The project uses a layered Express backend structure with manual dependency wiring.

```txt
src/modules/*          Domain modules
src/infrastructure/*  Database/OAuth/external adapters
src/shared/*          Errors, middleware, OpenAPI registry, utilities
src/routes/index.ts   Centralized API routing
src/container.ts      Manual composition root
src/app.ts            Express app configuration
src/server.ts         Startup lifecycle and graceful shutdown
```

## Coding Standards

- TypeScript strict mode is enabled.
- Use path alias `@/*` for `src/*` imports where practical.
- Use Zod for request validation.
- Use route-level `validate(...)` middleware as the single validation source.
- Do not duplicate `schema.parse(...)` inside controllers.
- Keep controllers thin.
- Put business logic in services.
- Put Prisma queries in repositories.
- Use `AppError` subclasses for expected HTTP errors.
- Use the shared global error handler for error responses.
- Use Pino logger from `src/config/logger.ts`.

## Module Pattern

New modules should follow this pattern:

```txt
src/modules/{module}/
  dtos/
  interfaces/
  validators/
    {module}.schema.ts
    responses.ts
  {module}.controller.ts
  {module}.routes.ts
  {module}.service.ts
```

Database implementation should be placed under:

```txt
src/infrastructure/database/repositories/{module}.repository.ts
```

Then wire the module in:

```txt
src/container.ts
src/routes/index.ts
```

## API Response Format

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "message": "Error message"
  }
}
```

## Documentation Rules

Documentation uses a mixed static + generated flow:

```txt
docs/openapi.yaml
docs/paths/*.yaml
docs/components/**/*.yaml
src/shared/openapi/registry.ts
src/modules/*/validators/*.schema.ts
src/modules/*/validators/responses.ts
```

When endpoint behavior changes:

1. Update the route/controller/service code.
2. Update Zod request schemas.
3. Update `validators/responses.ts` if response shape changes.
4. Update `docs/paths/*.yaml` examples and response refs.
5. Update `docs/openapi.yaml` shared schemas if static schemas are affected.
6. Run `npm run typecheck` and `npm run build`.

## Security

- No hardcoded secrets.
- JWT secrets must come from environment variables.
- Product management mutation routes must remain admin-only.
- Public auth routes should keep rate limiting.
- CORS configuration should remain config-driven.
- Authenticated routes should use `authenticate` and role guards.
