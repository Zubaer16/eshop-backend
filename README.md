# eshop-backend

A TypeScript + Express backend for an e-commerce platform. The project manages authentication, product catalog APIs, shopping/cart-related database models, coupons, orders, and payments using PostgreSQL and Prisma.

## Tech Stack

- Runtime: Node.js 20+
- Language: TypeScript
- Framework: Express
- ORM: Prisma
- Database: PostgreSQL
- Validation: Zod
- API Docs: Swagger UI + OpenAPI YAML + Zod OpenAPI registry
- Logging: Pino

## Domain Overview

Current implemented modules:

- **Auth**: Email/password auth, refresh token validation, Google OAuth support, JWT access/refresh tokens.
- **Products**: Product listing, product detail, product creation/update/delete with role-based access.

The Prisma schema also includes broader e-commerce models for users, categories, product images, cart, coupons, orders, and payments.

## Project Structure

```txt
src/
  config/
    constants.ts
    env.ts
    index.ts
    logger.ts
    swagger.ts

  infrastructure/
    auth/
    database/
      repositories/
      db.ts
      prisma.client.ts
    oauth/

  modules/
    auth/
      dtos/
      interfaces/
      validators/
        auth.schema.ts
        responses.ts
      auth.controller.ts
      auth.routes.ts
      auth.service.ts
      oauth.service.ts

    products/
      dtos/
      interfaces/
      validators/
        product.schema.ts
        responses.ts
      product.controller.ts
      product.routes.ts
      product.service.ts

  routes/
    index.ts

  shared/
    errors/
    middlewares/
    openapi/
    utils/

  types/
    express.d.ts

  app.ts
  container.ts
  server.ts
```

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full architecture and coding flow.

High-level request flow:

```txt
HTTP Request
  -> app middleware
  -> src/routes/index.ts
  -> module route
  -> validate(...) middleware
  -> auth/RBAC middleware when needed
  -> controller
  -> service
  -> repository
  -> Prisma/PostgreSQL
```

## API Response Format

Successful responses use this envelope:

```json
{
  "success": true,
  "data": {}
}
```

Error responses use:

```json
{
  "success": false,
  "error": {
    "message": "Error message"
  }
}
```

## API Documentation

Swagger UI is available after the server starts:

```txt
http://localhost:3000/api-docs
```

The documentation flow is:

```txt
docs/openapi.yaml
  -> docs/paths/*.yaml
  -> docs/components/**/*.yaml
  -> src/shared/openapi/registry.ts
  -> src/modules/*/validators/*.ts
```

Notes:

- Static path docs live in `docs/paths`.
- Shared OpenAPI components live in `docs/components`.
- Zod request schemas live in `src/modules/*/validators/*.schema.ts`.
- Zod response schemas live in `src/modules/*/validators/responses.ts`.
- The runtime Swagger setup merges static YAML docs with Zod/OpenAPI schemas.
- No separate Swagger generation step is required in the current setup.

See [`docs/SWAGGER_ANALYSIS.md`](./docs/SWAGGER_ANALYSIS.md) for the detailed documentation flow.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Update the values in `.env`:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/eshop_db?schema=public"
PORT=3000
NODE_ENV=development

JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback
```

### 3. Run Prisma

```bash
npx prisma generate
npx prisma migrate dev
```

Use `npx prisma migrate dev` only when applying migrations in development. If the database is already migrated, `npx prisma generate` is usually enough after pulling code.

### 4. Run development server

```bash
npm run dev
```

Expected startup log pattern:

```txt
INFO: Starting EShop Backend...
INFO: Database connection established
INFO: 🚀 Swagger UI available at: http://localhost:3000/api-docs
INFO: Express app configured
INFO: Server listening on port 3000
INFO: Environment: development
INFO: EShop Backend started successfully
```

## Available Scripts

```bash
npm run dev        # Start development server with tsx watch
npm run build      # Compile TypeScript and copy docs into dist/docs
npm run start      # Run compiled server
npm run typecheck  # TypeScript type check only
npm run lint       # ESLint
npm run test       # Placeholder test command
```

## Verification Checklist

After changing backend structure, docs, or schemas:

```bash
npx prisma generate
npm run typecheck
npm run build
npm run dev
```

Then check:

```txt
GET http://localhost:3000/health
GET http://localhost:3000/
GET http://localhost:3000/api-docs
```

## Current Endpoints

Base API prefix:

```txt
/api/v1
```

Auth:

```txt
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/oauth/:provider
GET  /api/v1/auth/google
GET  /api/v1/auth/google/callback
```

Products:

```txt
GET    /api/v1/products
POST   /api/v1/products
GET    /api/v1/products/:id
GET    /api/v1/products/slug/:slug
PATCH  /api/v1/products/:id
DELETE /api/v1/products/:id
```

## Development Rules

- Keep validation in route-level `validate(...)` middleware.
- Controllers should not re-parse with Zod.
- Controllers should only translate HTTP request/response.
- Services should contain business logic.
- Repositories should contain Prisma/database operations.
- New modules should follow the existing `auth` and `products` folder pattern.
- Keep API docs in sync with actual `{ success, data }` response envelopes.
