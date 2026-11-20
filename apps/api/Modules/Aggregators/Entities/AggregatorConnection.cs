using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;
using PublyApp.Api.Modules.Aggregators.Ports;

namespace PublyApp.Api.Modules.Aggregators.Entities;

public enum AggregatorConnectionStatus {
	Active = 0,
	Invalid = 1,
}

/// <summary>An organisation's own key for one aggregator. The key is encrypted and never returned.</summary>
[Table("aggregator_connections")]
public class AggregatorConnection : BaseAttributes, ITenantEntity {
	private PublyApp.Api.Modules.Tenants.Entities.Tenant? _Tenant;

	[Column("tenant_id")]
	public required Guid TenantId { get; set; }
	[JsonIgnore]
	public PublyApp.Api.Modules.Tenants.Entities.Tenant Tenant {
		get { return RequiredNavigation.Get(this._Tenant, nameof(AggregatorConnection), nameof(this.Tenant)); }
		set { this._Tenant = value; }
	}

	[Column("aggregator_kind")]
	public required AggregatorKind Kind { get; set; }

	// Data Protection blob, purpose "aggregator-<kind>-v1". Never returned, never logged.
	[Column("protected_api_key")]
	public required string ProtectedApiKey { get; set; }

	// Last 4 characters, plain: the only part of the key the API ever shows.
	[Column("key_hint")]
	public required string KeyHint { get; set; }

	[Column("status")]
	public AggregatorConnectionStatus Status { get; set; } = AggregatorConnectionStatus.Active;

	[Column("last_checked_at")]
	public DateTime? LastCheckedAt { get; set; }

	[Column("last_error")]
	public string? LastError { get; set; }
}
