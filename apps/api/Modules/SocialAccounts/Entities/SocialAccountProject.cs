using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using PublyApp.Api.Data;

namespace PublyApp.Api.Modules.SocialAccounts.Entities;

/// <summary>
/// Pure junction: links a social account to the projects it may post in.
/// Empty set = visible everywhere in the tenant; non-empty = visible only there
/// (Epic C §2). Composite PK of the two FKs; unassignment hard-deletes the row.
/// </summary>
[Table("social_account_projects")]
public class SocialAccountProject : INoTenantEntity {
	[Column("social_account_id")]
	public Guid SocialAccountId { get; set; }

	private SocialAccount? _socialAccount;
	[JsonIgnore]
	public SocialAccount SocialAccount {
		get { return RequiredNavigation.Get(_socialAccount, nameof(SocialAccountProject), nameof(SocialAccount)); }
		set { _socialAccount = value; }
	}

	[Column("project_id")]
	public Guid ProjectId { get; set; }

	private PublyApp.Api.Modules.Projects.Entities.Project? _project;
	[JsonIgnore]
	public PublyApp.Api.Modules.Projects.Entities.Project Project {
		get { return RequiredNavigation.Get(_project, nameof(SocialAccountProject), nameof(Project)); }
		set { _project = value; }
	}

	[Column("created_at")]
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

	[Column("updated_at")]
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
