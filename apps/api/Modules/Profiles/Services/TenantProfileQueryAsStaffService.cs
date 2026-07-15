using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Profiles.Entities;

namespace PublyApp.Api.Modules.Profiles.Services;

public class TenantProfileItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
	public string? Description { get; set; }
	public bool IsDefault { get; set; }
	public int UserAccountCount { get; set; }
	public int PermissionsCount { get; set; }
}

public abstract record FindTenantProfilesResult {
	public sealed record Success(CursorPaginatedResult<TenantProfileItem> Data)
		: FindTenantProfilesResult;

	public sealed record CursorNotFound(string Cursor) : FindTenantProfilesResult;

	public sealed record InvalidSortId(string SortId) : FindTenantProfilesResult;
}

public sealed record FindTenantProfilesArgs(
	Guid TenantId,
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	string? Search,
	bool? IsDefault
);

public sealed record GetTenantProfileByIdArgs(
	Guid TenantId,
	Guid ProfileId
);

public abstract record GetTenantProfileByIdResult {
	public sealed record Success(TenantProfileItem Profile)
		: GetTenantProfileByIdResult;

	public sealed record ProfileNotFound : GetTenantProfileByIdResult;
}

public sealed record FindTenantProfilePermissionKeysArgs(
	Guid TenantId,
	Guid ProfileId
);

public abstract record FindTenantProfilePermissionKeysResult {
	public sealed record Success(List<string> PermissionKeys)
		: FindTenantProfilePermissionKeysResult;

	public sealed record ProfileNotFound : FindTenantProfilePermissionKeysResult;
}

public interface ITenantProfileQueryAsStaffService {
	Task<FindTenantProfilesResult> FindTenantProfilesAsync(
		FindTenantProfilesArgs args,
		CancellationToken cancellationToken = default
	);

	Task<GetTenantProfileByIdResult> GetTenantProfileByIdAsync(
		GetTenantProfileByIdArgs args,
		CancellationToken cancellationToken = default
	);

	Task<FindTenantProfilePermissionKeysResult> FindTenantProfilePermissionKeysAsync(
		FindTenantProfilePermissionKeysArgs args,
		CancellationToken cancellationToken = default
	);

	// Count for the tenant detail page: active (non-deleted) tenant-scoped profiles.
	Task<int> CountTenantProfilesAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class TenantProfileQueryAsStaffService : ITenantProfileQueryAsStaffService {
	private readonly AppDbContext _dbContext;

	public TenantProfileQueryAsStaffService(
		AppDbContext dbContext
	) {
		_dbContext = dbContext;
	}

	public async Task<FindTenantProfilesResult> FindTenantProfilesAsync(
		FindTenantProfilesArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit =
			args.Limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? "id";
		var search = args.Search;
		var isAsc = effectiveSortOrder == SortOrder.Asc;

		var sortFieldHandlers = new Dictionary<string, CursorSortFieldHandler<Profile>>(
			StringComparer.OrdinalIgnoreCase
		) {
			// Keep cursor semantics explicit per sort field so each branch stays consistent with
			// the repo's keyset pagination rules and matching composite indexes.
			["id"] = new CursorSortFieldHandler<Profile>(
				getCursorValue: async (guid) => {
					var profileId = await _dbContext.Profile
						.AsNoTracking()
						.Where(p =>
							p.Id == guid
							&& p.Scope == ProfileScope.Tenant
							&& p.TenantId == args.TenantId
							&& !p.IsDeleted
						)
						.Select(p => p.Id)
						.FirstOrDefaultAsync(cancellationToken);
					return profileId;
				},
				applyFilter: (q, cursorValue, isAscLocal) => {
					var cursorGuid = (Guid?)cursorValue;
					if (cursorGuid is null) {
						return q;
					}

					return isAscLocal
						? q.Where(p => p.Id > cursorGuid)
						: q.Where(p => p.Id < cursorGuid);
				},
				applyOrdering: (q, isAscLocal) => isAscLocal
					? q.OrderBy(p => p.Id)
					: q.OrderByDescending(p => p.Id)
			),
			["name"] = new CursorSortFieldHandler<Profile>(
				getCursorValue: async (guid) => {
					var profile = await _dbContext.Profile
						.AsNoTracking()
						.Where(p =>
							p.Id == guid
							&& p.Scope == ProfileScope.Tenant
							&& p.TenantId == args.TenantId
							&& !p.IsDeleted
						)
						.Select(p => new { p.Name, p.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return profile is not null ? (profile.Name, profile.Id) : null;
				},
				applyFilter: (q, cursorValue, isAscLocal) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorName, cursorId) = ((string, Guid?))cursorValue;

					return isAscLocal
						? q.Where(
							p =>
								p.Name.CompareTo(cursorName) > 0
								|| (p.Name == cursorName && p.Id > cursorId)
						)
						: q.Where(
							p =>
								p.Name.CompareTo(cursorName) < 0
								|| (p.Name == cursorName && p.Id < cursorId)
						);
				},
				applyOrdering: (q, isAscLocal) => isAscLocal
					? q.OrderBy(p => p.Name).ThenBy(p => p.Id)
					: q.OrderByDescending(p => p.Name).ThenByDescending(p => p.Id)
			),
			["created_at"] = new CursorSortFieldHandler<Profile>(
				getCursorValue: async (guid) => {
					var profile = await _dbContext.Profile
						.AsNoTracking()
						.Where(p =>
							p.Id == guid
							&& p.Scope == ProfileScope.Tenant
							&& p.TenantId == args.TenantId
							&& !p.IsDeleted
						)
						.Select(p => new { p.CreatedAt, p.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return profile is not null ? (profile.CreatedAt, profile.Id) : null;
				},
				applyFilter: (q, cursorValue, isAscLocal) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorCreatedAt, cursorId) = ((DateTime, Guid?))cursorValue;
					return isAscLocal
						? q.Where(
							p =>
								p.CreatedAt > cursorCreatedAt
								|| (p.CreatedAt == cursorCreatedAt && p.Id > cursorId)
						)
						: q.Where(
							p =>
								p.CreatedAt < cursorCreatedAt
								|| (p.CreatedAt == cursorCreatedAt && p.Id < cursorId)
						);
				},
				applyOrdering: (q, isAscLocal) => isAscLocal
					? q.OrderBy(p => p.CreatedAt).ThenBy(p => p.Id)
					: q.OrderByDescending(p => p.CreatedAt).ThenByDescending(p => p.Id)
			),
		};

		if (!sortFieldHandlers.TryGetValue(effectiveSortId, out var handler)) {
			return new FindTenantProfilesResult.InvalidSortId(effectiveSortId);
		}

		var baseQuery =
			from p in _dbContext.Profile.AsNoTracking()
			where p.Scope == ProfileScope.Tenant
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
				&& p.Id != null
			select p;

		IQueryable<Profile> query = baseQuery;

		if (search is { } q) {
			var pattern = $"%{LikePatternUtils.EscapeLikePattern(q)}%";
			query = query.Where(p =>
				EF.Functions.ILike(p.Name, pattern, LikePatternUtils.LikeEscapeChar)
				|| (p.Description != null && EF.Functions.ILike(p.Description, pattern, LikePatternUtils.LikeEscapeChar))
			);
		}

		if (args.IsDefault is { } isDefault) {
			query = query.Where(p => p.IsDefault == isDefault);
		}

		if (args.Cursor != Guid.Empty) {
			var cursorValue = await handler.GetCursorValue(args.Cursor);
			if (cursorValue is null) {
				return new FindTenantProfilesResult.CursorNotFound(args.Cursor.ToString());
			}

			query = handler.ApplyFilter(query, cursorValue, isAsc);
		}

		var orderedQuery = handler.ApplyOrdering(query, isAsc);

		var profiles = await orderedQuery
			.Take(effectiveLimit + 1)
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (profiles.Count > effectiveLimit) {
			profiles.RemoveAt(profiles.Count - 1);
			nextCursor = profiles.Last().GetRequiredId().ToString();
		}

		var profileIds = profiles.Select(p => p.GetRequiredId()).ToList();

		// The list DTO needs current assignment counts. Because unassignment hard-deletes
		// links, counting rows directly is the active membership count.
		var userAccountCounts = await (
			from uap in _dbContext.UserAccountProfile.AsNoTracking()
			where profileIds.Contains(uap.ProfileId)
			group uap by uap.ProfileId into g
			select new { ProfileId = g.Key, Count = g.Count() }
		).ToListAsync(cancellationToken);

		var userAccountCountByProfileId = new Dictionary<Guid, int>();
		foreach (var row in userAccountCounts) {
			userAccountCountByProfileId[row.ProfileId] = row.Count;
		}

		// Batched grouped-count query mirrors the userAccountCounts pattern above:
		// one query for the page's profile IDs, not a per-row lookup.
		var permissionCounts = await (
			from pp in _dbContext.ProfilePermission.AsNoTracking()
			where profileIds.Contains(pp.ProfileId)
			group pp by pp.ProfileId into g
			select new { ProfileId = g.Key, Count = g.Count() }
		).ToListAsync(cancellationToken);

		var permissionCountByProfileId = new Dictionary<Guid, int>();
		foreach (var row in permissionCounts) {
			permissionCountByProfileId[row.ProfileId] = row.Count;
		}

		var items = profiles.Select(p => {
			var profileId = p.GetRequiredId();
			return new TenantProfileItem {
				Id = profileId,
				Name = p.Name,
				Description = p.Description,
				IsDefault = p.IsDefault,
				UserAccountCount = userAccountCountByProfileId.GetValueOrDefault(profileId, 0),
				PermissionsCount = permissionCountByProfileId.GetValueOrDefault(profileId, 0),
			};
		}).ToList();

		return new FindTenantProfilesResult.Success(
			new CursorPaginatedResult<TenantProfileItem> {
				Data = items,
				NextCursor = nextCursor,
			}
		);
	}

	public async Task<GetTenantProfileByIdResult> GetTenantProfileByIdAsync(
		GetTenantProfileByIdArgs args,
		CancellationToken cancellationToken = default
	) {
		var profile = await (
			from p in _dbContext.Profile
			where p.Id == args.ProfileId
				&& p.Scope == ProfileScope.Tenant
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
			select new TenantProfileItem {
				Id = p.Id ?? Guid.Empty,
				Name = p.Name,
				Description = p.Description,
				IsDefault = p.IsDefault,
				UserAccountCount = p.UserAccountProfiles.Count,
				PermissionsCount = p.ProfilePermissions.Count,
			}
		).FirstOrDefaultAsync(cancellationToken);

		if (profile is null) {
			return new GetTenantProfileByIdResult.ProfileNotFound();
		}

		return new GetTenantProfileByIdResult.Success(profile);
	}

	public async Task<FindTenantProfilePermissionKeysResult>
		FindTenantProfilePermissionKeysAsync(
			FindTenantProfilePermissionKeysArgs args,
			CancellationToken cancellationToken = default
		) {
		var profileExists = await (
			from p in _dbContext.Profile
			where p.Id == args.ProfileId
				&& p.Scope == ProfileScope.Tenant
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
			select p.Id
		).AnyAsync(cancellationToken);

		if (!profileExists) {
			return new FindTenantProfilePermissionKeysResult.ProfileNotFound();
		}

		var permissionKeys = await (
			from pp in _dbContext.ProfilePermission
			join p in _dbContext.Permission on pp.PermissionKey equals p.Key
			where pp.ProfileId == args.ProfileId
				&& !p.IsDeleted
				&& p.Scope == PermissionScope.Tenant
			select pp.PermissionKey
		)
			.OrderBy(k => k)
			.ToListAsync(cancellationToken);

		return new FindTenantProfilePermissionKeysResult.Success(permissionKeys);
	}

	public async Task<int> CountTenantProfilesAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var count =
			from p in _dbContext.Profile
			where p.Scope == ProfileScope.Tenant
				&& p.TenantId == tenantId
				&& !p.IsDeleted
			select p;

		return await count.CountAsync(cancellationToken);
	}

}
