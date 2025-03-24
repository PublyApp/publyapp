# Directus App

A custom Directus application built with modern web technologies.

## Overview

This project is a customized implementation of Directus, an open-source headless CMS. It includes enhanced features for multi-tenancy, role-based access control, and custom modules.

## Features

- Multi-tenant architecture
- Role-based access control (RBAC)
- Custom blog management system
- File management with multiple storage providers
- Short URL management
- Customizable user profiles
- API endpoints for authentication and data management

## Tech Stack

- TypeScript
- Parse Server
- React
- Lodash
- Custom API implementations

## Project Structure

```plaintext
packages/
├── shared/           # Shared utilities and types
│   ├── lib/         # Constants and shared libraries
│   ├── types/       # TypeScript type definitions
│   └── utils/       # Utility functions
```

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Git

### Installation

1. Clone the repository:
```bash
git clone [repository-url]
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
- Copy `.env.example` to `.env`
- Update the variables with your configuration

4. Start the development server:
```bash
npm run dev
```

## Configuration

### Environment Variables

- `PARSE_APPLICATION_ID`: Your Parse application ID
- `PARSE_SERVER_URL`: Parse server URL
- Additional environment variables as needed

### Role Configuration

The system includes several predefined roles:
- STAFF_ADMIN
- STAFF_EDITOR
- STAFF_USER
- STAFF_CONTRIBUTOR
- TENANT_USER
- AUTHED_USER

## API Endpoints

### Authentication
- `/api/auth/password-login`
- `/api/auth/password-signup`
- `/api/auth/verify-email`

### File Management
- `/api/upload/single`
- `/api/upload/many`

## Development

### Available Scripts

- `npm run dev`: Start development server
- `npm run build`: Build for production
- `npm run test`: Run tests
- `npm run lint`: Run linting

### Coding Standards

- Follow TypeScript best practices
- Use ESLint for code linting
- Follow the existing project structure

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, please open an issue in the repository or contact the development team.