using MainApi.Src.Data.DbContext;
using Microsoft.EntityFrameworkCore;
using MainApi.Src.Modules.Tenant.Product;
using FluentValidation;
using MainApi.Src.Modules.Shared.Users;
using MainApi.Src.Modules.Shared.Auth;
using MainApi.Src.Modules.Shared.Infrastructure.Messaging.Email;
using MainApi.Src.Modules.Shared.Permissions;
using MainApi.Src.Modules.Shared.Profiles;
using MainApi.Src.Modules.Shared.Tenants;
using MainApi.Src.Modules.Shared.Invitation;
using MainApi.Src.Modules.Staff.AuditLogs;
using MainApi.Src.Modules.Staff.Impersonation;
using MainApi.Src.Modules.Staff.StaffMember;
using MainApi.Src.Modules.Staff.TenantAsStaff;
using MainApi.Src.Lib.Email;
using Resend;
using MainApi.Src.Modules.Staff.ProfileAsStaff;
using MainApi.Src.Modules.Staff.PermissionAsStaff;

namespace MainApi.Src.Lib;

public static class AppServices {
	// Helper method to get current tenant ID
	// (you'll need to implement this based on your authentication/authorization)
	private static Guid? GetCurrentTenantId(IHttpContextAccessor httpContextAccessor) {
		var httpContext = httpContextAccessor.HttpContext;
		if (httpContext is null) {
			return null;
		}

		var tenantIdHeader = httpContext.Request.Headers["X-Tenant-Id"].FirstOrDefault();
		if (string.IsNullOrEmpty(tenantIdHeader)) {
			return null;
		}

		return Guid.TryParse(tenantIdHeader, out var tenantId) ? tenantId : null;
	}

	public static IHostApplicationBuilder AddAppServices(this WebApplicationBuilder builder) {
		// Add HealthChecks
		builder.Services.AddHealthChecks();

		// Configure strongly-typed settings
		builder.Services.AddOptions<AppSettings>()
			.Bind(builder.Configuration.GetSection("AppSettings"))
			.ValidateDataAnnotations()
			.ValidateOnStart(); // This will validate at startup

		// Add EndpointsApiExplorer and OpenApi
		builder.Services.AddEndpointsApiExplorer();
		builder.Services.AddOpenApi();

		// Add HttpContextAccessor for accessing HTTP context in services
		builder.Services.AddHttpContextAccessor();

		// Register scoped DbContext (for per-request instances)
		// EF Core DbContext is not thread-safe and must be scoped, not singleton
		builder.Services.AddDbContext<MainApiDbContext>((serviceProvider, options) => {
			var httpContextAccessor = serviceProvider.GetRequiredService<IHttpContextAccessor>();
			var tenantId = GetCurrentTenantId(httpContextAccessor);

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

		// Register AuthContext
		builder.Services.AddScoped<IAuthContext, AuthContext>();

		// TODO: move tenant informations to the auth context
		// Register TenantContext
		builder.Services.AddScoped<ITenantContext, TenantContext>();

		// Validate services at build time
		builder.Host.UseDefaultServiceProvider(options => {
			options.ValidateScopes = true; // On by default in development
			options.ValidateOnBuild = true; // Opt-in: validate services at build time
		});

		return builder;
	}
}
