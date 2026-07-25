using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Approvals.Permissions;

public class ApprovalPermissionsForTenant : ISlicePermissions {
	public string KeyPrefix { get; } = "approvals";

	public Permission REQUEST { get; }
	public Permission REVIEW { get; }

	public ApprovalPermissionsForTenant() {
		REQUEST = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "request" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Request approval",
					Description = "Submit draft posts to the approval workflow before publishing"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Demander une approbation",
					Description = "Soumettre des brouillons au circuit d'approbation avant diffusion"
				}
			);

		REVIEW = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "review" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Review & approve",
					Description = "Approve or reject posts submitted to the approval workflow"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Examiner et approuver",
					Description = "Approuver ou rejeter les contenus soumis au circuit de validation"
				}
			);
	}
}
