using MainApi.Src.Data;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using MainApi.Src.Features.Common.Profile;

namespace MainApi.Src.Features.Common.Permission;

[Table("permissions")]
public class Permission : BaseAttributesNoKey, INoTenantEntity
{
	[Key]
	[Column("key")]
	public string Key { get; set; } = string.Empty;

	Permission(string key, PermissionScope scope)
	{
		if (string.IsNullOrEmpty(key))
		{
			throw new Exception("Key cannot be empty");
		}

		if (scope == PermissionScope.Tenant)
		{
			if (Key.StartsWith("TENANT:"))
			{
				Key = key;
			}
			else
			{
				Key = "TENANT:" + key;
			}
		}
		else if (scope == PermissionScope.Staff)
		{
			if (Key.StartsWith("STAFF:"))
			{
				Key = key;
			}
			else
			{
				Key = "STAFF:" + key;
			}
		}
		else
		{
			throw new Exception("Invalid scope");
		}

		Scope = scope;
	}

	[Column("scope")]
	public PermissionScope Scope { get; set; }

	// Navigation properties
	public ICollection<ProfilePermission> ProfilePermissions { get; set; } = [];

	public static Permission CreateTenantPermission(string key)
	{
		return new Permission(key, PermissionScope.Tenant)
		{ };
	}

	public static Permission CreateStaffPermission(string key)
	{
		return new Permission(key, PermissionScope.Staff)
		{ };
	}
}

public enum PermissionScope
{
	Staff = 0,
	Tenant = 1
}
