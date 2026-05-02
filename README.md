# eshop-backend

A robust backend system for an e-commerce platform, managing users, product catalogs, shopping carts, complex coupon systems, and order processing with integrated payment tracking.

## 🚀 Tech Stack

- **Runtime:** Node.js (TypeScript)
- **Framework:** Express (v5.2.1)
- **ORM:** Prisma (v7.7.0)
- **Database:** PostgreSQL
- **Language:** TypeScript (v6.0.2)

## 📦 Domain Overview

The system is designed with the following core domains:

- **User Management**: Role-based access control (`USER`, `ADMIN`, `DELIVERY`) and multi-provider authentication (Credentials, Google).
- **Product Catalog**: Hierarchical organization of products into categories, featuring sale pricing, stock tracking, and multi-image support.
- **Shopping Cart**: Persistent cart system linked to users for seamless shopping experiences.
- **Coupon Engine**: A sophisticated discount system supporting percentages or fixed amounts applied to specific orders, categories, or products, with validity periods and usage limits.
- **Order Lifecycle**: Tracks orders from placement through shipping and delivery, including detailed itemization.
- **Payment Integration**: Support for multiple payment gateways including SSLCOMMERZ, Stripe, COD, Bkash, and Nagad.

## 🛠️ Getting Started

### Prerequisites

- Node.js v20+ (as specified in `.nvmrc`)
- PostgreSQL database

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd eshop-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   Create a `.env` file in the root directory with:
   ```env
   DATABASE_URL="postgresql://postgres:password@localhost:5432/eshop_db?schema=public"
   PORT=3000
   NODE_ENV=development
   JWT_ACCESS_SECRET=your_access_secret
   JWT_REFRESH_SECRET=your_refresh_secret
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback
   ```

4. **Database Setup**
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

5. **Run the application**
   ```bash
   npm run dev
   ```

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm run typecheck` - Run TypeScript type checking
- `npm run lint` - Run ESLint
- `npm run swagger:build` - Generate bundled OpenAPI spec

## 🔗 API Documentation

Once the server is running, visit: http://localhost:3000/api-docs

Endpoints display roles in their summary:
- `(PUBLIC)` - Accessible without authentication
- `(ADMIN)` - Admin only
- `(USER, ADMIN, DELIVERY)` - Authenticated users with specified roles

## 📂 Project Structure

- `prisma/schema.prisma`: Database models and relations.
- `prisma.config.ts`: Prisma configuration.
- `src/`: Source code for the application.
