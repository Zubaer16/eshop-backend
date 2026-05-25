# Swagger schema cleanup overlay

This overlay:
- Makes OAuthLoginRequest generated from Zod/OpenAPI.
- Keeps static docs/openapi.yaml schemas limited to Provider and Error.
- Updates Product response schema to include optional category/images.
- Documents Prisma Decimal price fields as number|string until a mapper normalizes them.
- Updates docs/SWAGGER_ANALYSIS.md.
- Cleans old external wording from src/container.ts comment.

After extracting:

```bash
npm run typecheck
npm run build
npm run dev
```

Then open:

```txt
http://localhost:3000/api-docs
```

Check Schemas:
- OAuthLoginRequest
- ProductCategory
- ProductImage
- Product
- ProductResponse
- PaginatedProductsResponse
