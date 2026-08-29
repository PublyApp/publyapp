using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Jobs.Permissions;

public class JobsPermissionsForStaff : ISlicePermissions {
	public string KeyPrefix { get; } = "jobs";

	public Permission RESOLVE { get; }

	// A5 (#636): per-verb permissions for the staff jobs dashboard — no god-mode
	// grant; each key is its own seeder entry and existing staff.jobs.resolve
	// holders are NOT auto-granted any of them.
	public Permission VIEW { get; }
	public Permission REQUEUE { get; }
	public Permission SYSTEM_JOB_UPDATE { get; }
	public Permission SYSTEM_JOB_TRIGGER { get; }

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

		VIEW = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "view" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation {
				Name = "View jobs dashboard",
				Description = "List job queue runs, dead-letter rows, and system job definitions"
			})
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation {
				Name = "Voir le tableau de bord des jobs",
				Description = "Lister les executions de la file, les entrees dead-letter, et les jobs systeme"
			});

		REQUEUE = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "requeue" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation {
				Name = "Requeue dead-lettered job",
				Description = "Requeue a dead-lettered job back into job_queue with its original envelope"
			})
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation {
				Name = "Remettre en file un job dead-letter",
				Description = "Remettre en file un job dead-letter avec son enveloppe d'origine"
			});

		SYSTEM_JOB_UPDATE = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "system_job_update" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation {
				Name = "Update system job definition",
				Description = "Enable, disable, or change the cron of a system_job_definition row"
			})
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation {
				Name = "Mettre a jour une definition de job systeme",
				Description = "Activer, desactiver, ou modifier la cron d'une ligne system_job_definition"
			});

		SYSTEM_JOB_TRIGGER = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "system_job_trigger" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation {
				Name = "Trigger a system job now",
				Description = "Enqueue a system_job_definition's handler into job_queue outside its cron"
			})
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation {
				Name = "Declencher un job systeme maintenant",
				Description = "Mettre en file le handler d'une system_job_definition hors de sa cron"
			});
	}
}
