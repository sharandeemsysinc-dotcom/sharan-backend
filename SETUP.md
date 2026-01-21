# Alfitt Backend - Initial Setup Guide

This guide provides step-by-step instructions to set up and run the Alfitt backend application built with **TypeScript**, **Express.js**, **Prisma ORM**, and **PostgreSQL**.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup](#database-setup)
5. [Seed Initial Data](#seed-initial-data)
6. [Running the Project](#running-the-project)
7. [Available Scripts](#available-scripts)
8. [Testing](#testing)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **npm** (v9 or higher) - Comes with Node.js
- **PostgreSQL** (v14 or higher) - [Download](https://www.postgresql.org/download/)
- **Git** - [Download](https://git-scm.com/)

### Verify Installation

```bash
node --version
npm --version
psql --version
```

---

## Installation

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd Alfitt
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install all required dependencies including:
- Express.js
- Prisma ORM
- TypeScript
- AWS SDK (S3, SES)
- Authentication libraries (JWT, OAuth2)
- Testing frameworks (Vitest)

---

## Environment Configuration

### Step 1: Create Environment File

Create a `.env` file in the root directory:

```bash
# Copy from example (if available) or create new
touch .env
```

### Step 2: Configure Environment Variables

Add the following variables to your `.env` file:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/alfitt_db?schema=public"

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_REFRESH_SECRET=your-refresh-token-secret-change-this
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# AWS Configuration (for S3 and SES)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_S3_BUCKET_NAME=your-bucket-name
AWS_SES_FROM_EMAIL=noreply@yourdomain.com

# OAuth2 Configuration (Google)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5000/auth/google/callback

# Stripe Configuration
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
```

> [!IMPORTANT]
> Replace all placeholder values with your actual credentials. Never commit the `.env` file to version control.

---

## Database Setup

### Step 1: Create PostgreSQL Database

Open PostgreSQL terminal or use a GUI tool like pgAdmin:

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE alfitt_db;

# Exit PostgreSQL
\q
```

### Step 2: Update Database URL

Ensure your `DATABASE_URL` in `.env` matches your PostgreSQL configuration:

```env
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/alfitt_db?schema=public"
```

### Step 3: Generate Prisma Client

```bash
npm run prisma:generate
```

This command:
1. Merges all Prisma schema files (if using modular schemas)
2. Generates the Prisma Client based on your schema

### Step 4: Run Database Migrations

```bash
npm run prisma:migrate
```

Or manually:

```bash
npx prisma migrate dev --name init
```

This will:
- Create all database tables based on your Prisma schema
- Apply migrations to your PostgreSQL database

> [!TIP]
> If you encounter migration issues, you can reset the database with `npx prisma migrate reset` (WARNING: This will delete all data)

---

## Seed Initial Data

The seed script creates initial data including:
- **Roles**: Admin, Staff, Coach, Client
- **Admin User**: email: `admin@example.com`, password: `Admin@123`
- **Staff User**: email: `staff@example.com`, password: `Staff@123`
- **Client User**: email: `client@gmail.com`, password: `Client@123`
- **Subscription Plans**: Basic, Pro, Enterprise

### Run Seed Command

```bash
npx prisma db seed
```

Or using ts-node directly:

```bash
npx ts-node prisma/seed.ts
```

### Verify Seeded Data

```bash
# Open Prisma Studio to view data
npx prisma studio
```

This opens a browser interface at `http://localhost:5555` where you can view all seeded data.

### Default User Credentials

After seeding, you can login with:

| Role   | Email                 | Password    |
|--------|-----------------------|-------------|
| Admin  | admin@example.com     | Admin@123   |
| Staff  | staff@example.com     | Staff@123   |
| Client | client@gmail.com      | Client@123  |

> [!WARNING]
> Change these default passwords in production environments!

---

## Running the Project

### Development Mode (with auto-reload)

```bash
npm run dev
```

This starts the server using **nodemon** which automatically restarts on file changes.

The server will be available at: `http://localhost:5000`

### Production Build

```bash
# Build TypeScript to JavaScript
npm run build

# Start production server
npm start
```

### Verify Server is Running

Open your browser or use curl:

```bash
curl http://localhost:5000/auth/health
```

Or test authentication endpoint:

```bash
curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin@123"}'
```

---

## Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| **Development** | `npm run dev` | Start development server with hot reload |
| **Build** | `npm run build` | Compile TypeScript to JavaScript |
| **Start** | `npm start` | Run production server |
| **Test** | `npm test` | Run all tests once |
| **Test Watch** | `npm run test:watch` | Run tests in watch mode |
| **Test Coverage** | `npm run test:coverage` | Generate test coverage report |
| **Prisma Generate** | `npm run prisma:generate` | Merge schemas and generate Prisma Client |
| **Prisma Migrate** | `npm run prisma:migrate` | Run database migrations |
| **Seed Database** | `npx prisma db seed` | Seed initial data |
| **Prisma Studio** | `npx prisma studio` | Open Prisma Studio GUI |

---

## Testing

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Generate Coverage Report

```bash
npm run test:coverage
```

Coverage reports will be generated in the `coverage/` directory.

### Test Structure

```
src/tests/
├── unit/           # Unit tests for individual functions
│   └── auth.routes.test.ts
└── integration/    # Integration tests for API endpoints
    └── auth.test.ts
```

---

## Troubleshooting

### Issue: "Cannot find module '@prisma/client'"

**Solution:**
```bash
npm run prisma:generate
```

### Issue: "Database connection failed"

**Solutions:**
1. Verify PostgreSQL is running:
   ```bash
   # Windows
   pg_ctl status
   
   # Linux/Mac
   sudo service postgresql status
   ```

2. Check `DATABASE_URL` in `.env` file
3. Ensure database exists:
   ```bash
   psql -U postgres -c "\l"
   ```

### Issue: "Port 5000 already in use"

**Solution:**
Change the `PORT` in `.env` file:
```env
PORT=5001
```

### Issue: Migration errors

**Solution:**
Reset database (WARNING: Deletes all data):
```bash
npx prisma migrate reset
```

### Issue: TypeScript compilation errors

**Solution:**
```bash
# Clean build
rm -rf dist/
npm run build
```

### Issue: Seed script fails

**Solutions:**
1. Ensure migrations are applied:
   ```bash
   npm run prisma:migrate
   ```

2. Check if data already exists (seed uses `skipDuplicates`)
3. Reset database and re-seed:
   ```bash
   npx prisma migrate reset
   npx prisma db seed
   ```

### Issue: AWS services not working

**Solution:**
Verify AWS credentials in `.env`:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

Test AWS connection separately or check IAM permissions.

---

## Project Structure

```
Alfitt/
├── prisma/
│   ├── schema.prisma       # Main Prisma schema (merged)
│   ├── seed.ts             # Database seed script
│   └── migrations/         # Database migrations
├── src/
│   ├── config/             # Configuration files
│   ├── controllers/        # Route controllers
│   ├── middlewares/        # Express middlewares
│   ├── models/             # Data models
│   ├── routes/             # API routes
│   ├── types/              # TypeScript type definitions
│   ├── utils/              # Utility functions
│   ├── tests/              # Test files
│   └── server.ts           # Main application entry
├── public/                 # Static files
├── scripts/                # Build scripts
├── .env                    # Environment variables (not in git)
├── .gitignore
├── package.json
├── tsconfig.json           # TypeScript configuration
└── vitest.config.mts       # Vitest test configuration
```

---

## Next Steps

1. **Configure AWS Services**: Set up S3 buckets and SES for email
2. **Configure Stripe**: Add your Stripe keys for payment processing
3. **Set up OAuth**: Configure Google OAuth credentials
4. **Review Security**: Update JWT secrets and passwords
5. **Deploy**: Follow deployment guide for your hosting platform

---

## Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Express.js Guide](https://expressjs.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vitest Documentation](https://vitest.dev/)

---

## Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review existing issues in the repository
3. Contact the development team

---

**Last Updated:** December 2025
