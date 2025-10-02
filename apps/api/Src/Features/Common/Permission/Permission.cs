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

	Permission(string key, PermissionScope scope) {
		if (string.IsNullOrEmpty(key)) {
			throw new Exception("Key cannot be empty");
		}

		if (scope == PermissionScope.Tenant) {
			if (Key.StartsWith("TENANT:")) {
				Key = key;
			} else {
				Key = "TENANT:" + key;
			}
		} else if (scope == PermissionScope.Staff) {
			if (Key.StartsWith("STAFF:")) {
				Key = key;
			} else {
				Key = "STAFF:" + key;
			}
		} else if (scope == PermissionScope.Project) {
			if (Key.StartsWith("PROJECT:")) {
				Key = key;
			} else {
				Key = "PROJECT:" + key;
			}
		} else {
			throw new Exception("Invalid scope");
		}

		Scope = scope;
	}

	[Column("scope")]
	public PermissionScope Scope { get; set; }

	// Navigation properties
	[JsonIgnore]
	public ICollection<ProfilePermission> ProfilePermissions { get; set; } = [];

	public static Permission CreateTenantPermission(string key) {
		return new Permission(key, PermissionScope.Tenant) { };
	}

	public static Permission CreateStaffPermission(string key) {
		return new Permission(key, PermissionScope.Staff) { };
	}

	public static Permission CreateProjectPermission(string key) {
		return new Permission(key, PermissionScope.Project) { };
	}
}

public enum PermissionScope {
	Staff = 0,
	Tenant = 1,
	Project = 2
}
