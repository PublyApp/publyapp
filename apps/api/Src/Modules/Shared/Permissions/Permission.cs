using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

using MainApi.Src.Data;
using MainApi.Src.Modules.Shared.Profiles;

namespace MainApi.Src.Modules.Shared.Permissions;

[Table("permissions")]
public record Permission : INoTenantEntity {
	[Key]
	[Column("key")]
	public string Key { get; init; } = string.Empty;

	[Column("scope")]
	public PermissionScope Scope { get; init; }

	// Runtime-only property - not mapped to database
	[NotMapped]
	[JsonIgnore]
	public Dictionary<string, PermissionTranslation> Translations { get; init; } = new();

	// Audit properties (from BaseAttributesNoKey)
	// Using 'set' for EF Core audit tracking, while main properties remain immutable
	[Column("created_at")]
	public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

	[Column("updated_at")]
	public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

	[Column("is_deleted")]
	public bool IsDeleted { get; set; } = false;

	[Column("deleted_at")]
	public DateTime? DeletedAt { get; set; }

	private Permission() {
		// Parameterless constructor for EF Core materialization
	}

	private Permission(string key, PermissionScope scope) {
		if (string.IsNullOrEmpty(key)) {
			throw new ArgumentException("Key cannot be empty", nameof(key));
		}

		if (!Enum.IsDefined(scope)) {
			throw new Exception("Invalid scope");
		}

		if (scope == PermissionScope.Tenant && !key.StartsWith(ScopeKeyPrefix.Tenant)) {
			throw new Exception("Tenant permission key must start with " + ScopeKeyPrefix.Tenant);
		} else if (scope == PermissionScope.Staff && !key.StartsWith(ScopeKeyPrefix.Staff)) {
			throw new Exception("Staff permission key must start with " + ScopeKeyPrefix.Staff);
		} else if (scope == PermissionScope.Project && !key.StartsWith(ScopeKeyPrefix.Project)) {
			throw new Exception("Project permission key must start with " + ScopeKeyPrefix.Project);
		}

		Key = key;
		Scope = scope;
	}

	// Navigation properties
	[JsonIgnore]
	public ICollection<ProfilePermission> ProfilePermissions { get; set; } = [];

	public static Permission CreateTenantPermission(
		string key,
		Dictionary<string, PermissionTranslation>? translations = null
	) {
		return new Permission(
			string.Join(KeySeparator, new string[] { ScopeKeyPrefix.Tenant, key.ToLower() }),
			PermissionScope.Tenant
		) {
			Translations = translations ?? new()
		};
	}

	public static Permission CreateStaffPermission(
		string key,
		Dictionary<string, PermissionTranslation>? translations = null
	) {
		return new Permission(
			string.Join(KeySeparator, new string[] { ScopeKeyPrefix.Staff, key.ToLower() }),
			PermissionScope.Staff
		) {
			Translations = translations ?? new()
		};
	}

	public static Permission CreateProjectPermission(
		string key,
		Dictionary<string, PermissionTranslation>? translations = null
	) {
		return new Permission(
			string.Join(KeySeparator, new string[] { ScopeKeyPrefix.Project, key.ToLower() }),
			PermissionScope.Project
		) {
			Translations = translations ?? new()
		};
	}

	public static class ScopeKeyPrefix {
		public static readonly string Staff = "staff";
		public static readonly string Tenant = "tenant";
		public static readonly string Project = "project";
	}

	public static readonly string KeySeparator = ".";

	/// <summary>
	/// Gets the translation for a specific locale, or null if not found.
	/// </summary>
	public PermissionTranslation? GetTranslation(string locale) {
		return Translations.TryGetValue(locale, out var translation) ? translation : null;
	}

	/// <summary>
	/// Sets the translation for a specific locale.
	/// Returns a new record instance with the updated translation.
	/// </summary>
	public Permission SetTranslation(string locale, PermissionTranslation translation) {
		var updatedTranslations = new Dictionary<string, PermissionTranslation>(Translations) {
			[locale] = translation
		};
		return this with {
			Translations = updatedTranslations
		};
	}

	/// <summary>
	/// Gets all translations as a dictionary.
	/// </summary>
	public Dictionary<string, PermissionTranslation> GetAllTranslations() {
		return Translations;
	}

	/// <summary>
	/// Sets all translations at once.
	/// Returns a new record instance with the updated translations.
	/// </summary>
	public Permission SetAllTranslations(Dictionary<string, PermissionTranslation> translations) {
		return this with {
			Translations = translations
		};
	}
}

/// <summary>
/// Represents translated name and description for a permission.
/// </summary>
public record PermissionTranslation {
	[JsonPropertyName("name")]
	public required string Name { get; init; }

	[JsonPropertyName("description")]
	public string? Description { get; init; }
}

public enum PermissionScope {
	Staff = 0,
	Tenant = 1,
	Project = 2
}
