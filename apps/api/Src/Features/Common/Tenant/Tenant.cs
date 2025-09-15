using MainApi.Src.Data;
using MainApi.Src.Features.Common.Account;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations.Schema;

namespace MainApi.Src.Features.Common.Tenant;

[Table("tenants")]
[Index(nameof(Code), IsUnique = true)]
public class Tenant : BaseAttributes, INoTenantEntity {
	private string _code = string.Empty;

	[Column("code")]
	public string Code {
		get { return _code; }
		set { _code = value.ToLower(); }
	}

	[Column("name")]
	public string Name { get; set; } = string.Empty;

	// navigation properties
	public ICollection<UserAccount> UserAccounts { get; set; } = [];
}
