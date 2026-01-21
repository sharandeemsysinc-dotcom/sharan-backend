# Alfitt Backend

A robust Node.js backend application built with TypeScript, Express.js, Prisma ORM, and PostgreSQL.

## Features

- 🔐 **Authentication & Authorization**: JWT-based auth with OAuth2.0 (Google)
- 👥 **Role-Based Access Control**: Admin, Staff, Coach, Client roles
- 💳 **Payment Integration**: Stripe for subscriptions and payments
- 📧 **Email Service**: AWS SES integration
- 📦 **File Storage**: AWS S3 integration
- 🗄️ **Database**: PostgreSQL with Prisma ORM
- ✅ **Testing**: Comprehensive test suite with Vitest
- 📝 **Logging**: Structured logging with Pino

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file in the root directory:

```env
PORT=5000
DATABASE_URL="postgresql://username:password@localhost:5432/alfitt_db?schema=public"
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
```

See [SETUP.md](./SETUP.md) for complete environment configuration.

### 3. Setup Database

```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed initial data
npx prisma db seed
```

### 4. Run Development Server

```bash
npm run dev
```

Server will be available at `http://localhost:5000`

## Default Credentials

After seeding, use these credentials to login:

| Role   | Email                 | Password    |
|--------|-----------------------|-------------|
| Admin  | admin@example.com     | Admin@123   |
| Staff  | staff@example.com     | Staff@123   |
| Client | client@gmail.com      | Client@123  |

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm start` | Run production server |
| `npm test` | Run tests |
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run prisma:migrate` | Run database migrations |

## Documentation

- **[SETUP.md](./SETUP.md)** - Complete setup guide with detailed instructions
- **[info.txt](./info.txt)** - Project information and status codes

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `POST /auth/refresh` - Refresh access token
- `GET /auth/google` - Google OAuth login

### Staff Management
- `GET /staff` - List all staff
- `POST /staff` - Create staff member
- `PUT /staff/:id` - Update staff member
- `DELETE /staff/:id` - Delete staff member

### Coach Management
- `GET /coach` - List all coaches
- `POST /coach` - Create coach profile
- `PUT /coach/:id` - Update coach profile
- `POST /coach/subscribe` - Subscribe to plan

### Subscriptions
- `GET /subscription/plans` - List subscription plans
- `POST /subscription/create` - Create subscription

### Feedback
- `GET /feedback` - List feedback
- `POST /feedback` - Create feedback
- `PUT /feedback/:id` - Update feedback
- `DELETE /feedback/:id` - Soft delete feedback

## Project Structure

```
Alfitt/
├── prisma/              # Database schema and migrations
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── config/          # Configuration files
│   ├── controllers/     # Route controllers
│   ├── middlewares/     # Express middlewares
│   ├── models/          # Data models
│   ├── routes/          # API routes
│   ├── types/           # TypeScript types
│   ├── utils/           # Utility functions
│   ├── tests/           # Test files
│   └── server.ts        # Application entry point
├── .env                 # Environment variables
├── package.json
├── tsconfig.json
└── SETUP.md            # Setup documentation
```

## Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT, OAuth2.0
- **Payment**: Stripe
- **Cloud Services**: AWS (S3, SES)
- **Testing**: Vitest
- **Logging**: Pino

## Development

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Database Management

```bash
# Open Prisma Studio
npx prisma studio

# Reset database (WARNING: Deletes all data)
npx prisma migrate reset

# Create new migration
npx prisma migrate dev --name migration_name
```

## Troubleshooting

See the [SETUP.md](./SETUP.md#troubleshooting) file for common issues and solutions.

## License

ISC

## Support

For detailed setup instructions, see [SETUP.md](./SETUP.md)