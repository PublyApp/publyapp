
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib.Testing.Fakes;

namespace PublyApp.Api.Lib.Testing.Fixtures;
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
public sealed class ApiFactory
	: WebApplicationFactory<Program> {
	private readonly string _dbConnectionString;

	public ApiFactory(string dbConnectionString) {
		_dbConnectionString = dbConnectionString;
	}

	protected override void ConfigureWebHost(
		IWebHostBuilder builder
	) {
		builder.UseEnvironment(EnvironmentNames.Testing);

		builder.ConfigureServices(services => {
			// 1) Replace DbContext to use test DB
			//    connection string.
			//    Mirrors production registration in
			//    ServiceRegistration.cs but swaps the
			//    connection string.
			services.RemoveAll<
				DbContextOptions<AppDbContext>>();
			services.RemoveAll<AppDbContext>();

			services.AddDbContext<AppDbContext>(
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

			// 3) Register ILogger for handlers that use non-generic ILogger
			//    (needed because Serilog doesn't register ILogger by default)
			services.AddSingleton<ILoggerFactory>(new LoggerFactory());
			services.AddSingleton(typeof(ILogger<>), typeof(Logger<>));
			services.AddSingleton<ILogger>(sp =>
				sp.GetRequiredService<ILoggerFactory>().CreateLogger("Default"));

			// 4) The default test host composes as `all` (APP_ROLE unset), so the
			//    role-gated worker hosted services are registered. Remove the live
			//    loops from the integration host: the job specs drive the processor
			//    and scheduler-leader deterministically via their public methods, and a
			//    background loop racing the shared test DB — plus the leader binding
			//    AppEnvironment's (non-test) connection — would make specs flaky. Specs
			//    that need these construct them directly against the test connection.
			RemoveWorkerHostedServices(services);
		});
	}

	/// <summary>
	/// Removes the worker-role background hosted services (including queue monitor/listener)
	/// from the integration test host so no live loop races the deterministic job specs.
	/// </summary>
	internal static void RemoveWorkerHostedServices(IServiceCollection services) {
		var workerHostedServiceTypes = new[] {
			typeof(WorkerMigrationStartupGate),
			typeof(JobQueueProcessor),
			typeof(SchedulerLeaderService),
			typeof(JobQueueListener),
			typeof(JobQueueMonitorService),
			typeof(WorkerHeartbeatService),
			typeof(InvitationEmailOutboxDispatcher),
		};

		var hostedServiceDescriptors = services
			.Where(descriptor => descriptor.ServiceType == typeof(IHostedService))
			.ToList();

		var descriptorsToRemove = hostedServiceDescriptors
			.Where(descriptor => {
				var implementationType = ResolveHostedServiceImplementationType(descriptor, services);

				return implementationType is not null
					&& workerHostedServiceTypes.Contains(implementationType);
			})
			.ToList();

		foreach (var descriptor in descriptorsToRemove) {
			services.Remove(descriptor);
		}
	}

	/// <summary>
	/// Identifies the concrete type an <see cref="IHostedService"/> descriptor would resolve
	/// to, whatever registration shape it took (issue #548 review, hole 2: matching on
	/// <see cref="ServiceDescriptor.ImplementationType"/> alone misses a worker service
	/// registered as a singleton instance or through an implementation factory — an
	/// <c>AddSingleton&lt;IHostedService&gt;(sp => ...)</c> shape has
	/// <c>ImplementationType == null</c>, so the removal predicate would silently skip it and
	/// the live service would start).
	///
	/// An <see cref="ServiceDescriptor.ImplementationInstance"/> registration names its type
	/// without resolving anything. A factory registration does not: its concrete type is only
	/// knowable by invoking it, so it is resolved once — from a throwaway
	/// <see cref="IServiceProvider"/> built from the SAME (still being configured) collection,
	/// never the real host's provider — purely to inspect the produced instance's type, then
	/// disposed immediately. This only runs for the (currently zero, in production) case of a
	/// factory-registered <see cref="IHostedService"/>; this is test-only host wiring (
	/// <see cref="ApiFactory"/> never runs in production), so the extra construction is an
	/// acceptable cost for closing the predicate's blind spot rather than leaving it to be
	/// caught only by <see cref="Architecture.ApiFactoryHostedServiceGuardSpec"/>'s resolved-host
	/// assertion.
	/// </summary>
	private static Type? ResolveHostedServiceImplementationType(
		ServiceDescriptor descriptor,
		IServiceCollection services
	) {
		if (descriptor.ImplementationType is not null) {
			return descriptor.ImplementationType;
		}

		if (descriptor.ImplementationInstance is not null) {
			return descriptor.ImplementationInstance.GetType();
		}

		if (descriptor.ImplementationFactory is not null) {
			using var probeProvider = services.BuildServiceProvider();
			using var probeScope = probeProvider.CreateScope();

			var produced = descriptor.ImplementationFactory(probeScope.ServiceProvider);

			if (produced is IAsyncDisposable asyncDisposable) {
				_ = asyncDisposable.DisposeAsync().AsTask();
			} else if (produced is IDisposable disposable) {
				disposable.Dispose();
			}

			return produced?.GetType();
		}

		return null;
	}

	/// <summary>
	/// Extracts tenant ID from request header.
	/// Mirrors ServiceRegistration.GetCurrentTenantId().
	/// </summary>
	private static Guid? GetCurrentTenantId(
		IHttpContextAccessor httpContextAccessor
	) {
		var httpContext = httpContextAccessor.HttpContext;
		if (httpContext is null) {
			return null;
		}

		var tenantIdHeader = httpContext.Request.Headers[
			AppEnvironment.Instance.TENANT_ID_HEADER_KEY
		].FirstOrDefault();

		if (string.IsNullOrEmpty(tenantIdHeader)) {
			return null;
		}

		return Guid.TryParse(
			tenantIdHeader, out var tenantId
		)
			? tenantId
			: null;
	}
}
