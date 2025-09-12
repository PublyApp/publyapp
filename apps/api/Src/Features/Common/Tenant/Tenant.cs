using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;

namespace MainApi.Src.Features.Common.Tenant;

public class Tenant : BaseAttributes, INoTenantEntity
{
	[Column("name")]
	public string? Name { get; set; }

	public static readonly string TableName = "tenants";
}
