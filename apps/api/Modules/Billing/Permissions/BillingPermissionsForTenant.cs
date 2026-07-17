using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Billing.Permissions;

public class BillingPermissionsForTenant : ISlicePermissions {
	public string KeyPrefix { get; } = "billing";

	public Permission VIEW { get; }
	public Permission MANAGE { get; }

	public BillingPermissionsForTenant() {
		VIEW = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "view" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "View billing",
					Description = "View billing and invoices"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Voir la facturation",
					Description = "Consulter la facturation et les factures"
				}
			);

		MANAGE = Permission
			.CreateTenantPermission(
				string.Join(Permission.KeySeparator, new[] { KeyPrefix, "manage" })
			)
			.SetTranslation(
				SupportedLanguage.English,
				new PermissionTranslation {
					Name = "Manage billing",
					Description = "Manage the subscription and payment methods"
				}
			)
			.SetTranslation(
				SupportedLanguage.French,
				new PermissionTranslation {
					Name = "Gérer la facturation",
					Description = "Gérer l'abonnement et les moyens de paiement"
				}
			);
	}
}
