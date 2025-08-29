namespace MainApi.Src.Lib;
using MainApi.Src.Data.DbContext;
using MongoDB.Driver;
using Microsoft.EntityFrameworkCore;
using MainApi.Src.Features.Tenant.Product;
using FluentValidation;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Features.Common.Session;
using MainApi.Src.Data.MongoDb;
using MainApi.Src.Features.Staff.Tenant;

public static class AppServicesConfig
{
	// Helper method to get current tenant ID
	// (you'll need to implement this based on your authentication/authorization)
	static string GetCurrentTenantId(IServiceProvider serviceProvider)
	{
		return "123";
		// var httpContextAccessor = serviceProvider.GetRequiredService<IHttpContextAccessor>();
		// var tenantId = httpContextAccessor.HttpContext?.Request.Headers["X-Tenant-Id"].FirstOrDefault();

		// if (tenantId == null)
		// {
		// 	throw new Exception("Tenant ID is required");
		// }

		// return tenantId;
		// return "";
	}

	public static IHostApplicationBuilder AddServices(this IHostApplicationBuilder builder)
	{
		// builder.Services.AddProblemDetails();

		// Configure strongly-typed settings
		builder.Services.AddOptions<AppSettings>()
			.Bind(builder.Configuration.GetSection("AppSettings"))
			.ValidateDataAnnotations()
			.ValidateOnStart(); // This will validate at startup

		// Add services to the container.
		// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
		builder.Services.AddEndpointsApiExplorer();
		builder.Services.AddOpenApi();

		// Add HttpContextAccessor for accessing HTTP context in services
		builder.Services.AddHttpContextAccessor();

		// Configure MongoDB connection
		var mongoClient = new MongoClient(AppEnvironment.MONGODB_URI);
		var mongoDatabase = mongoClient.GetDatabase(AppEnvironment.MONGODB_DATABASE_NAME);

		var dbContextWithoutFilter = new MainApiDbContext(
			new DbContextOptionsBuilder<MainApiDbContext>()
				.UseMongoDB(mongoDatabase.Client, mongoDatabase.DatabaseNamespace.DatabaseName)
				.Options
			);

		MainApiDbContext.SetSingleTon(dbContextWithoutFilter);

		// Register MongoDB client and database
		builder.Services.AddSingleton<IMongoClient>(mongoClient);
		builder.Services.AddSingleton<IMongoDatabase>(mongoDatabase);

		// Register scoped DbContext (for per-request instances)
		builder.Services.AddDbContext<MainApiDbContext>((serviceProvider, options) =>
		{
			var tenantId = GetCurrentTenantId(serviceProvider);
			options
		.UseMongoDB(mongoDatabase.Client, mongoDatabase.DatabaseNamespace.DatabaseName)
		.UseTenantId(tenantId);
		}, ServiceLifetime.Scoped);

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
		builder.Services.AddScoped<IUserService, UserService>();
		builder.Services.AddScoped<IPasswordService, PasswordService>();
		builder.Services.AddScoped<ISessionService, SessionService>();
		builder.Services.AddScoped<ITenantStaffService, TenantStaffService>();
		builder.Services.AddScoped<IProductService, ProductService>();

		// Register AuthContext
		builder.Services.AddScoped<IAuthContext, AuthContext>();

		// Register TenantContext
		builder.Services.AddScoped<ITenantContext, TenantContext>();

		// Register Collection
		builder.Services.AddScoped(typeof(IAppCollection<>), typeof(AppCollection<>));

		// Register MongoDB index initializer hosted service
		builder.Services.AddHostedService<MongoIndexesInitializer>();

		return builder;
	}
}
