namespace MainApi.Src.Features.Common.Account;

using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations.Schema;

public class UserAccountStaff : BaseAttributes, INoTenantEntity
{
	[Column("user_id")]
	public Guid UserId { get; set; }

	[Column("is_suspended")]
	public bool IsSuspended { get; set; } = false;

	[Column("hierarchy_level")]
	public AccountHierarchyLevel HierarchyLevel { get; set; }

	[Column("profile_ids")]
	public List<Guid> ProfileIds { get; set; } = new();

	public static readonly string TableName = "user_account_staff";
}
