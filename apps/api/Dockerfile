# Use the official .NET 9 runtime as base image
FROM mcr.microsoft.com/dotnet/aspnet:9.0-alpine AS base
WORKDIR /app
EXPOSE 5000
EXPOSE 5001

# Use the official .NET 9 SDK for building
FROM mcr.microsoft.com/dotnet/sdk:9.0-alpine AS build
WORKDIR /src

# Copy the entire solution structure to preserve workspace dependencies
COPY . .

# Restore dependencies for the main API project
WORKDIR /src/apps/api
RUN dotnet restore

# Accept build arguments for environment variables (no default values)
ARG POSTGRES_CONNECTION_STRING
ARG FRONT_URL

# Set build-time environment variables for OpenAPI generation
ENV POSTGRES_CONNECTION_STRING=${POSTGRES_CONNECTION_STRING}
ENV FRONT_URL=${FRONT_URL}

# Build the project
RUN dotnet build -c Release --no-restore

# Publish the project
RUN dotnet publish -c Release --no-build -o /app/publish

# Final stage
FROM base AS final
WORKDIR /app

# Copy the published application
COPY --from=build /app/publish .

# Set environment variables for production
ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://+:5000

# Create a non-root user for security
RUN adduser --disabled-password --gecos '' appuser && chown -R appuser /app
USER appuser

ENTRYPOINT ["dotnet", "MainApi.dll"]
