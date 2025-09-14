using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;

namespace MainApi.Src.Features.Common.Permission;

[Table("permissions")]
public class Permission : BaseAttributes, INoTenantEntity
{
	[Column("key")]
	public string Key { get; set; } = string.Empty;

	[Column("description")]
	public string Description { get; set; } = string.Empty;

	[Column("scope")]
	public PermissionScope Scope { get; set; }
}

public enum PermissionScope
{
	Staff = 0,
	Tenant = 1,
	Both = 2
}
