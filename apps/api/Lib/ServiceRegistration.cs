using System.Globalization;
using System.Text;

using FluentValidation;

using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Health;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Modules.Uploads;

using Resend;

namespace PublyApp.Api.Lib;

public static class ServiceRegistration {
	// Helper method to get current tenant ID
	private static Guid? GetCurrentTenantId(IHttpContextAccessor httpContextAccessor) {
		var httpContext = httpContextAccessor.HttpContext;
		if (httpContext is null) {
			return null;
		}

		var tenantIdHeader = httpContext.Request.Headers[AppEnvironment.Instance.TENANT_ID_HEADER_KEY]
			.FirstOrDefault();
		if (string.IsNullOrEmpty(tenantIdHeader)) {
			return null;
		}

		return Guid.TryParse(tenantIdHeader, out var tenantId) ? tenantId : null;
	}

	/// <summary>
	/// Registers Web/API surface services: ProblemDetails, OpenAPI, CORS, compression, etc.
	/// </summary>
	public static WebApplicationBuilder AddWebServices(this WebApplicationBuilder builder) {
		// Enable framework ProblemDetails services (RFC 7807)
		builder.Services.AddProblemDetails(options => {
			options.CustomizeProblemDetails = context => {
				context.ProblemDetails.Instance ??= context.HttpContext.Request.Path.Value;

				if (!context.ProblemDetails.Extensions.ContainsKey("traceId")) {
					context.ProblemDetails.Extensions["traceId"] = context.HttpContext.TraceIdentifier;
				}
			};
		});
		builder.Services.AddAnonymousAuthRateLimiting();

		// Add Response Compression
		builder.Services.AddResponseCompressionServices();

		// Add EndpointsApiExplorer and OpenApi
		builder.Services.AddEndpointsApiExplorer();
		builder.Services.AddOpenApi(options => {
			// Fix for .NET 10 OpenAPI generation producing ["integer", "string"] union types
			options.AddSchemaTransformer((schema, context, cancellationToken) => {
				if (schema.Type.HasValue) {
					var schemaType = schema.Type.Value;

					if (schemaType.HasFlag(JsonSchemaType.Integer)
						&& schemaType.HasFlag(JsonSchemaType.String)) {
						schema.Type = JsonSchemaType.Integer;
					} else if (schemaType.HasFlag(JsonSchemaType.Number)
							&& schemaType.HasFlag(JsonSchemaType.String)) {
						schema.Type = JsonSchemaType.Number;
					}
				}
				return Task.CompletedTask;
			});
			options.AddDocumentTransformer<OpenApiDocumentNormalizer>();
		});

		// CORS configuration
		var env = AppEnvironment.Instance;
		builder.Services.AddCors(options => {
			options.AddDefaultPolicy(policy => {
				policy
					.WithOrigins(env.FRONT_URL)
					.AllowAnyMethod()
					.WithHeaders(
						"Content-Type",
						"Accept",
						env.SESSION_TOKEN_HEADER_KEY,
						env.TENANT_ID_HEADER_KEY
					)
					.WithExposedHeaders(
						env.SESSION_TOKEN_HEADER_KEY,
						"Retry-After"
					)
					.SetPreflightMaxAge(TimeSpan.FromMinutes(10));
			});
		});

		// Caps multipart form bodies (the upload endpoint) at a bound above
		// RequestSizeLimitAttribute's threshold on that endpoint (UPLOAD_MAX_BYTES + 8192).
		// Deliberately set higher, not equal: FormOptions' own limit is enforced by the
		// multipart reader during form binding and throws a 400 InvalidDataException,
		// which would otherwise race Kestrel's IHttpMaxRequestBodySizeFeature check (413)
		// for a body sized right at the shared threshold — RequestSizeLimitAttribute must
		// be the one that trips first so oversize uploads consistently get 413, not 400.
		// This is purely defense-in-depth against non-upload multipart abuse; the
		// endpoint-level RequestSizeLimitAttribute is the authoritative cap here.
		builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(options => {
			options.MultipartBodyLengthLimit =
				AppEnvironment.Instance.UPLOAD_MAX_BYTES + UploadLimits.FormOptionsHeadroomBytes;
		});

		return builder;
	}

	/// <summary>
	/// Registers Infrastructure services: DbContext, external SDK clients, email, etc.
	/// Targets IHostApplicationBuilder (design §3.2, F17) so BOTH host shapes — the
	/// api/all WebApplication and the worker Generic Host — share one infra composition.
	/// </summary>
	public static IHostApplicationBuilder AddInfraServices(this IHostApplicationBuilder builder) {
		// Shared DI prerequisite, deliberately NOT in AddWebServices (F17): the
		// AddDbContext tenant-resolution factory below requires IHttpContextAccessor, and
		// the worker Generic Host never calls AddWebServices. In the worker the accessor
		// simply yields a null HttpContext → tenant id resolves null — correct for
		// background execution.
		builder.Services.AddHttpContextAccessor();

		builder.Services.AddSingleton<IDatabaseMigrationReadiness, DatabaseMigrationReadiness>();
		builder.Services.AddHealthChecks()
			.AddCheck<DatabaseMigrationHealthCheck>(
				"database_migrations",
				failureStatus: Microsoft.Extensions.Diagnostics.HealthChecks.HealthStatus.Unhealthy,
				tags: ["ready"]
			);

		// Register scoped DbContext (for per-request instances)
		builder.Services.AddDbContext<AppDbContext>((serviceProvider, options) => {
			var httpContextAccessor = serviceProvider.GetRequiredService<IHttpContextAccessor>();
			var tenantId = GetCurrentTenantId(httpContextAccessor);

			options.UseNpgsql(AppEnvironment.Instance.POSTGRES_CONNECTION_STRING);

			if (tenantId.HasValue) {
				options.UseTenantId(tenantId.Value);
			}
		}, ServiceLifetime.Scoped);

		// External SDK clients and adapters
		builder.Services.AddSingleton<IResend>((sp) => {
			return ResendClient.Create(AppEnvironment.Instance.RESEND_API_KEY);
		});
		builder.Services.AddSingleton<IEmailSender, ResendEmailAdapter>();
		builder.Services.AddSingleton<IEmailService, EmailService>();
		builder.Services.AddSingleton<IFileStorage>(
			_ => new LocalDiskFileStorage(AppEnvironment.Instance.FILE_STORAGE_ROOT)
		);

		// Durable invitation email outbox — PRODUCER half only (design §3.2, C5/R2-6).
		// The signal is not a hosted service: it is the wake handle the invitation-writing
		// domain services ([Service]-registered, therefore resolved in EVERY role) inject
		// after committing outbox rows, so it stays in shared infra. The CONSUMER half
		// (InvitationEmailOutboxDispatcher, a BackgroundService and therefore a job hosted
		// service) is registered ONLY by JobsServiceRegistration.AddWorkerServices: shared
		// infra runs in the api role too, and registering it here made both deployed
		// containers double-claim invitation_email_outbox (D1 violation).
		builder.Services.AddSingleton<IInvitationEmailOutboxSignal, InvitationEmailOutboxSignal>();

		return builder;
	}

	/// <summary>
	/// Registers Application/business services from PublyApp.Api.Modules.*.Services.
	/// Targets IHostApplicationBuilder (design §3.2, F17): producers and domain services
	/// run in every role, including the worker Generic Host.
	/// </summary>
	public static IHostApplicationBuilder AddAppServices(this IHostApplicationBuilder builder) {
		// Validate [Service] attributed classes up front (fail-fast).
		var discoveredServices = ValidateServiceAttributes();

		// Optional DI manifest logging (gated by config).
		// Important: do not build a temporary ServiceProvider here. We only capture the formatted manifest into DI;
		// the actual log write happens after builder.Build() via Program.cs so the configured logging pipeline is active.
		if (AppEnvironment.Instance.DI_MANIFEST_ENABLED) {
			var manifest = ServiceValidator.FormatManifest(discoveredServices);
			if (manifest is not null) {
				builder.Services.AddSingleton(new DiManifest(manifest));
			}
		}

		// Register FluentValidation (keep unchanged)
		builder.Services.AddValidatorsFromAssemblyContaining<Program>();

		// Register RequestAuthContext (unified auth + tenant context)
		builder.Services.AddScoped<IRequestAuthContext, RequestAuthContext>();

		// Register [Service] attributed classes after the explicit framework/app registrations above.
		// Fail fast if any explicit registration overlaps with a discovered [Service] mapping.
		RegisterDiscoveredServices(builder.Services, discoveredServices);

		// Validate services at build time. ConfigureContainer with the default factory is
		// the IHostApplicationBuilder-portable equivalent of
		// Host.UseDefaultServiceProvider (which only exists on the web builder's
		// ConfigureHostBuilder), so both host shapes validate identically (F17).
		builder.ConfigureContainer(new DefaultServiceProviderFactory(new ServiceProviderOptions {
			ValidateScopes = true,
			ValidateOnBuild = true,
		}));

		return builder;
	}

	/// <summary>
	/// Scans and validates [Service] attributed classes.
	/// Fails fast if any validation rule is violated.
	/// Returns discovered services for registration and optional manifest logging.
	/// </summary>
	internal static List<DiscoveredService> ValidateServiceAttributes() {
		// Scan the PublyApp.Api assembly for [Service] attributed classes
		var discoveredServices = ServiceScanner.ScanAssembly<Program>();

		// Validate all discovered services (fail-fast on any violation)
		ServiceValidator.Validate(discoveredServices);

		return discoveredServices;
	}

	/// <summary>
	/// Registers discovered [Service] attributed classes with the DI container.
	/// Fails fast if any discovered service interface already has an explicit registration.
	/// </summary>
	private static void RegisterDiscoveredServices(
		IServiceCollection services,
		List<DiscoveredService> discoveredServices
	) {
		// Build set of discovered service interfaces
		var discoveredInterfaces = discoveredServices
			.Select(s => s.ServiceInterface)
			.OfType<Type>()
			.ToHashSet();

		// Fail fast if an explicit registration overlaps with a discovered [Service] mapping.
		var conflictingDescriptors = services
			.Where(sd => discoveredInterfaces.Contains(sd.ServiceType))
			.ToList();

		if (conflictingDescriptors.Count > 0) {
			var message = new StringBuilder();
			message.AppendLine("[Service] attribute registration conflict detected:");
			message.AppendLine("The following service interfaces have both explicit registrations and [Service] attributes:");
			message.AppendLine();

			foreach (var group in conflictingDescriptors
				.GroupBy(sd => sd.ServiceType)
				.OrderBy(g => g.Key.FullName)) {
				message.AppendLine(CultureInfo.InvariantCulture, $"  - {group.Key.FullName}");
				foreach (var descriptor in group) {
					message.AppendLine(
						CultureInfo.InvariantCulture,
						$"      explicit: {DescribeServiceDescriptor(descriptor)}"
					);
				}
			}
			message.AppendLine();
			message.AppendLine("Once a service is migrated to [Service], the explicit registration must be removed.");
			throw new InvalidOperationException(message.ToString());
		}

		// Register discovered services deterministically for stable IEnumerable<T> ordering and reproducible diagnostics
		var ordered = discoveredServices
			.Where(s => s.ServiceInterface is not null)
			.OrderBy(s => GetRequiredServiceInterface(s).FullName, StringComparer.Ordinal)
			.ThenBy(s => s.Key ?? string.Empty, StringComparer.Ordinal)
			.ThenBy(s => s.ImplementationType.FullName, StringComparer.Ordinal)
			.ToList();

		foreach (var service in ordered) {
			var serviceInterface = GetRequiredServiceInterface(service);

			if (service.Key is null) {
				services.Add(new ServiceDescriptor(
					serviceInterface,
					service.ImplementationType,
					service.Lifetime
				));
			} else {
				services.Add(new ServiceDescriptor(
					serviceInterface,
					service.Key,
					service.ImplementationType,
					service.Lifetime
				));
			}
		}
	}

	private static Type GetRequiredServiceInterface(DiscoveredService service) {
		if (service.ServiceInterface is null) {
			throw new InvalidOperationException(
				$"Discovered service '{service.ImplementationType.FullName}' has no service interface."
			);
		}

		return service.ServiceInterface;
	}

	private static string DescribeServiceDescriptor(ServiceDescriptor descriptor) {
		var lifetime = descriptor.Lifetime.ToString();

		if (descriptor.IsKeyedService) {
			var key = descriptor.ServiceKey is null ? "(null)" : descriptor.ServiceKey.ToString();

			var impl =
				descriptor.KeyedImplementationType?.FullName
				?? (descriptor.KeyedImplementationFactory is not null ? "(keyed factory)" : "(unknown)");

			return $"lifetime={lifetime}, keyed, key={key}, impl={impl}";
		}

#pragma warning disable IDE0031 // Null check can be simplified
		var implUnkeyed =
			descriptor.ImplementationType?.FullName
			?? (descriptor.ImplementationInstance is not null ? descriptor.ImplementationInstance.GetType().FullName : null)
			?? (descriptor.ImplementationFactory is not null ? "(factory)" : "(unknown)");
#pragma warning restore IDE0031

		return $"lifetime={lifetime}, unkeyed, impl={implUnkeyed}";
	}
}
