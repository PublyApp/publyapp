# PublyApp

A modern full-stack web application built with .NET and React, featuring a monorepo
architecture with shared packages and type-safe API communication.

## Tech Stack

### Backend

- **.NET 9.0** - ASP.NET Core Web API
- **Entity Framework Core** - ORM with PostgreSQL
- **Serilog** - Structured logging
- **FluentValidation** - Request validation
- **Scalar** - Interactive API documentation

### Frontend

- **React 19** - UI library
- **React Router v7** - Routing and SSR
- **TypeScript** - Type safety
- **Material-UI (MUI)** - Component library
- **TanStack Query** - Data fetching and caching
- **Zustand** - State management
- **React Hook Form + Zod** - Form handling and validation

### Development Tools

- **Turborepo** - Monorepo build system
- **pnpm** - Fast, efficient package manager
- **oxlint + oxfmt** - Fast JavaScript/TypeScript linting and formatting
- **Husky** - Git hooks for code quality
- **Microsoft Kiota** - Auto-generated TypeScript API client from OpenAPI

### Infrastructure

- **PostgreSQL 18** - Primary database
- **Docker** - Containerization
- **Dokploy** - Deployment platform (Hostinger VPS)

## Project Structure

This is a monorepo managed by Turborepo and pnpm workspaces:

```text
publyapp/
├── apps/
│   ├── api/              # .NET Web API backend
│   ├── front/            # React Router frontend
│   └── jobs/             # Background jobs (future)
├── packages/
│   ├── shared/           # Shared utilities, validations, i18n
│   ├── js-client/        # Auto-generated TypeScript API client
│   └── _tsconfig/        # Shared TypeScript configurations
├── scripts/              # Build and deployment scripts
├── justfile              # Development commands
├── turbo.json            # Turborepo configuration
├── .oxlintrc.json        # oxlint config
├── .oxfmtrc.json         # oxfmt config
└── docker-compose.*.yml  # Docker configurations
```

## Prerequisites

Before you begin, ensure you have the following installed:

### Required

- **Node.js** >= 24.x - [Install with a version manager](https://nodejs.org/)
  - [fnm](https://github.com/Schniz/fnm) (cross-platform, recommended)
  - [nvm](https://github.com/nvm-sh/nvm) (macOS/Linux)
  - [nvm-windows](https://github.com/coreybutler/nvm-windows) (Windows)
- **pnpm** - Install after Node.js: `npm install -g pnpm`
- **.NET SDK** >= 9.0 - [Download](https://dotnet.microsoft.com/download)
- **PostgreSQL** 18+ - Install locally or use Docker (see below)
- **Just** - Task runner for this repo (`just --list`)

### Optional

- **Docker** - For containerized development

### Windows Notes

- The repo `justfile` uses PowerShell 7 (`pwsh`) on Windows (not Windows PowerShell 5.1).
- Code quality commands use `oxlint` and `oxfmt` via pnpm scripts, not globally installed binaries.

## Installation

### 1. Clone and Install Dependencies

```bash
# Install all dependencies (Node.js and .NET)
just install

# Or manually:
pnpm install
cd apps/api && dotnet restore
cd ../../packages/shared && pnpm run postinstall
```

### 2. Set Up Database

**Using Docker (Recommended):**

```bash
just dev-db
# Or: docker-compose -f docker-compose.services.yml up -d
```

**Using Local PostgreSQL:**

- Install PostgreSQL 18+
- Update `.env.development` with your connection string

### 3. Run Database Migrations

```bash
just db-migrate
# Or: cd apps/api && dotnet ef database update
```

### 4. Environment Variables

The project uses `.env.development` for local development. Key variables:

```env
# API Configuration
POSTGRES_CONNECTION_STRING=Host=localhost;Port=5454;Database=publyapp_db;
Username=postgres;Password=password;
FRONT_URL=http://localhost:5050

# Frontend Configuration
VITE_ASP_SERVER_URL=http://localhost:5000
VITE_POSTHOG_API_KEY=your_posthog_key
```

For production, copy `.env.development` to `.env.production` and update values
accordingly.

## Development

### Quick Start

### Option 1: Using Just (Recommended)

```bash
# Terminal 1 - Start API
just dev-api

# Terminal 2 - Start Frontend
just dev-front
```

### Option 2: Direct Commands

```bash
# Terminal 1 - API
cd apps/api
dotnet watch run

# Terminal 2 - Frontend
cd apps/front
pnpm dev
```

### Access the Application

Once both servers are running:

- **Frontend**: <http://localhost:5050>
- **API**: <http://localhost:5000>
- **API Documentation**: <http://localhost:5000/scalar/v1>

### Debugging

**API Debugging:**

```bash
# Start API
just dev-api
```

Then attach your debugger to the running `dotnet` process (VS Code / Rider).

**Frontend Debugging:**
Use Chrome DevTools and React DevTools browser extension.

## Available Commands

The project’s task runner is `just`. Run `just --list` for the full list.

### Development Commands

```bash
just dev-api          # Start API development server
just dev-front        # Start frontend development server
just dev-db           # Start PostgreSQL with Docker
```

### Building

```bash
just build-api        # Build .NET API
just build-front      # Build React frontend
just build-deploy     # Build for deployment
```

### Code Quality

```bash
just lint             # Run oxlint
just lint-write       # Fix linting issues
just format           # Check code formatting
just format-write     # Fix formatting issues
just check            # Run all checks (lint + format)
just check-write      # Fix all issues
just knip             # Check for unused dependencies
just tsc-front        # TypeScript type checking
```

### Database Operations

```bash
just db-migrate       # Run migrations
just db-reset         # Drop and recreate database
just db-add CreateUsers  # Add new migration
just db-remove        # Remove last migration
```

### API Client Generation

```bash
just generate-client  # Generate TypeScript client from OpenAPI
just update-client    # Update existing client
just client-info      # Show client information
```

### Docker

```bash
just docker-build     # Build Docker images
just docker-up        # Start all services
just docker-down      # Stop all services
```

### Cleaning

```bash
just clean            # Clean all build artifacts
just clean-api        # Clean API artifacts only
just clean-front      # Clean frontend artifacts only
```

## Docker Development

### Using Docker Compose

**Start services (PostgreSQL, etc.):**

```bash
docker-compose -f docker-compose.services.yml up -d
```

## Building for Production

```bash
# Build both API and frontend
just build-deploy

# Or individually:
just build-api        # Outputs to apps/api/bin/Release
just publish-api      # Outputs to apps/api/publish
just build-front      # Outputs to apps/front/build
```

## Key Features

### Auto-Generated API Client

The project uses Microsoft Kiota to auto-generate a type-safe TypeScript client
from the API's OpenAPI specification:

- Automatic generation on API changes
- Full TypeScript type safety
- Located in `packages/js-client`

### Translation System

- Automatic translation key generation from JSON files
- Type-safe translation keys in .NET (`ResponseKeys.g.cs`)
- Shared i18n configuration between frontend and backend

### Monorepo Benefits

- Shared code between frontend and backend
- Consistent tooling and configuration
- Efficient dependency management
- Coordinated versioning

## Contributing

### Code Quality Standards

All code must pass quality checks before committing:

```bash
# Format code
just format-write

# Fix linting issues
just lint-write

# Type check
just tsc-front
```

### Pre-commit Hooks

Husky automatically runs quality checks on commit. Ensure all checks pass:

- oxlint linting and oxfmt formatting
- TypeScript type checking (frontend)
- Staged file validation

### Adding a New Feature

1. Create a feature branch
2. Make your changes
3. Run quality checks: `just check-write`
4. Test locally: `just dev-api` + `just dev-front`
5. Build: `just build-api` + `just build-front`
6. Commit and push

## Deployment

### Current Setup

- **Platform**: Dokploy on Hostinger VPS
- **Configuration**: `dokploy.yml`
- **Process**: Automated deployment from git repository
- **Alternative**: Local build → upload artifacts pipeline (see `docs/misc/deployment-guide.md`)

### Future Hosting Options

We may consider these alternatives:

- [Netcup VPS](https://www.netcup.com/en/server/vps)
- Google Cloud Run
- Azure Container Apps

## Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# View logs
docker logs publyapp-postgres
```

### Port Already in Use

- API (5000): Check for other .NET processes
- Frontend (5050): Check for other Node processes
- PostgreSQL (5454): Check for other PostgreSQL instances

### Build Errors

```bash
# Clean and reinstall
just clean
just install

# Clear .NET cache
cd apps/api
dotnet clean
dotnet restore --force
```

## Additional Resources

- **Just Recipes**: Run `just --list` for complete command reference
- **API Documentation**: Available at <http://localhost:5000/scalar/v1> when
  running
- **Turborepo Docs**: <https://turbo.build/repo/docs>
- **React Router v7**: <https://reactrouter.com/>

## License

[Add your license here]

## Support

[Add support information or contact details here]
