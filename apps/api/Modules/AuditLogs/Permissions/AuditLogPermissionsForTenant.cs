using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.AuditLogs.Permissions;

public class AuditLogPermissionsForTenant : ISlicePermissions {
	public string KeyPrefix { get; } = "audit_logs";

	public Permission VIEW { get; }

	public AuditLogPermissionsForTenant() {
		VIEW = Permission
			.CreateTenantPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "view" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "View audit logs", Description = "View the audit log history" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Voir les journaux d'audit", Description = "Consulter l'historique des journaux d'audit" });
	}
}
