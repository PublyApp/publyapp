using MainApi.Src.Features.Common.Permission;
using MainApi.Src.Lib;

namespace MainApi.Src.Features.Staff.StaffMember;

public class StaffMemberPermissions : ISlicePermissions {
	public string KeyPrefix { get; } = "staff-members";

	public Permission LIST { get; }
	public Permission GET { get; }
	public Permission CREATE { get; }
	public Permission UPDATE { get; }
	public Permission DELETE { get; }

	public StaffMemberPermissions() {
		LIST = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "list" }));
		LIST = LIST.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "List staff members", Description = "List all staff members" });
		LIST = LIST.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Liste les membres du staff", Description = "Liste tous les membres du staff" });

		GET = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "get" }));
		GET = GET.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "View a staff member", Description = "View a staff member" });
		GET = GET.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Voir un membre du staff", Description = "Voir un membre du staff" });

		CREATE = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "create" }));
		CREATE = CREATE.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Create a staff member", Description = "Create a new staff member" });
		CREATE = CREATE.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Créer un membre du staff", Description = "Créer un nouveau membre du staff" });

		UPDATE = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "update" }));
		UPDATE = UPDATE.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Update a staff member", Description = "Update a staff member" });
		UPDATE = UPDATE.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Mettre à jour un membre du staff", Description = "Mettre à jour un membre du staff" });

		DELETE = Permission.CreateStaffPermission(string.Join(Permission.KeySeparator, new string[] { KeyPrefix, "delete" }));
		DELETE = DELETE.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Delete a staff member", Description = "Delete a staff member" });
		DELETE = DELETE.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Supprimer un membre du staff", Description = "Supprimer un membre du staff" });
	}
}
