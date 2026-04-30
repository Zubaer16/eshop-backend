# AGENTS.md

## Project Setup

1. Install dependencies: `npm install`
2. Set up environment: Copy `.env.example` to `.env` and fill in values
3. Run migrations: `npx prisma migrate dev`
4. Start dev server: `npm run dev`

## Code Standards

- TypeScript strict mode enabled
- Use Zod for validation
- Use path alias `@/*` for src imports
- Follow existing module structure: `src/modules/{module}/{module}.controller.ts`

## Available Scripts

- `npm run dev` - Development with hot reload
- `npm run build` - Compile TypeScript
- `npm run typecheck` - Run TypeScript type check
- `npm run lint` - Run ESLint

## Architecture

- **Controller**: Handles HTTP requests/responses
- **Service**: Business logic
- **Repository**: Database operations (Prisma)
- **DTOs**: Data transfer objects
- **Validators**: Zod schemas for validation

## Security

- JWT tokens with separate access/refresh secrets
- Rate limiting on auth endpoints
- Helmet for security headers
- CORS enabled
- No hardcoded secrets in code