# Swagger / OpenAPI Documentation Flow

This project uses a mixed static + Zod-generated OpenAPI flow.

The goal is to keep Swagger useful for humans while keeping request/response schemas close to the code.

## Current Runtime Flow

Swagger UI is mounted in:

```txt
src/config/swagger.ts
```

It loads:

```txt
docs/openapi.yaml
```

Then resolves local file references like:

```yaml
$ref: './paths/auth.yaml#/register'
$ref: './components/security/bearerAuth.yaml'
```

It also merges schemas generated from Zod/OpenAPI registrations found under:

```txt
src/modules/*/validators/*.ts
```

The registry code lives in:

```txt
src/shared/openapi/registry.ts
```

## Main Files

```txt
docs/openapi.yaml
docs/paths/auth.yaml
docs/paths/products.yaml
docs/components/security/bearerAuth.yaml
src/shared/openapi/registry.ts
src/modules/auth/validators/auth.schema.ts
src/modules/auth/validators/responses.ts
src/modules/products/validators/product.schema.ts
src/modules/products/validators/responses.ts
```

## Source of Truth

### Endpoint paths

Source of truth:

```txt
docs/paths/*.yaml
```

These files document endpoint summaries, descriptions, parameters, request bodies, response refs, examples, and security.

### Request schemas

Source of truth:

```txt
src/modules/*/validators/*.schema.ts
```

These are Zod schemas used by route-level `validate(...)` middleware.

### Response schemas

Source of truth:

```txt
src/modules/*/validators/responses.ts
```

These describe the response envelope:

```json
{
  "success": true,
  "data": {}
}
```

Static fallback schemas also exist in:

```txt
docs/openapi.yaml
```

These should stay aligned with Zod response schemas.

### Security scheme

Source of truth:

```txt
docs/components/security/bearerAuth.yaml
```

## Response Envelope

All documented JSON success responses should use:

```json
{
  "success": true,
  "data": {}
}
```

All documented JSON error responses should use:

```json
{
  "success": false,
  "error": {
    "message": "Error message"
  }
}
```

Delete endpoints can return:

```txt
204 No Content
```

## Endpoint Documentation Pattern

Each endpoint should include:

- `summary`
- `description`
- `tags`
- `security`, if authenticated
- `parameters`, if path/query params exist
- `requestBody`, if needed
- `responses`
- realistic request/response examples

Example:

```yaml
login:
  post:
    summary: Login with email and password (PUBLIC)
    description: Authenticates a user and returns access and refresh tokens.
    tags:
      - Auth
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/LoginRequest'
          example:
            email: user@example.com
            password: secret123
    responses:
      '200':
        description: Login successful
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/TokenResponse'
```

## Adding New Endpoint Docs

1. Add or update the module route in code.
2. Add request validation schema in `src/modules/{module}/validators/{module}.schema.ts`.
3. Add response schema in `src/modules/{module}/validators/responses.ts`.
4. Add path documentation in `docs/paths/{module}.yaml`.
5. Add `$ref` in `docs/openapi.yaml`.
6. Check Swagger UI:

```txt
http://localhost:3000/api-docs
```

7. Run:

```bash
npm run typecheck
npm run build
```

## Common Mistakes

### Mistake: documenting direct response objects

Wrong:

```json
{
  "accessToken": "..."
}
```

Correct:

```json
{
  "success": true,
  "data": {
    "accessToken": "..."
  }
}
```

### Mistake: forgetting auth security

Product routes require bearer auth. Mutation routes require admin role in code, so documentation should mention admin in summary/description.

### Mistake: updating docs but not Zod schemas

If request body validation changes, update the Zod schema first, then docs.

### Mistake: adding fake generated docs step

There is no required Swagger generation script in the current package. Swagger is assembled at runtime by `src/config/swagger.ts`.

## Verification

After documentation changes:

```bash
npm run typecheck
npm run build
npm run dev
```

Then open:

```txt
http://localhost:3000/api-docs
```

Check:

- Schemas are visible.
- Path refs resolve.
- Examples render.
- Response envelopes match actual API output.
