using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using MainApi.Src.Data;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Tenants.Entities;

[Table("tenants")]
[Index(nameof(Code), IsUnique = true)]
public class Tenant : BaseAttributes, INoTenantEntity {
	private string _code = string.Empty;

	[Column("code")]
	public required string Code {
		get { return _code; }
		set { _code = value.ToLower(); }
	}

	[Column("name")]
	public required string Name { get; set; }

	[Column("logo_url")]
	public string? LogoUrl { get; set; }

	[Column("status")]
	public TenantStatus Status { get; set; } = TenantStatus.Pending;

	[Column("is_suspended")]
	public bool IsSuspended { get; set; } = false;

	[Column("max_users")]
	public required int MaxUsers { get; set; }

	// navigation properties
	[JsonIgnore]
	public ICollection<UserAccount> UserAccounts { get; set; } = [];
	[JsonIgnore]
	public ICollection<MainApi.Src.Modules.Projects.Entities.Project> Projects { get; set; } = [];

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
		return tenant.Status == TenantStatus.Active && !tenant.IsSuspended;
	}

	public bool Suspend() {
		if (IsSuspended || Status != TenantStatus.Active) {
			return false;
		}
		IsSuspended = true;
		Status = TenantStatus.Suspended;
		return true;
	}

	public bool Reactivate() {
		if (!IsSuspended || Status != TenantStatus.Suspended) {
			return false;
		}
		IsSuspended = false;
		Status = TenantStatus.Active;
		return true;
	}
}

public enum TenantStatus {
	Pending = 10,
	Active = 20,
	Suspended = 30,
}
