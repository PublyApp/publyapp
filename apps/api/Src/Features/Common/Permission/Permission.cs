using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using MainApi.Src.Features.Common.Profile;
using System.Text.Json.Serialization;

namespace MainApi.Src.Features.Common.Permission;

[Table("permissions")]
public class Permission : BaseAttributesNoKey, INoTenantEntity {
	[Key]
	[Column("key")]
	public string Key { get; set; } = string.Empty;

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

	[Column("scope")]
	public PermissionScope Scope { get; set; }

	// Navigation properties
	[JsonIgnore]
	public ICollection<ProfilePermission> ProfilePermissions { get; set; } = [];

	public static Permission CreateTenantPermission(string key) {
		return new Permission(string.Join(KeySeparator, new string[] { ScopeKeyPrefix.Tenant, key.ToLower() }), PermissionScope.Tenant) { };
	}

	public static Permission CreateStaffPermission(string key) {
		return new Permission(string.Join(KeySeparator, new string[] { ScopeKeyPrefix.Staff, key.ToLower() }), PermissionScope.Staff) { };
	}

	public static Permission CreateProjectPermission(string key) {
		return new Permission(string.Join(KeySeparator, new string[] { ScopeKeyPrefix.Project, key.ToLower() }), PermissionScope.Project) { };
	}

	public static class ScopeKeyPrefix {
		public static readonly string Staff = "staff";
		public static readonly string Tenant = "tenant";
		public static readonly string Project = "project";
	}

	public static readonly string KeySeparator = ".";
}

public enum PermissionScope {
	Staff = 0,
	Tenant = 1,
	Project = 2
}
