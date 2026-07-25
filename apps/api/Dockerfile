FROM mcr.microsoft.com/dotnet/sdk:10.0@sha256:548d93f8a18a1acbe6cc127bc4f47281430d34a9e35c18afa80a8d6741c2adc3 AS build

WORKDIR /src

COPY Directory.Build.props Directory.Build.targets Directory.Packages.props ./
COPY .config ./.config
COPY apps/api ./apps/api
COPY packages/lint-cs ./packages/lint-cs
COPY packages/scripts-cs ./packages/scripts-cs
COPY packages/shared-ts/lib/i18n/json/response-message.en.json ./packages/shared-ts/lib/i18n/json/response-message.en.json
COPY packages/shared-ts/lib/profile-style/tenant-profile-icons.json ./packages/shared-ts/lib/profile-style/tenant-profile-icons.json

RUN dotnet tool restore
RUN cd apps/api \
	&& ASPNETCORE_ENVIRONMENT=Production \
	DOTNET_ENVIRONMENT=Production \
	APP_ROLE=api \
	POSTGRES_CONNECTION_STRING="Host=localhost;Port=5432;Database=publyapp_build;Username=postgres;Password=password;" \
	FRONT_URL="http://localhost:5050" \
	RESEND_API_KEY="build-placeholder" \
	TRUSTED_PROXY_CIDRS="127.0.0.1/32,::1/128" \
	STAFF_OWNER_EMAIL="owner@publyapp.local" \
	STAFF_OWNER_BOOTSTRAP_CODE="build-placeholder" \
	APP_NAME="PublyApp" \
	DEFAULT_EMAIL_SENDER_EMAIL="support@publyapp.local" \
	DEFAULT_EMAIL_SENDER_NAME="PublyApp Support" \
	SESSION_TOKEN_HEADER_KEY="X-Session-Token" \
	TENANT_ID_HEADER_KEY="X-PublyApp-TenantId" \
	SESSION_EXPIRY_DAYS="7" \
	EMAIL_VERIFY_TOKEN_VALIDITY_DURATION="7" \
	PASSWORD_RESET_TOKEN_VALIDITY_DURATION="7" \
	PASSWORD_MIN_LENGTH="12" \
	EMAIL_VERIFY_TOKEN_LENGTH="25" \
	PASSWORD_RESET_TOKEN_LENGTH="25" \
	INVITATION_TOKEN_LENGTH="25" \
	dotnet publish -c Release -o /publish

FROM build AS migrations
WORKDIR /src/apps/api

RUN APP_ROLE=api \
	ASPNETCORE_ENVIRONMENT=Production \
	DOTNET_ENVIRONMENT=Production \
	POSTGRES_CONNECTION_STRING="Host=localhost;Port=5432;Database=publyapp_build;Username=postgres;Password=password;" \
	FRONT_URL="http://localhost:5050" \
	RESEND_API_KEY="build-placeholder" \
	TRUSTED_PROXY_CIDRS="127.0.0.1/32,::1/128" \
	STAFF_OWNER_EMAIL="owner@publyapp.local" \
	STAFF_OWNER_BOOTSTRAP_CODE="build-placeholder" \
	APP_NAME="PublyApp" \
	DEFAULT_EMAIL_SENDER_EMAIL="support@publyapp.local" \
	DEFAULT_EMAIL_SENDER_NAME="PublyApp Support" \
	SESSION_TOKEN_HEADER_KEY="X-Session-Token" \
	TENANT_ID_HEADER_KEY="X-PublyApp-TenantId" \
	SESSION_EXPIRY_DAYS="7" \
	EMAIL_VERIFY_TOKEN_VALIDITY_DURATION="7" \
	PASSWORD_RESET_TOKEN_VALIDITY_DURATION="7" \
	PASSWORD_MIN_LENGTH="12" \
	EMAIL_VERIFY_TOKEN_LENGTH="25" \
	PASSWORD_RESET_TOKEN_LENGTH="25" \
	INVITATION_TOKEN_LENGTH="25" \
	dotnet tool run dotnet-ef migrations bundle --configuration Release --verbose --output /publish/efbundle

FROM mcr.microsoft.com/dotnet/aspnet:10.0@sha256:ddcf70ad1ab963a4fcd41fbd722a6b660e404e87567cfbd46fd2809c21b02088 AS migrate
LABEL org.opencontainers.image.source="https://github.com/radandevist/publyapp"
LABEL org.opencontainers.image.description="PublyApp API migrator"

WORKDIR /app

COPY --from=migrations /publish/efbundle /app/efbundle

ENTRYPOINT ["./efbundle"]

FROM mcr.microsoft.com/dotnet/aspnet:10.0@sha256:ddcf70ad1ab963a4fcd41fbd722a6b660e404e87567cfbd46fd2809c21b02088 AS runtime
LABEL org.opencontainers.image.source="https://github.com/radandevist/publyapp"
LABEL org.opencontainers.image.description="PublyApp API runtime"

WORKDIR /app

RUN set -eu; \
	for attempt in 1 2 3; do \
		if apt-get update \
			&& apt-get install -y --no-install-recommends libgssapi-krb5-2 wget; then \
			rm -rf /var/lib/apt/lists/*; \
			break; \
		fi; \
		rm -rf /var/lib/apt/lists/*; \
		if [ "$attempt" -eq 3 ]; then \
			exit 1; \
		fi; \
		sleep 5; \
	done

COPY --from=build /publish ./

# FILE_STORAGE_ROOT defaults to ".artifacts/storage" (relative to CWD, same
# convention as the Serilog file sink's ".artifacts/logs"). /app is root-owned
# after COPY, so the non-root $APP_UID below cannot create it at runtime —
# pre-create and chown it here. In production, mount a persistent volume at
# this same path (or point FILE_STORAGE_ROOT at the mount) so uploads survive
# container replacement.
RUN mkdir -p .artifacts/storage && chown -R $APP_UID:$APP_UID .artifacts

EXPOSE 5000
ENV ASPNETCORE_URLS=http://+:5000

USER $APP_UID

ENTRYPOINT ["dotnet", "PublyApp.Api.dll"]
