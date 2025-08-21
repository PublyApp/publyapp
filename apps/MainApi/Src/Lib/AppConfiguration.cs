namespace MainApi.Src.Lib;
using MainApi.Src.Data.DbContext;
using MongoDB.Driver;
using Microsoft.EntityFrameworkCore;
using MainApi.Src.Features.Tenant.Product;
using FluentValidation;
using MainApi.Src.Features.Common.Auth.Validators;

public static class AppConfiguration
{

// Helper method to get current tenant ID
// (you'll need to implement this based on your authentication/authorization)
static string GetCurrentTenantId(IServiceProvider serviceProvider)
{
	return "123";
	// var httpContextAccessor = serviceProvider.GetRequiredService<IHttpContextAccessor>();
	// var tenantId = httpContextAccessor.HttpContext?.Request.Headers["X-Tenant-Id"].ToString();

	// if (tenantId == null)
	// {
	// 	throw new Exception("Tenant ID is required");
	// }

	// return tenantId;
	// return "";
}

		public static WebApplicationBuilder AddServices(this WebApplicationBuilder builder)
		{
			builder.Services.AddProblemDetails();

			// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

// Add HttpContextAccessor for accessing HTTP context in services
builder.Services.AddHttpContextAccessor();

// Configure MongoDB connection
string mongoUri = AppEnvironment.MONGODB_URI;
string databaseName = AppEnvironment.MONGODB_DATABASE_NAME;

var mongoClient = new MongoClient(mongoUri);
var mongoDatabase = mongoClient.GetDatabase(databaseName);

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

// Register FluentValidation
builder.Services.AddValidatorsFromAssemblyContaining<LoginWithEmailAndPasswordDtoValidator>();
builder.Services.AddValidatorsFromAssemblyContaining<RegisterWithEmailAndPasswordDtoValidator>();

// Register services
builder.Services.AddScoped<IProductService, ProductService>();

return builder;
		}
}
