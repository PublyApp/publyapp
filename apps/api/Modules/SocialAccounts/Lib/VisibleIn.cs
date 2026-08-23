using PublyApp.Api.Modules.SocialAccounts.Entities;

namespace PublyApp.Api.Modules.SocialAccounts.Lib;

/// <summary>
/// Single visibility rule (Epic C §2): an account is visible in a project iff it is Active
/// and either attached to no project (visible everywhere in the tenant) or attached to that
/// project. Used by the list endpoint, post composer, and publish path in later slices.
/// </summary>
public static class VisibleIn {
	public static bool Visible(SocialAccount account, Guid projectId) {
		if (account.Status != SocialAccountStatus.Active) {
			return false;
		}
		var projects = account.Projects;
		if (projects.Count == 0) {
			return true;
		}
		return projects.Any(link => link.ProjectId == projectId);
	}
}
