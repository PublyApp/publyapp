using MainApi.Src.Data;
using MainApi.Src.Features.Common.Account;
using System.ComponentModel.DataAnnotations.Schema;

namespace MainApi.Src.Features.Common.Tenant;

[Table("tenants")]
public class Tenant : BaseAttributes, INoTenantEntity
{
	[Column("name")]
	public string? Name { get; set; }

	// navigation properties
	public ICollection<UserAccount> UserAccounts { get; set; } = [];
}
