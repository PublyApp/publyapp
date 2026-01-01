using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using MainApi.Src.Data;
using MainApi.Src.Modules.Shared.Users;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Shared.Tenants;

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
	public TenantStatus Status { get; set; } = TenantStatus.Archived;

	[Column("is_suspended")]
	public bool IsSuspended { get; set; } = false;

	[Column("max_users")]
	public required int MaxUsers { get; set; }

	// navigation properties
	[JsonIgnore]
	public ICollection<UserAccount> UserAccounts { get; set; } = [];
	[JsonIgnore]
	public ICollection<Projects.Project> Projects { get; set; } = [];

	public static string GetStatusDescription(TenantStatus status) {
		return status switch {
			TenantStatus.Pending => "Pending",
			TenantStatus.Active => "Active",
			TenantStatus.Suspended => "Suspended",
			TenantStatus.Archived => "Archived",
			_ => throw new ArgumentException("Unknown"),
		};
	}

	public static bool IsTenantActive(Tenant tenant) {
		return tenant.Status == TenantStatus.Active && !tenant.IsSuspended;
	}
}

public enum TenantStatus {
	Pending = 10,
	Active = 20,
	Suspended = 30,
	Archived = 40,
}
