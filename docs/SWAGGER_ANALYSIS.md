# Swagger/OpenAPI Documentation Analysis

## Project Overview

This document analyzes the current state of Swagger/OpenAPI documentation in the eShop backend project.

## Directory Structure

```
docs/
├── build.js                    # Build script for bundled spec
├── openapi.yaml                # Main OpenAPI spec (references other files)
├── openapi.bundled.yaml        # Bundled OpenAPI spec (all refs resolved)
├── SWAGGER_ANALYSIS.md         # This file
├── components/
│   ├── schemas/                # Reusable schemas
│   │   ├── Error.yaml
│   │   ├── LoginDto.yaml
│   │   ├── RefreshDto.yaml
│   │   ├── RegisterDto.yaml
│   │   ├── TokenResponse.yaml
│   │   └── User.yaml
│   ├── security/
│   │   └── bearerAuth.yaml     # Security scheme definitions
│   └── responses/
│       └── Error.yaml          # Reusable responses
└── paths/
    └── auth.yaml               # Auth endpoint definitions
```

## Current State

### Implemented Modules

| Module | Status | Notes |
|--------|--------|-------|
| **Auth** | ✅ Fully Documented | Register, Login, Refresh, OAuth (Google/Facebook) |

### Planned Modules (Schema Stubs Only)

| Module | Status | Notes |
|--------|--------|-------|
| **Cart** | 📋 Schema Only | Adding items, updating quantities, removing items |
| **Category** | 📋 Schema Only | CRUD operations for categories |
| **Product** | 📋 Schema Only | CRUD operations, listing with filters |
| **Order** | 📋 Schema Only | Order creation, status updates, listing |
| **Coupon** | 📋 Schema Only | CRUD operations, validation, application |
| **Payment** | ⏳ Not Started | Not in Prisma schema yet (planned) |

## Auth Endpoints - Detailed

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/api/v1/auth/register` | Register new user | No |
| POST | `/api/v1/auth/login` | Login with credentials | No |
| POST | `/api/v1/auth/refresh` | Refresh access token | No |
| GET | `/api/v1/auth/google` | Initiate Google OAuth | No |
| GET | `/api/v1/auth/google/callback` | Google OAuth callback | No |
| GET | `/api/v1/auth/facebook` | Initiate Facebook OAuth | No |
| GET | `/api/v1/auth/facebook/callback` | Facebook OAuth callback | No |

## Schemas Documented

- `Error` - Standard error response
- `User` - User entity
- `RegisterDto` - Registration request body
- `LoginDto` - Login request body
- `RefreshDto` - Token refresh request body
- `TokenResponse` - Authentication response

## Endpoints Needing Implementation/Review

1. **Cart Module** - `docs/components/schemas/` + `docs/paths/`
   - Add item to cart
   - Update item quantity
   - Remove item from cart
   - Clear cart
   - Apply coupon to cart

2. **Category Module**
   - List all categories
   - Get category by slug
   - Create category (admin)
   - Update category (admin)
   - Delete category (admin)

3. **Product Module**
   - List products (with pagination, filters)
   - Search products
   - Get product by slug
   - Create product (admin)
   - Update product (admin)
   - Delete product (admin)

4. **Order Module**
   - List user orders
   - Get order by ID
   - Create order (checkout)
   - Cancel order
   - Update order status (admin/delivery)

5. **Coupon Module**
   - List active coupons
   - Validate coupon
   - Create coupon (admin)
   - Update coupon (admin)
   - Delete coupon (admin)

## Assumptions

1. **API Versioning** - All endpoints use `/api/v1/` prefix
2. **Authentication** - JWT Bearer tokens used for protected routes
3. **Error Format** - All errors return `{ message: string, statusCode: number }`
4. **User Roles** - Three roles: `USER`, `ADMIN`, `DELIVERY`
5. **File Upload** - Product images handled separately (not documented yet)
6. **Payment Integration** - Payment endpoints will be added when payment gateway is integrated

## Scripts

```bash
# Build the bundled swagger spec (outputs to dist/swagger.json)
npm run swagger:build
```

## Future Considerations

- Add request/response examples to all endpoints
- Document pagination for list endpoints
- Add webhook documentation for payment events
- Add rate limiting documentation
- Add OpenAPI security schemes for protected endpoints
- Add server variables for different environments
