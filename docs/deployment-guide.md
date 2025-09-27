# PDF Vite App - Complete Deployment Guide

This guide covers the complete deployment process for PDF Vite App using local Docker builds, GitHub Container Registry, and Dokploy.

## 🎯 Overview

PDF Vite App consists of two main services:
- **API**: .NET 9 backend with PostgreSQL database
- **Frontend**: React Router SSR application with Express server

## 🚀 Deployment Strategy

Our deployment process follows this workflow:
1. **Build Docker images locally** using our Node.js script
2. **Push images to GitHub Container Registry**
3. **Deploy in Dokploy** using the registry images

## 📋 Prerequisites

- Docker installed on your local machine
- GitHub Personal Access Token with `write:packages` permission
- Dokploy installed on your VPS
- Managed PostgreSQL database (external)
- Domain names configured for your application

## 🔧 Setup

### 1. GitHub Container Registry Authentication

First, authenticate with GitHub Container Registry:

```bash
# Login to GitHub Container Registry
docker login ghcr.io -u YOUR_GITHUB_USERNAME -p YOUR_GITHUB_TOKEN
```

**Creating a GitHub Personal Access Token:**
1. Go to [GitHub Settings > Personal Access Tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Give it a name like "Docker Registry Access"
4. Select the `write:packages` scope
5. Copy the token and use it in the login command above

### 2. Environment Variables

Set up the following environment variables:

```bash
# Required for build scripts
export GITHUB_USERNAME="your-github-username"
export REPO_NAME="pdf-vite-app"  # or your actual repo name

# Required for API build
export POSTGRES_CONNECTION_STRING="your-postgres-connection-string"
export FRONT_URL="https://your-frontend-domain.com"
```

**Windows PowerShell:**
```powershell
$env:GITHUB_USERNAME = "your-github-username"
$env:REPO_NAME = "pdf-vite-app"
$env:POSTGRES_CONNECTION_STRING = "your-postgres-connection-string"
$env:FRONT_URL = "https://your-frontend-domain.com"
```

### 3. Environment Files

PDF Vite App uses centralized `.env` files for configuration:

**For Production:**
```bash
# Database
DB_CONNECTION_STRING=Host=your-db-host;Database=pdfvite;Username=your-username;Password=your-password;Port=5432;SSL Mode=Require;

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-here-make-it-long-and-random

# Domains
FRONTEND_DOMAIN=yourdomain.com
API_DOMAIN=api.yourdomain.com
API_URL=https://api.yourdomain.com

# PostHog Analytics (optional)
POSTHOG_API_KEY=your-posthog-api-key
POSTHOG_HOST=https://app.posthog.com
VITE_POSTHOG_API_KEY=your-posthog-api-key
VITE_POSTHOG_HOST=https://app.posthog.com
```

## 🏗️ Building and Pushing Images

### Using the Node.js Script (Recommended)

We provide a single, cross-platform Node.js script that handles everything:

```bash
# Build and push with latest tag
pnpm run docker:push

# Build and push with custom tag
pnpm run docker:push:tag v1.0.0

# Or run directly
node scripts/build-and-push.mjs
node scripts/build-and-push.mjs v1.0.0
```

### What the Script Does

1. **Checks Docker login status** - Ensures you're authenticated with GitHub Container Registry
2. **Validates environment variables** - Checks for required build arguments
3. **Builds API image** - Uses `apps/api/Dockerfile` with build arguments
4. **Builds Frontend image** - Uses `apps/front/Dockerfile`
5. **Pushes both images** - Uploads to `ghcr.io/YOUR_USERNAME/YOUR_REPO/api:latest` and `ghcr.io/YOUR_USERNAME/YOUR_REPO/front:latest`
6. **Shows success message** - Displays image URLs for Dokploy deployment

### Manual Docker Commands (Alternative)

If you prefer manual control:

```bash
# Build API image
docker build \
  -f apps/api/Dockerfile \
  --build-arg POSTGRES_CONNECTION_STRING="${POSTGRES_CONNECTION_STRING}" \
  --build-arg FRONT_URL="${FRONT_URL}" \
  -t ghcr.io/YOUR_USERNAME/YOUR_REPO/api:latest \
  .

# Build Frontend image
docker build \
  -f apps/front/Dockerfile \
  -t ghcr.io/YOUR_USERNAME/YOUR_REPO/front:latest \
  .

# Push images
docker push ghcr.io/YOUR_USERNAME/YOUR_REPO/api:latest
docker push ghcr.io/YOUR_USERNAME/YOUR_REPO/front:latest
```

## 🚀 Deploying with Dokploy

### Method 1: Using Docker Compose in Dokploy (Recommended)

1. **Create a new project** in Dokploy
2. **Upload the `dokploy.yml`** file
3. **Set environment variables** in Dokploy GUI:
   - Go to your application settings
   - Navigate to "Environment Variables"
   - Add each variable individually:
     - `DB_CONNECTION_STRING`: Your PostgreSQL connection string
     - `JWT_SECRET`: Your JWT secret key
     - `API_URL`: Your API URL (e.g., `https://api.yourdomain.com`)
4. **Deploy** the application

### Method 2: Individual Services in Dokploy

You can also deploy each service individually:

**API Service:**
- Image: `ghcr.io/YOUR_USERNAME/YOUR_REPO/api:latest`
- Port: `5000`
- Environment: Set variables in Dokploy GUI

**Frontend Service:**
- Image: `ghcr.io/YOUR_USERNAME/YOUR_REPO/front:latest`
- Port: `3000`
- Environment: Set variables in Dokploy GUI

### Dokploy Configuration

The `dokploy.yml` file is configured to use your GitHub Container Registry images:

```yaml
services:
  pdfvite-api:
    image: ghcr.io/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME/api:latest
    container_name: pdfvite-api
    restart: unless-stopped
    environment:
      - ASPNETCORE_ENVIRONMENT=Production
      - ASPNETCORE_URLS=http://+:5000
      - ConnectionStrings__DefaultConnection=${DB_CONNECTION_STRING}
      - JWT_SECRET=${JWT_SECRET}
    ports:
      - "5000:5000"
    networks:
      - pdfvite-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  pdfvite-front:
    image: ghcr.io/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME/front:latest
    container_name: pdfvite-front
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3000
      - API_URL=${API_URL}
    ports:
      - "3000:3000"
    networks:
      - pdfvite-network
    depends_on:
      - pdfvite-api
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

networks:
  pdfvite-network:
    driver: bridge
```

## 🔄 Complete Deployment Workflow

Here's the typical workflow for deploying updates:

1. **Make your changes** to the codebase
2. **Test locally** using `pnpm run dev`
3. **Build and push** new images:
   ```bash
   pnpm run docker:push:tag v1.0.1
   ```
4. **Update Dokploy** to use the new tag (if using custom tags)
5. **Deploy** in Dokploy interface

## 🛠️ Development Workflow

### Day-to-Day Development

For normal development, use the standard commands:

```bash
# Full development environment
pnpm run dev

# Individual services
pnpm run dev:api      # API only
pnpm run dev:front    # Frontend only
```

### Niche Scenarios with Docker

For testing the full Dockerized environment locally:

```bash
# Use the development docker-compose file
docker-compose -f docker-compose.dev.yml up -d --build

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop
docker-compose -f docker-compose.dev.yml down
```

This is useful for:
- Testing the full Dockerized environment
- Reproducing production-like behavior locally
- Testing with different environment configurations
- Debugging Docker-specific issues

## 🏗️ Project Structure

```
pdf-vite-app/
├── apps/
│   ├── api/
│   │   └── Dockerfile          # API Docker image
│   └── front/
│       └── Dockerfile          # Frontend Docker image
├── scripts/
│   └── build-and-push.mjs      # Cross-platform build script
├── docker-compose.dev.yml      # Development Docker setup
├── dokploy.yml                 # Dokploy deployment config
├── .env.production             # Production environment variables
└── package.json                # Contains docker:push scripts
```

## 🔍 Service Architecture

```
Internet → Dokploy/Traefik → Frontend (React SSR) → API (.NET)
                                    ↓
                              External PostgreSQL DB
```

### Service Details

- **Frontend**: React Router SSR app running on port 3000
- **API**: .NET 9 Web API running on port 5000
- **Database**: External managed PostgreSQL service
- **Reverse Proxy**: Handled by Dokploy/Traefik

## 🩺 Health Checks

Both services include health checks:
- **API**: Checks `/health` endpoint
- **Frontend**: Checks if the server responds on port 3000

## 📊 Monitoring and Troubleshooting

### View Logs in Dokploy

- Use Dokploy's built-in log viewer
- Check both API and Frontend service logs
- Monitor health check status

### Common Issues

1. **Authentication Issues**
   ```bash
   # Re-authenticate with GitHub Container Registry
   docker logout ghcr.io
   docker login ghcr.io -u YOUR_USERNAME -p YOUR_TOKEN
   ```

2. **Build Failures**
   - Check that all environment variables are set
   - Ensure Docker has enough resources allocated
   - Check Docker logs for specific error messages

3. **Push Failures**
   - Verify your GitHub token has `write:packages` permission
   - Check that the repository name matches your GitHub repository
   - Ensure you're logged in to the correct registry

4. **Deployment Issues**
   - Verify the image tags exist in GitHub Container Registry
   - Check that all required environment variables are set in Dokploy
   - Review container logs in Dokploy for specific errors

### Useful Commands

```bash
# Check local images
docker images | grep ghcr.io

# Remove old local images
docker image prune -f

# Check GitHub Container Registry (requires GitHub CLI)
gh api /user/packages/container/YOUR_REPO_NAME/versions
```

## 🔒 Security Considerations

1. **Environment Variables**: Never commit `.env` files to version control
2. **JWT Secret**: Use a strong, random JWT secret
3. **Database**: Use managed database services with proper security
4. **SSL**: Always use HTTPS in production
5. **GitHub Token**: Regularly rotate your GitHub Personal Access Tokens
6. **Container Registry**: Consider using GitHub's fine-grained personal access tokens

## 🚀 Performance Optimization

1. **Caching**: Configure appropriate cache headers in your application
2. **CDN**: Consider using a CDN for static assets
3. **Database**: Optimize your database queries and use connection pooling
4. **Monitoring**: Set up monitoring and alerting for your services
5. **Image Optimization**: Use multi-stage builds and Alpine Linux base images

## 📦 Image Management

### Viewing Images

```bash
# List local images
docker images | grep ghcr.io

# List remote images (requires GitHub CLI)
gh api /user/packages/container/YOUR_REPO_NAME/versions
```

### Cleaning Up

```bash
# Remove old local images
docker image prune -f

# Remove specific images
docker rmi ghcr.io/YOUR_USERNAME/YOUR_REPO/api:old-tag
```

## 🔄 Updates and Maintenance

1. **Application Updates**:
   - Make changes to your code
   - Run `pnpm run docker:push:tag v1.0.1`
   - Update Dokploy to use the new tag

2. **Dependency Updates**:
   - Update dependencies in your project
   - Rebuild and push new images
   - Deploy updated images in Dokploy

3. **Security Updates**:
   - Keep your VPS and Docker images updated
   - Regularly update base images in Dockerfiles
   - Monitor for security vulnerabilities

## 📋 Summary

This deployment strategy provides:

- ✅ **Local control** - Build images on your machine
- ✅ **Cross-platform** - Single Node.js script works everywhere
- ✅ **Simple workflow** - Just `pnpm run docker:push` and deploy
- ✅ **Clean separation** - Separate images for API and Frontend
- ✅ **Easy deployment** - Dokploy handles the rest
- ✅ **Environment management** - Centralized `.env` files
- ✅ **Development flexibility** - Normal dev commands + Docker for special cases

Your deployment process is now streamlined and follows Docker best practices! 🎉
