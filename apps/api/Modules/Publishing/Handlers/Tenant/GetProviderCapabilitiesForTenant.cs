using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Modules.Publishing.Providers.Capabilities;
using PublyApp.Api.Modules.Publishing.Services;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

/// <summary>
/// One provider's registry defaults: <c>Enabled</c> is the operator switch, so the
/// connect screen needs no hardcoded provider list.
/// </summary>
public record ProviderCapabilityItem {
	public required string Provider { get; init; }
	public required bool Enabled { get; init; }
	public required PublishTargetLimits Limits { get; init; }
}

public class GetProviderCapabilitiesForTenantResponse {
	public required IReadOnlyList<ProviderCapabilityItem> Items { get; init; }
}

/// <summary>
/// Capability read model (#2184): GET /publishing/capabilities lists what each provider
/// accepts by default (a connected account's own limits stay on publish-targets) and
/// whether the operator lets tenants connect it. Static data: no database access.
/// </summary>
public sealed class GetProviderCapabilitiesForTenant {
	public static Ok<GetProviderCapabilitiesForTenantResponse> Handle(
		[FromServices] IProviderAvailability availability
	) {
		var items = Enum.GetValues<SocialProvider>()
			.Select(provider => new ProviderCapabilityItem {
				Provider = SocialAccountWire.FormatProvider(provider),
				Enabled = availability.IsEnabled(provider),
				Limits = PublishTargetLimits.FromCapability(ProviderCapabilityRegistry.For(provider)),
			})
			.ToList();

		return TypedResults.Ok(new GetProviderCapabilitiesForTenantResponse { Items = items });
	}
}
