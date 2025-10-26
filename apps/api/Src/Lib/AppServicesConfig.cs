using MainApi.Src.Data.DbContext;
using Microsoft.EntityFrameworkCore;
using MainApi.Src.Features.Tenant.Product;
using FluentValidation;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Features.Common.Session;
using MainApi.Src.Features.Common.Email;
using MainApi.Src.Features.Common.Permission;
using MainApi.Src.Features.Common.Profile;
using MainApi.Src.Features.Common.Tenant;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Features.Staff.StaffMember;
using MainApi.Src.Features.Staff.TenantAsStaff;
using MainApi.Src.Lib.Email;
using Resend;

namespace MainApi.Src.Lib;

public static class AppServicesConfig {
	// Helper method to get current tenant ID
	// (you'll need to implement this based on your authentication/authorization)
	private static Guid GetCurrentTenantId(IServiceProvider serviceProvider) {
		// TODO: implement this
		// Default tenant ID for development
		// var httpContextAccessor = serviceProvider.GetRequiredService<IHttpContextAccessor>();
		// var tenantIdHeader = httpContextAccessor.HttpContext?.Request.Headers["X-Tenant-Id"].FirstOrDefault();
		return Guid.Parse("01234567-89ab-7def-0123-456789abcdef");

		// if (tenantIdHeader == null || !Guid.TryParse(tenantIdHeader, out Guid tenantId))
		// {
		// 	throw new Exception("Valid Tenant ID is required");
		// }

		// return tenantId;
	}

	public static IHostApplicationBuilder AddServices(this WebApplicationBuilder builder) {
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

		// Create a singleton context for operations that don't need tenant filtering
		// var dbContextWithoutFilter = new MainApiDbContext(
		// 	new DbContextOptionsBuilder<MainApiDbContext>()
		// 		.UseNpgsql(AppEnvironment.POSTGRES_CONNECTION_STRING)
		// 		.Options
		// );
		// dbContextWithoutFilter.SingleTon = dbContextWithoutFilter;

		// Register scoped DbContext (for per-request instances)
		builder.Services.AddDbContext<MainApiDbContext>((serviceProvider, options) => {
			var tenantId = GetCurrentTenantId(serviceProvider);
			// TODO: if tenantId is null, use the singleton db context instead of instantiating a new one
			options
				.UseNpgsql(AppEnvironment.POSTGRES_CONNECTION_STRING)
				.UseTenantId(tenantId);
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
		builder.Services.AddScoped<IPasswordService, PasswordService>();
		builder.Services.AddScoped<ISessionService, SessionService>();
		builder.Services.AddScoped<ITenantAsStaffService, TenantAsStaffService>();
		builder.Services.AddScoped<IProductService, ProductService>();
		builder.Services.AddScoped<ITenantService, TenantService>();
		builder.Services.AddScoped<IAccountService, AccountService>();
		builder.Services.AddScoped<IProfileService, ProfileService>();
		builder.Services.AddScoped<IStaffMemberService, StaffMemberService>();
		builder.Services.AddScoped<IPermissionService, PermissionService>();

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
