using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;

namespace MainApi.Src.Features.Common.Profile;

[Table("profiles")]
public class Profile : BaseAttributes, ITenantEntity
{
	[Column("tenant_id")]
	public Guid TenantId { get; set; }
	public Tenant.Tenant Tenant { get; set; } = null!;

	[Column("name")]
	public string Name { get; set; } = string.Empty;

	[Column("description")]
	public string? Description { get; set; }

	[Column("profile_type")]
	public ProfileType ProfileType { get; set; }

	// navigation properties
	public ICollection<Account.UserAccountProfile> UserAccountProfiles { get; set; } = [];
	public ICollection<ProfilePermission> ProfilePermissions { get; set; } = [];
}

public enum ProfileType
{
	Staff = 0,
	Tenant = 1
}
