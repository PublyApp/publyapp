namespace MainApi.Src.Lib.Testing.Fixtures;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Infrastructure.Messaging.Email;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Testing.Fakes;

using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

/// <summary>
/// Custom WebApplicationFactory for integration testing.
/// Replaces DbContext connection string and email service.
///
/// NOTE: AppEnvironment.Instance.POSTGRES_CONNECTION_STRING
/// still points to the admin/template DB (process-wide).
/// All DB access MUST go through the DbContext (which is
/// overridden below to use the test-specific connection).
/// Any code that reads POSTGRES_CONNECTION_STRING directly
/// will NOT see the test DB.
/// </summary>
public sealed class MainApiFactory
	: WebApplicationFactory<Program> {
	private readonly string _dbConnectionString;

	public MainApiFactory(string dbConnectionString) {
		_dbConnectionString = dbConnectionString;
	}

	protected override void ConfigureWebHost(
		IWebHostBuilder builder
	) {
		builder.UseEnvironment("Testing");

		builder.ConfigureServices(services => {
			// 1) Replace DbContext to use test DB
			//    connection string.
			//    Mirrors production registration in
			//    ServiceRegistration.cs but swaps the
			//    connection string.
			services.RemoveAll<
				DbContextOptions<MainApiDbContext>>();
			services.RemoveAll<MainApiDbContext>();

			services.AddDbContext<MainApiDbContext>(
				(serviceProvider, options) => {
					// Tenant scoping — same logic as production
					var httpContextAccessor = serviceProvider
						.GetRequiredService<IHttpContextAccessor>();
					var tenantId =
						GetCurrentTenantId(httpContextAccessor);

					// Use TEST connection string
					// instead of AppEnvironment
					options.UseNpgsql(_dbConnectionString);

					if (tenantId.HasValue) {
						options.UseTenantId(tenantId.Value);
					}
				},
				ServiceLifetime.Scoped
			);

			// 2) Replace email sender with fake
			//    (captures emails)
			services.RemoveAll<IEmailSender>();
			services.AddSingleton<FakeEmailSender>();
			services.AddSingleton<IEmailSender>(
				sp => sp
					.GetRequiredService<FakeEmailSender>()
			);
		});
	}

	/// <summary>
	/// Extracts tenant ID from request header.
	/// Mirrors ServiceRegistration.GetCurrentTenantId().
	/// </summary>
	private static Guid? GetCurrentTenantId(
		IHttpContextAccessor httpContextAccessor
	) {
		var httpContext = httpContextAccessor.HttpContext;
		if (httpContext is null) return null;

		var tenantIdHeader = httpContext.Request.Headers[
			AppEnvironment.Instance.TENANT_ID_HEADER_KEY
		].FirstOrDefault();

		if (string.IsNullOrEmpty(tenantIdHeader)) return null;

		return Guid.TryParse(
			tenantIdHeader, out var tenantId
		)
			? tenantId
			: null;
	}
}
