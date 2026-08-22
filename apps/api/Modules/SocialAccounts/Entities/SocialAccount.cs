using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.SocialAccounts.Entities;

/// <summary>
/// A per-tenant connection to an external social platform account (Bluesky first).
/// </summary>
/// <remarks>
/// C1 seam (#640): this packet ships ONLY the entity, its EF configuration/migration,
/// and the token-protection abstraction. No endpoints and no Bluesky client yet — those
/// are C2 (#641). See README.md in this module folder for the seam contract.
/// <para>
/// <see cref="ProtectedCredentials"/> stores the provider's access/refresh tokens
/// ENCRYPTED at rest via <c>ITokenProtector</c> (ASP.NET Data Protection with a persisted
/// key ring). The plaintext never touches the database or logs.
/// </para>
/// </remarks>
[Table("social_accounts")]
public class SocialAccount : BaseAttributes, ITenantEntity {
	[Column("tenant_id")]
	public required Guid TenantId { get; set; }

	[JsonIgnore]
	public PublyApp.Api.Modules.Tenants.Entities.Tenant? Tenant { get; set; }

	[Column("provider")]
	public SocialProvider Provider { get; set; } = SocialProvider.Bluesky;

	[Column("external_account_id")]
	public required string ExternalAccountId { get; set; }

	[Column("display_handle")]
	public string? DisplayHandle { get; set; }

	[Column("protected_credentials")]
	public required string ProtectedCredentials { get; set; }

	[Column("status")]
	public SocialAccountStatus Status { get; set; } = SocialAccountStatus.Active;
}

/// <summary>
/// External social platforms connectable to a tenant. Bluesky first; the list is
/// deliberately extensible (append-only numeric values, never renumber shipped ones).
/// </summary>
public enum SocialProvider {
	Bluesky = 0,
}

/// <summary>
/// Persisted lifecycle of a social-account link. Revoked rows keep their audit trail;
/// reconnection resets the row to Active with fresh protected credentials.
/// </summary>
public enum SocialAccountStatus {
	Active = 0,
	NeedsReconnect = 1,
	Revoked = 2,
}
