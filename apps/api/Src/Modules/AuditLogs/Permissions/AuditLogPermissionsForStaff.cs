using MainApi.Src.Lib;
using MainApi.Src.Modules.Permissions.Entities;

namespace MainApi.Src.Modules.AuditLogs.Permissions;

public class AuditLogPermissionsForStaff : ISlicePermissions {
	public string KeyPrefix { get; } = "audit_logs";

	public Permission LIST { get; }
	public Permission GET { get; }
	public Permission EXPORT { get; }

	public AuditLogPermissionsForStaff() {
		LIST = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "list" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "List audit logs", Description = "View list of all audit logs" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Lister les journaux d'audit", Description = "Voir la liste de tous les journaux d'audit" });

		GET = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "get" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Get audit log", Description = "View details of an audit log entry" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Voir un journal d'audit", Description = "Voir les details d'une entree du journal d'audit" });

		EXPORT = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "export" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Export audit logs", Description = "Export audit logs as CSV or JSON" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Exporter les journaux d'audit", Description = "Exporter les journaux d'audit en CSV ou JSON" });
	}
}
