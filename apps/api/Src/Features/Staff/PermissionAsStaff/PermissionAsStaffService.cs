
using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Permission;
using MainApi.Src.Lib;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Staff.PermissionAsStaff;

public class PermissionAsStaffItem {
	public string Key { get; set; } = string.Empty;
	public string Name { get; set; } = string.Empty;
	public string Description { get; set; } = string.Empty;
}

public interface IPermissionAsStaffService {
	Task<Dictionary<
			string, // slice key prefix
			Dictionary<string, PermissionAsStaffItem> // permission key -> permission item
		>> FindStaffPermissionsAsync(
		string? language = null,
		CancellationToken? cancellationToken = default
	);
}

public class PermissionAsStaffService : IPermissionAsStaffService {
	private readonly MainApiDbContext _dbContext;
	public PermissionAsStaffService(MainApiDbContext dbContext) {
		_dbContext = dbContext;
	}

	public async Task<Dictionary<
			string, // slice key prefix
			Dictionary<string, PermissionAsStaffItem> // permission key -> permission item
		>> FindStaffPermissionsAsync(
		string? language = null,
		CancellationToken? cancellationToken = default
	) {
		var effectiveLanguage = language ?? SupportedLanguage.English;

		var runtimePermissionsMappedBySlice = new Dictionary<
			string, // slice key prefix
			Dictionary<string, Permission> // permission key -> permission item
		>();

		var outputPermissionsMappedBySlice = new Dictionary<
			string, // slice key prefix
			Dictionary<string, PermissionAsStaffItem> // permission key -> permission item
		>();

		// var runtimePermissionsMappedByKey = new Dictionary<string, Permission>();
		var runtimePermissionsKeys = new HashSet<string>();

		// Loop over the properties of staffPermissions and detect
		// if each is assignable to ISlicePermissions
		var staffPermissions = AppPermissions.Staff;

		foreach (var scopeProperty in staffPermissions.GetType().GetProperties()) {
			var scopeValue = scopeProperty.GetValue(staffPermissions);

			if (scopeValue is not ISlicePermissions slicePermissions) {
				continue;
			}

			// Loop over the properties of slicePermissions and detect
			// if each is assignable to Permission
			foreach (var sliceProperty in slicePermissions.GetType().GetProperties()) {
				var sliceValue = sliceProperty.GetValue(slicePermissions);

				if (sliceValue is not Permission permission) {
					continue;
				}

				// Ensure the dictionary entry exists for this slice key prefix
				if (!runtimePermissionsMappedBySlice.TryGetValue(slicePermissions.KeyPrefix, out var sliceDict)) {
					sliceDict = new Dictionary<string, Permission>();
					runtimePermissionsMappedBySlice[slicePermissions.KeyPrefix] = sliceDict;
				}

				sliceDict.Add(permission.Key, permission);
				runtimePermissionsKeys.Add(permission.Key);
			}
		}

		// From allStaffPermissions, I need to check which permissions are present in the database
		if (runtimePermissionsKeys.Count == 0) {
			return outputPermissionsMappedBySlice;
		}

		// Query database to find which permissions exist
		var query =
			from p in _dbContext.Permission
			where runtimePermissionsKeys.Contains(p.Key) && !p.IsDeleted
			select p;

		var dbPermissions = await query.ToListAsync(cancellationToken ?? default);
		var dbPermissionsMappedByKey = dbPermissions.ToDictionary(p => p.Key, p => p);

		foreach (var (sliceKeyPrefix, runtimePermissions) in runtimePermissionsMappedBySlice) {
			// Ensure the dictionary entry exists for this slice key prefix
			if (!outputPermissionsMappedBySlice.TryGetValue(sliceKeyPrefix, out var outputSliceDict)) {
				outputSliceDict = new Dictionary<string, PermissionAsStaffItem>();
				outputPermissionsMappedBySlice[sliceKeyPrefix] = outputSliceDict;
			}

			foreach (var (runtimePermissionKey, runtimePermission) in runtimePermissions) {
				if (!dbPermissionsMappedByKey.TryGetValue(runtimePermissionKey, out var dbPermission)) {
					continue;
				}

				var translation = runtimePermission.GetTranslation(effectiveLanguage);
				outputSliceDict[runtimePermissionKey] = new PermissionAsStaffItem {
					Key = runtimePermissionKey,
					Name = translation?.Name ?? string.Empty,
					Description = translation?.Description ?? string.Empty
				};
			}
		}

		return outputPermissionsMappedBySlice;
	}
}
