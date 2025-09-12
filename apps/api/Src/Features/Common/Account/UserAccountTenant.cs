namespace MainApi.Src.Features.Common.Account;

using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;

public class UserAccountTenant : BaseAttributes, ITenantEntity
{
	[Column("user_id")]
	public Guid UserId { get; set; }

	[Column("hierarchy_level")]
	public AccountHierarchyLevel HierarchyLevel { get; set; }

	[Column("tenant_id")]
	public Guid TenantId { get; set; }

	public static readonly string TableName = "user_account_tenant";
}
