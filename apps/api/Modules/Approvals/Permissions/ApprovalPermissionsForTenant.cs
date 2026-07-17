using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Approvals.Permissions;

public class ApprovalPermissionsForTenant : ISlicePermissions {
	public string KeyPrefix { get; } = "approvals";

	public Permission REQUEST { get; }
	public Permission REVIEW { get; }

	public ApprovalPermissionsForTenant() {
		REQUEST = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "request" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Request approval", Description = "Submit posts for approval" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Demander une approbation", Description = "Soumettre des publications à l'approbation" });

		REVIEW = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "review" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Review & approve", Description = "Review and approve or reject submitted posts" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Réviser et approuver", Description = "Réviser et approuver ou rejeter les publications soumises" });
	}
}
