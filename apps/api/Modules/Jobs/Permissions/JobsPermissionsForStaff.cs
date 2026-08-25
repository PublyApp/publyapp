using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Jobs.Permissions;

public class JobsPermissionsForStaff : ISlicePermissions {
	public string KeyPrefix { get; } = "jobs";

	public Permission RESOLVE { get; }

	public JobsPermissionsForStaff() {
		RESOLVE = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "resolve" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation {
				Name = "Resolve dead-letter triage",
				Description = "Resolve the external-state triage of a dead-lettered job"
			})
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation {
				Name = "Resoudre le triage des jobs echoues",
				Description = "Resoudre le triage d'etat externe d'un job arrive en dead-letter"
			});
	}
}
