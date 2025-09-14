namespace MainApi.Src.Lib;
using MainApi.Src.Data.DbContext;
using Microsoft.EntityFrameworkCore;
using MainApi.Src.Features.Tenant.Product;
using FluentValidation;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Features.Common.Session;
using MainApi.Src.Data.Repository;
using MainApi.Src.Features.Staff.Tenant;
using Microsoft.Extensions.Options;
using MainApi.Src.Features.Common.Email;
using MainApi.Src.Features.Common.Permission;

public static class AppServicesConfig
{
	// Helper method to get current tenant ID
	// (you'll need to implement this based on your authentication/authorization)
	static Guid GetCurrentTenantId(IServiceProvider serviceProvider)
	{
		return Guid.Parse("01234567-89ab-7def-0123-456789abcdef"); // Default tenant ID for development
																															 // var httpContextAccessor = serviceProvider.GetRequiredService<IHttpContextAccessor>();
																															 // var tenantIdHeader = httpContextAccessor.HttpContext?.Request.Headers["X-Tenant-Id"].FirstOrDefault();

		// if (tenantIdHeader == null || !Guid.TryParse(tenantIdHeader, out Guid tenantId))
		// {
		// 	throw new Exception("Valid Tenant ID is required");
		// }

		// return tenantId;
	}

	public static IHostApplicationBuilder AddServices(this IHostApplicationBuilder builder)
	{
		// builder.Services.AddProblemDetails();

		// Configure strongly-typed settings
		builder.Services.AddOptions<AppSettings>()
			.Bind(builder.Configuration.GetSection("AppSettings"))
			.ValidateDataAnnotations()
			.ValidateOnStart(); // This will validate at startup

		builder.Services.AddCors(options =>
		{
			options.AddDefaultPolicy(
					policy =>
					{
						policy
							.WithOrigins(AppEnvironment.FRONT_URL)
							.WithHeaders(
								builder.Services.BuildServiceProvider()
									.GetRequiredService<IOptions<AppSettings>>()
									.Value.SESSION_TOKEN_HEADER_KEY
							);
					});
		});

		// Add services to the container.
		// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
		builder.Services.AddEndpointsApiExplorer();
		builder.Services.AddOpenApi();

		// Add HttpContextAccessor for accessing HTTP context in services
		builder.Services.AddHttpContextAccessor();

		// Register scoped DbContext (for per-request instances)
		builder.Services.AddDbContext<MainApiDbContext>((serviceProvider, options) =>
		{
			var tenantId = GetCurrentTenantId(serviceProvider);
			options
				.UseNpgsql(AppEnvironment.POSTGRES_CONNECTION_STRING)
				.UseTenantId(tenantId);
		}, ServiceLifetime.Scoped);

		// Create a singleton context for operations that don't need tenant filtering
		var dbContextWithoutFilter = new MainApiDbContext(
			new DbContextOptionsBuilder<MainApiDbContext>()
				.UseNpgsql(AppEnvironment.POSTGRES_CONNECTION_STRING)
				.Options
		);

		MainApiDbContext.SetSingleTon(dbContextWithoutFilter);

		// Configure JSON options
		// builder.Services.ConfigureHttpJsonOptions(options =>
		// {
		// 	options.SerializerOptions.PropertyNamingPolicy = null;
		// 	options.SerializerOptions.PropertyNameCaseInsensitive = true;
		// });

		// Register FluentValidation
		builder.Services.AddValidatorsFromAssemblyContaining<Program>();
		// builder.Services.AddValidatorsFromAssemblyContaining<LoginWithEmailAndPasswordDtoValidator>();
		// builder.Services.AddValidatorsFromAssemblyContaining<RegisterWithEmailAndPasswordDtoValidator>();
		// builder.Services.AddValidatorsFromAssemblyContaining<CreateTenantStaffValidator>();

		// Register services
		// singleton services
		builder.Services.AddSingleton<IEmailService, EmailService>();

		// scoped services
		builder.Services.AddScoped<IUserService, UserService>();
		builder.Services.AddScoped<IPasswordService, PasswordService>();
		builder.Services.AddScoped<ISessionService, SessionService>();
		builder.Services.AddScoped<ITenantStaffService, TenantStaffService>();
		builder.Services.AddScoped<IProductService, ProductService>();

		// Register AuthContext
		builder.Services.AddScoped<IAuthContext, AuthContext>();

		// TODO: move tenant informations to the auth context
		// Register TenantContext
		builder.Services.AddScoped<ITenantContext, TenantContext>();

		// Register Repository
		builder.Services.AddScoped(typeof(IRepository<>), typeof(Repository<>));

		// Register PermissionService
		builder.Services.AddScoped<PermissionService>();

		return builder;
	}
}
