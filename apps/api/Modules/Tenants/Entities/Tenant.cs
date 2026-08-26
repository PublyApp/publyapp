using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Tenants.Entities;

[Table("tenants")]
[Index(nameof(Code), IsUnique = true)]
public class Tenant : BaseAttributes, INoTenantEntity {
	private string _code = string.Empty;

	[Column("code")]
	public required string Code {
		get { return _code; }
		set { _code = value.ToLowerInvariant(); }
	}

	[Column("name")]
	public required string Name { get; set; }

	[Column("logo_url")]
	public string? LogoUrl { get; set; }

	[Column("status")]
	// Tenant lifecycle. Soft deletion still uses BaseAttributes.IsDeleted.
	public TenantStatus Status { get; set; } = TenantStatus.Pending;

	[Column("max_users")]
	public required int MaxUsers { get; set; }

	[Column("legal_name")]
	public string? LegalName { get; set; }

	[Column("description")]
	public string? Description { get; set; }

	[Column("website_url")]
	public string? WebsiteUrl { get; set; }

	[Column("billing_email")]
	public string? BillingEmail { get; set; }

	[Column("support_email")]
	public string? SupportEmail { get; set; }

	[Column("default_locale")]
	public string? DefaultLocale { get; set; }

	[Column("timezone")]
	public string? Timezone { get; set; }

	// Staff-internal operator notes. NEVER expose on tenant-scope responses.
	[Column("notes")]
	public string? Notes { get; set; }

	[Column("last_activity_at")]
	public DateTime? LastActivityAt { get; set; }

	// navigation properties
	[JsonIgnore]
	public ICollection<UserAccount> UserAccounts { get; set; } = [];
	[JsonIgnore]
	public ICollection<PublyApp.Api.Modules.Projects.Entities.Project> Projects { get; set; } = [];

	public static string GetStatusDescription(TenantStatus status) {
		return status switch {
			TenantStatus.Pending => nameof(TenantStatus.Pending),
			TenantStatus.Active => nameof(TenantStatus.Active),
			TenantStatus.Suspended => nameof(TenantStatus.Suspended),
			_ => "Unknown",
		};
	}

	public static TenantStatus? ParseStatus(string statusString) {
		if (string.Equals(statusString, nameof(TenantStatus.Pending), StringComparison.OrdinalIgnoreCase)) {
			return TenantStatus.Pending;
		}
		if (string.Equals(statusString, nameof(TenantStatus.Active), StringComparison.OrdinalIgnoreCase)) {
			return TenantStatus.Active;
		}
		if (string.Equals(statusString, nameof(TenantStatus.Suspended), StringComparison.OrdinalIgnoreCase)) {
			return TenantStatus.Suspended;
		}
		return null;
	}

	public static bool IsTenantActive(Tenant tenant) {
		return tenant.IsActive();
	}

	public bool IsPending() {
		return IsPending(Status);
	}

	public bool IsActive() {
		return IsActive(Status);
	}

	public bool IsSuspended() {
		return IsSuspended(Status);
	}

	public static bool IsPending(TenantStatus status) {
		return status == TenantStatus.Pending;
	}

	public static bool IsActive(TenantStatus status) {
		return status == TenantStatus.Active;
	}

	public static bool IsSuspended(TenantStatus status) {
		return status == TenantStatus.Suspended;
	}

	public bool Suspend() {
		if (IsSuspended() || !IsActive()) {
			return false;
		}
		Status = TenantStatus.Suspended;
		return true;
	}

	public bool Reactivate() {
		if (!IsSuspended()) {
			return false;
		}
		Status = TenantStatus.Active;
		return true;
	}
}

[JsonConverter(typeof(JsonStringEnumConverter<TenantStatus>))]
public enum TenantStatus {
	Pending = 10,
	Active = 20,
	Suspended = 30,
}
