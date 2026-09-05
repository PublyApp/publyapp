
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
using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib.Testing.Fakes;
using PublyApp.Api.Modules.SocialAccounts.Providers.Bluesky;

namespace PublyApp.Api.Lib.Testing.Fixtures;
/// <summary>
/// Custom WebApplicationFactory for integration testing.
/// Replaces DbContext connection string, file storage, and email service.
///
/// NOTE: AppEnvironment.Instance.POSTGRES_CONNECTION_STRING
/// still points to the admin/template DB (process-wide).
/// All DB access MUST go through the DbContext (which is
/// overridden below to use the test-specific connection).
/// Any code that reads POSTGRES_CONNECTION_STRING directly
/// will NOT see the test DB.
/// File storage is also isolated per fixture so upload tests cannot race over
/// blobs created by another test class.
/// </summary>
public sealed class ApiFactory
	: WebApplicationFactory<Program> {
	private readonly string _dbConnectionString;
	private readonly string _storageRoot;
	private readonly IUploadAdmissionService? _uploadAdmissionService;
	private readonly ILoggerProvider? _loggerProvider;

	public ApiFactory(
		string dbConnectionString,
		string storageRoot,
		IUploadAdmissionService? uploadAdmissionService = null,
		ILoggerProvider? loggerProvider = null
	) {
		_dbConnectionString = dbConnectionString;
		_storageRoot = storageRoot;
		_uploadAdmissionService = uploadAdmissionService;
		_loggerProvider = loggerProvider;
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

			services.RemoveAll<IFileStorage>();
			services.AddSingleton<IFileStorage>(
				_ => new LocalDiskFileStorage(_storageRoot)
			);
			if (_uploadAdmissionService is not null) {
				services.RemoveAll<IUploadAdmissionService>();
				services.AddSingleton(_uploadAdmissionService);
			}

			// 2) Replace email sender with fake
			//    (captures emails)
			services.RemoveAll<IEmailSender>();
			services.AddSingleton<FakeEmailSender>();
			services.AddSingleton<IEmailSender>(
				sp => sp
					.GetRequiredService<FakeEmailSender>()
			);

			// 2b) Replace the Bluesky HTTP adapter with the fake — specs never touch
			//     the real network (Epic C §6). Singleton so a fixture-exclusive spec can
			//     program NextResult and read Attempts across its own phases.
			services.RemoveAll<IBlueskyClient>();
			services.AddSingleton<FakeBlueskyClient>();
			services.AddSingleton<IBlueskyClient>(
				sp => sp.GetRequiredService<FakeBlueskyClient>()
			);

			// 3) Register ILogger for handlers that use non-generic ILogger
			//    (needed because Serilog doesn't register ILogger by default)
			services.AddSingleton<ILoggerFactory>(_ => {
				var loggerFactory = new LoggerFactory();
				if (_loggerProvider is not null) {
					loggerFactory.AddProvider(_loggerProvider);
				}

				return loggerFactory;
			});
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

		var descriptorsToRemove = services
			.Where(descriptor => descriptor.ServiceType == typeof(IHostedService))
			.Where(descriptor => {
				var implementationType = ResolveHostedServiceImplementationType(descriptor);

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
	/// to, for registration shapes that are inspectable WITHOUT executing anything (issue #548
	/// review, round 2). <see cref="ServiceDescriptor.ImplementationType"/> and
	/// <see cref="ServiceDescriptor.ImplementationInstance"/> both name their concrete type as
	/// metadata; neither requires constructing anything.
	///
	/// An <see cref="ServiceDescriptor.ImplementationFactory"/> registration is deliberately NOT
	/// resolved here. Its concrete type is only knowable by invoking the delegate, and an
	/// earlier revision of this helper did exactly that — building a throwaway
	/// <see cref="IServiceProvider"/> from the same collection and calling the factory purely to
	/// inspect the produced type. That ran arbitrary application code for every factory-shaped
	/// <see cref="IHostedService"/> descriptor (not just worker candidates): side effects such as
	/// opening connections, starting timers, or mutating statics ran during fixture
	/// construction, a legitimate one-shot factory that rejects a second invocation broke every
	/// <see cref="ApiFixture"/> consumer once the real host invoked it again, and the produced
	/// object was double-disposed against whatever the probe scope/provider separately owned.
	/// Round 2 removes that probe rather than trying to make it safer — there is no safe way to
	/// discover a factory's return type without running it.
	///
	/// A factory-registered worker hosted service is therefore a hole this helper does not
	/// close. It is caught instead by the actual-host guard,
	/// <see cref="Architecture.ApiFactoryHostedServiceGuardSpec.ItShouldNeverResolveALiveInvitationEmailOutboxDispatcherInTheIntegrationHost"/>,
	/// which resolves <see cref="IHostedService"/> from the real, started
	/// <see cref="WebApplicationFactory{TEntryPoint}.Services"/> and fails loudly if a live
	/// dispatcher survives — whatever registration shape let it through.
	/// </summary>
	private static Type? ResolveHostedServiceImplementationType(ServiceDescriptor descriptor) {
		if (descriptor.ImplementationType is not null) {
			return descriptor.ImplementationType;
		}

		if (descriptor.ImplementationInstance is not null) {
			return descriptor.ImplementationInstance.GetType();
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
