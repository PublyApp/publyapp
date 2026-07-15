using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Uploads.Permissions;

public class UploadPermissionsForStaff : ISlicePermissions {
	public string KeyPrefix { get; } = "uploads";

	public Permission CREATE { get; }

	public UploadPermissionsForStaff() {
		CREATE = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "create" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Upload file", Description = "Upload an image file and receive a served URL" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Téléverser un fichier", Description = "Téléverser une image et obtenir une URL" });
	}
}
