using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.SocialAccounts.Entities;

[Table("social_accounts")]
public class SocialAccount : BaseAttributes, ITenantEntity {
	private PublyApp.Api.Modules.Tenants.Entities.Tenant? _tenant;

	[Column("tenant_id")]
	public required Guid TenantId { get; set; }
	[JsonIgnore]
	public PublyApp.Api.Modules.Tenants.Entities.Tenant Tenant {
		get { return RequiredNavigation.Get(_tenant, nameof(SocialAccount), nameof(Tenant)); }
		set { _tenant = value; }
	}

	[Column("provider")]
	public SocialProvider Provider { get; set; } = SocialProvider.Bluesky;

	// Bluesky DID — stable when the handle changes (Epic C §2).
	[Column("external_account_id")]
	public required string ExternalAccountId { get; set; }

	[Column("display_handle")]
	public required string DisplayHandle { get; set; }

	[Column("credential_type")]
	public SocialCredentialType CredentialType { get; set; } = SocialCredentialType.AppPassword;

	// Opaque blob, encrypted with the provider-specific Data Protection purpose.
	// Never returned by any API, never logged (Epic C §4).
	[Column("protected_credentials")]
	public required string ProtectedCredentials { get; set; }

	[Column("status")]
	public SocialAccountStatus Status { get; set; } = SocialAccountStatus.Active;

	[Column("last_success_at")]
	public DateTime? LastSuccessAt { get; set; }

	[Column("last_error")]
	public string? LastError { get; set; }

	// Populated by the service from SocialAccountProject rows; not mapped to a column.
	// VisibleIn (Task 6) reads this to decide per-project visibility.
	[NotMapped]
	public List<SocialAccountProject> Projects { get; set; } = [];

	// Safe before the entity is saved (Id is null pre-insert). Used by the junction
	// constructor in the VisibleIn test without a persisted row.
	internal Guid SafeId() {
		return Id ?? Guid.Empty;
	}
}
