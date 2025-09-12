namespace MainApi.Src.Features.Common.Profile;

using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;

public class ProfileTenant : BaseAttributes, ITenantEntity
{
	[Column("tenant_id")]
	public Guid TenantId { get; set; }

	[Column("name")]
	public string? Name { get; set; }

	[Column("description")]
	public string? Description { get; set; }

	[Column("permissions")]
	public List<string> Permissions { get; set; } = new();

	public static readonly string TableName = "profile_tenant";
}
