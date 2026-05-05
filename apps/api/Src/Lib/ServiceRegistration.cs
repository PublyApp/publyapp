using System.Text;

using FluentValidation;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Infrastructure.Messaging.Email;
using MainApi.Src.Lib.DI;
using MainApi.Src.Lib.Extensions;

using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi;

using Resend;

namespace MainApi.Src.Lib;

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
		});

		// Add HttpContextAccessor for accessing HTTP context in services
		builder.Services.AddHttpContextAccessor();

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
					.WithExposedHeaders(env.SESSION_TOKEN_HEADER_KEY)
					.SetPreflightMaxAge(TimeSpan.FromMinutes(10));
			});
		});

		return builder;
	}

	/// <summary>
	/// Registers Infrastructure services: DbContext, external SDK clients, email, etc.
	/// </summary>
	public static WebApplicationBuilder AddInfraServices(this WebApplicationBuilder builder) {
		// Add HealthChecks (infrastructure checks will be added here over time)
		builder.Services.AddHealthChecks();

		// Register scoped DbContext (for per-request instances)
		builder.Services.AddDbContext<MainApiDbContext>((serviceProvider, options) => {
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

		return builder;
	}

	/// <summary>
	/// Registers Application/business services from MainApi.Src.Modules.*.Services.
	/// </summary>
	public static WebApplicationBuilder AddAppServices(this WebApplicationBuilder builder) {
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

		// Validate services at build time
		builder.Host.UseDefaultServiceProvider(options => {
			options.ValidateScopes = true;
			options.ValidateOnBuild = true;
		});

		return builder;
	}

	/// <summary>
	/// Scans and validates [Service] attributed classes.
	/// Fails fast if any validation rule is violated.
	/// Returns discovered services for registration and optional manifest logging.
	/// </summary>
	internal static List<DiscoveredService> ValidateServiceAttributes() {
		// Scan the Main API assembly for [Service] attributed classes
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
			.Where(s => s.ServiceInterface is not null)
			.Select(s => s.ServiceInterface!)
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
				message.AppendLine($"  - {group.Key.FullName}");
				foreach (var descriptor in group) {
					message.AppendLine($"      explicit: {DescribeServiceDescriptor(descriptor)}");
				}
			}
			message.AppendLine();
			message.AppendLine("Once a service is migrated to [Service], the explicit registration must be removed.");
			throw new InvalidOperationException(message.ToString());
		}

		// Register discovered services deterministically for stable IEnumerable<T> ordering and reproducible diagnostics
		var ordered = discoveredServices
			.Where(s => s.ServiceInterface is not null)
			.OrderBy(s => s.ServiceInterface!.FullName, StringComparer.Ordinal)
			.ThenBy(s => s.Key ?? string.Empty, StringComparer.Ordinal)
			.ThenBy(s => s.ImplementationType.FullName, StringComparer.Ordinal)
			.ToList();

		foreach (var service in ordered) {
			if (service.Key is null) {
				services.Add(new ServiceDescriptor(
					service.ServiceInterface!,
					service.ImplementationType,
					service.Lifetime
				));
			} else {
				services.Add(new ServiceDescriptor(
					service.ServiceInterface!,
					service.Key,
					service.ImplementationType,
					service.Lifetime
				));
			}
		}
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
