using FluentValidation;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Infrastructure.Messaging.Email;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Modules.Shared.Auth;
using MainApi.Src.Modules.Shared.Invitations;
using MainApi.Src.Modules.Shared.Permissions;
using MainApi.Src.Modules.Shared.Profiles;
using MainApi.Src.Modules.Shared.Tenants;
using MainApi.Src.Modules.Shared.Users;
using MainApi.Src.Modules.Staff.AuditLogs;
using MainApi.Src.Modules.Staff.Impersonations;
using MainApi.Src.Modules.Staff.PermissionsAsStaff;
using MainApi.Src.Modules.Staff.ProfilesAsStaff;
using MainApi.Src.Modules.Staff.StaffMember;
using MainApi.Src.Modules.Staff.TenantsAsStaff;
using MainApi.Src.Modules.Tenant.Products;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.OpenApi;

using Resend;

namespace MainApi.Src.Lib;

public static class AppServices {
	// Helper method to get current tenant ID
	// (you'll need to implement this based on your authentication/authorization)
	private static Guid? GetCurrentTenantId(IHttpContextAccessor httpContextAccessor, AppSettings appSettings) {
		var httpContext = httpContextAccessor.HttpContext;
		if (httpContext is null) {
			return null;
		}

		var tenantIdHeader = httpContext.Request.Headers[appSettings.TENANT_ID_HEADER_KEY].FirstOrDefault();
		if (string.IsNullOrEmpty(tenantIdHeader)) {
			return null;
		}

		return Guid.TryParse(tenantIdHeader, out var tenantId) ? tenantId : null;
	}

	public static IHostApplicationBuilder AddAppServices(this WebApplicationBuilder builder) {
		// Add HealthChecks
		builder.Services.AddHealthChecks();

		// Add Response Compression
		builder.Services.AddResponseCompressionServices();

		// Configure strongly-typed settings
		builder.Services.AddOptions<AppSettings>()
			.Bind(builder.Configuration.GetSection("AppSettings"))
			.ValidateDataAnnotations()
			.ValidateOnStart(); // This will validate at startup

		// Add EndpointsApiExplorer and OpenApi
		builder.Services.AddEndpointsApiExplorer();
		builder.Services.AddOpenApi(options => {
			// Fix for .NET 10 OpenAPI generation producing ["integer", "string"] union types
			// instead of just "integer" for int properties. This causes Kiota to generate
			// UntypedNode types instead of proper number types in TypeScript.
			options.AddSchemaTransformer((schema, context, cancellationToken) => {
				if (schema.Type.HasValue) {
					var schemaType = schema.Type.Value;

					// Check if type is a union (has multiple flags set) containing Integer and String
					if (schemaType.HasFlag(JsonSchemaType.Integer) && schemaType.HasFlag(JsonSchemaType.String)) {
						// Keep only Integer, remove String
						schema.Type = JsonSchemaType.Integer;
					}
					// Check if type is a union containing Number and String
					else if (schemaType.HasFlag(JsonSchemaType.Number) && schemaType.HasFlag(JsonSchemaType.String)) {
						// Keep only Number, remove String
						schema.Type = JsonSchemaType.Number;
					}
				}
				return Task.CompletedTask;
			});
		});

		// Add HttpContextAccessor for accessing HTTP context in services
		builder.Services.AddHttpContextAccessor();

		// Register scoped DbContext (for per-request instances)
		// EF Core DbContext is not thread-safe and must be scoped, not singleton
		builder.Services.AddDbContext<MainApiDbContext>((serviceProvider, options) => {
			var httpContextAccessor = serviceProvider.GetRequiredService<IHttpContextAccessor>();
			var appSettings = serviceProvider.GetRequiredService<IOptions<AppSettings>>().Value;
			var tenantId = GetCurrentTenantId(httpContextAccessor, appSettings);

			options.UseNpgsql(AppEnvironment.POSTGRES_CONNECTION_STRING);

			if (tenantId.HasValue) {
				options.UseTenantId(tenantId.Value);
			}
		}, ServiceLifetime.Scoped);

		// Register FluentValidation
		builder.Services.AddValidatorsFromAssemblyContaining<Program>();

		// Register services
		// singleton services
		builder.Services.AddSingleton<IResend>(sp => ResendClient.Create(AppEnvironment.RESEND_API_KEY));
		builder.Services.AddSingleton<IEmailSender, ResendEmailAdapter>();
		builder.Services.AddSingleton<IEmailService, EmailService>();

		// scoped services
		builder.Services.AddScoped<IUserService, UserService>();
		builder.Services.AddScoped<ISessionService, SessionService>();
		builder.Services.AddScoped<ITenantAsStaffService, TenantAsStaffService>();
		builder.Services.AddScoped<IProductService, ProductService>();
		builder.Services.AddScoped<ITenantService, TenantService>();
		builder.Services.AddScoped<IAccountService, AccountService>();
		builder.Services.AddScoped<IProfileService, ProfileService>();
		builder.Services.AddScoped<IInvitationService, InvitationService>();
		builder.Services.AddScoped<IAuditLogService, AuditLogService>();
		builder.Services.AddScoped<IImpersonationService, ImpersonationService>();
		builder.Services.AddScoped<IStaffMemberService, StaffMemberService>();
		builder.Services.AddScoped<IPermissionService, PermissionService>();
		builder.Services.AddScoped<IProfileAsStaffService, ProfileAsStaffService>();
		builder.Services.AddScoped<IPermissionAsStaffService, PermissionAsStaffService>();

		// Register RequestAuthContext (unified auth + tenant context)
		builder.Services.AddScoped<IRequestAuthContext, RequestAuthContext>();

		// Validate services at build time
		builder.Host.UseDefaultServiceProvider(options => {
			options.ValidateScopes = true; // On by default in development
			options.ValidateOnBuild = true; // Opt-in: validate services at build time
		});

		return builder;
	}
}
