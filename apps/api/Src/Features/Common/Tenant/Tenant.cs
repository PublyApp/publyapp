using MainApi.Src.Data;
using MainApi.Src.Features.Common.Account;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace MainApi.Src.Features.Common.Tenant;

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

	// navigation properties
	[JsonIgnore]
	public ICollection<UserAccount> UserAccounts { get; set; } = [];
	[JsonIgnore]
	public ICollection<Project.Project> Projects { get; set; } = [];
}
