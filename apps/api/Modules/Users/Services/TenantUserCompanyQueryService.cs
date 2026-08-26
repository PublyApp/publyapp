using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

public abstract record FindTenantUserCompaniesResult {
	public sealed record Success(
		CursorPaginatedResult<TenantUserCompanyData> Data
	) : FindTenantUserCompaniesResult;

	public sealed record NotFound() : FindTenantUserCompaniesResult;

	public sealed record CursorNotFound(
		string Cursor
	) : FindTenantUserCompaniesResult;

	public sealed record InvalidSortId(
		string SortId
	) : FindTenantUserCompaniesResult;
}

public record FindTenantUserCompaniesForStaffArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	FindTenantUserCompaniesForStaffFilters? Filters
);

public record FindTenantUserCompaniesForStaffFilters(
	string? Search
);

public class TenantUserCompanyData {
	public required UserAccount Account { get; set; }
	public required Tenant Tenant { get; set; }
	public required AccountLevel AccountLevel { get; set; }
	public required UserStatus UserStatus { get; set; }
}

public interface ITenantUserCompanyQueryService {
	Task<bool> TenantUserExistsForCompanyActionsForStaffAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	);

	Task<FindTenantUserCompaniesResult> FindTenantUserCompaniesForStaffAsync(
		Guid userId,
		FindTenantUserCompaniesForStaffArgs args,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class TenantUserCompanyQueryService : ITenantUserCompanyQueryService {
	private sealed class TenantUserCompanyQueryRow {
		public required UserAccount Account { get; init; }
		public required User User { get; init; }
		public required Tenant Tenant { get; init; }
		public required Guid TenantId { get; init; }
		public required Guid Id { get; init; }
	}

	private readonly AppDbContext _dbContext;

	public TenantUserCompanyQueryService(AppDbContext dbContext) {
		_dbContext = dbContext;
	}


	public async Task<bool> TenantUserExistsForCompanyActionsForStaffAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		return await (
			from u in _dbContext.User.AsNoTracking()
			where u.Id == userId
				&& !u.IsDeleted
				&& (
					from ua in _dbContext.UserAccount.AsNoTracking()
					where ua.UserId == u.Id
						&& ua.Scope == AccountScope.Tenant
					select ua
				).Any()
			select u
		).AnyAsync(cancellationToken);
	}

	public async Task<FindTenantUserCompaniesResult>
	FindTenantUserCompaniesForStaffAsync(
		Guid userId,
		FindTenantUserCompaniesForStaffArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = args.Limit
			?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? "tenant_name";

				var sortFieldHandlers =
			new Dictionary<string, CursorSortFieldHandler<TenantUserCompanyQueryRow>>(
				StringComparer.OrdinalIgnoreCase
			) {
			["tenant_name"] = CursorSortFieldHandlerFactory.Create<TenantUserCompanyQueryRow, string, Guid>(
				cursorLookupQuery: () => _dbContext.UserAccount
					.AsNoTracking()
					.Join(_dbContext.Tenant.AsNoTracking(), ua => ua.TenantId, t => t.Id, (ua, t) => new TenantUserCompanyQueryRow {
						Account = ua,
						User = ua.User,
						Tenant = t,
						TenantId = ua.TenantId ?? Guid.Empty,
						Id = ua.TenantId ?? Guid.Empty,
					})
					.Where(ua => ua.Account.UserId == userId
						&& ua.Account.Scope == AccountScope.Tenant
						&& !ua.Account.IsDeleted
						&& !ua.User.IsDeleted
						&& !ua.Tenant.IsDeleted),
				keySelector: ua => ua.Tenant.Name,
				idSelector: ua => ua.Id,
				cancellationToken
			),
			["status"] = CursorSortFieldHandlerFactory.Create<TenantUserCompanyQueryRow, int, Guid>(
				cursorLookupQuery: () => _dbContext.UserAccount
					.AsNoTracking()
					.Join(_dbContext.Tenant.AsNoTracking(), ua => ua.TenantId, t => t.Id, (ua, t) => new TenantUserCompanyQueryRow {
						Account = ua,
						User = ua.User,
						Tenant = t,
						TenantId = ua.TenantId ?? Guid.Empty,
						Id = ua.TenantId ?? Guid.Empty,
					})
					.Where(ua => ua.Account.UserId == userId
						&& ua.Account.Scope == AccountScope.Tenant
						&& !ua.Account.IsDeleted
						&& !ua.User.IsDeleted
						&& !ua.Tenant.IsDeleted),
				keySelector: ua => ua.User.Status == UserStatus.Suspended ? 2 : ua.Account.Status == AccountStatus.Suspended ? 1 : 0,
				idSelector: ua => ua.Id,
				cancellationToken
			),
			["level"] = CursorSortFieldHandlerFactory.Create<TenantUserCompanyQueryRow, AccountLevel, Guid>(
				cursorLookupQuery: () => _dbContext.UserAccount
					.AsNoTracking()
					.Join(_dbContext.Tenant.AsNoTracking(), ua => ua.TenantId, t => t.Id, (ua, t) => new TenantUserCompanyQueryRow {
						Account = ua,
						User = ua.User,
						Tenant = t,
						TenantId = ua.TenantId ?? Guid.Empty,
						Id = ua.TenantId ?? Guid.Empty,
					})
					.Where(ua => ua.Account.UserId == userId
						&& ua.Account.Scope == AccountScope.Tenant
						&& !ua.Account.IsDeleted
						&& !ua.User.IsDeleted
						&& !ua.Tenant.IsDeleted),
				keySelector: ua => ua.Account.Level,
				idSelector: ua => ua.Id,
				cancellationToken
			),
			["created_at"] = CursorSortFieldHandlerFactory.Create<TenantUserCompanyQueryRow, DateTime, Guid>(
				cursorLookupQuery: () => _dbContext.UserAccount
					.AsNoTracking()
					.Join(_dbContext.Tenant.AsNoTracking(), ua => ua.TenantId, t => t.Id, (ua, t) => new TenantUserCompanyQueryRow {
						Account = ua,
						User = ua.User,
						Tenant = t,
						TenantId = ua.TenantId ?? Guid.Empty,
						Id = ua.TenantId ?? Guid.Empty,
					})
					.Where(ua => ua.Account.UserId == userId
						&& ua.Account.Scope == AccountScope.Tenant
						&& !ua.Account.IsDeleted
						&& !ua.User.IsDeleted
						&& !ua.Tenant.IsDeleted),
				keySelector: ua => ua.Account.CreatedAt,
				idSelector: ua => ua.Id,
				cancellationToken
			),
		};

		if (
			!sortFieldHandlers.TryGetValue(
				effectiveSortId,
				out CursorSortFieldHandler<TenantUserCompanyQueryRow>? handler
			)
		) {
			return new FindTenantUserCompaniesResult.InvalidSortId(
				effectiveSortId
			);
		}

		var baseQuery =
			from ua in _dbContext.UserAccount.AsNoTracking()
			join u in _dbContext.User.AsNoTracking()
				on ua.UserId equals u.Id
			join tenant in _dbContext.Tenant.AsNoTracking()
				on ua.TenantId equals tenant.Id
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& ua.TenantId != null
				&& !ua.IsDeleted
				&& !u.IsDeleted
				&& !tenant.IsDeleted
			select new TenantUserCompanyQueryRow {
				Account = ua,
				User = u,
				Tenant = tenant,
				TenantId = ua.TenantId ?? Guid.Empty,
				Id = ua.TenantId ?? Guid.Empty,
			};

		// Route-resource existence is independent from cursor validity. Missing
		// tenant users must remain a 404; bad cursors for existing identities are
		// reported as 400 below.
		var hasTenantUserIdentity = await (
			from ua in _dbContext.UserAccount.IgnoreQueryFilters()
			join u in _dbContext.User.AsNoTracking()
				on ua.UserId equals u.Id
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !u.IsDeleted
			select ua
		).AnyAsync(cancellationToken);

		if (!hasTenantUserIdentity) {
			return new FindTenantUserCompaniesResult.NotFound();
		}

		IQueryable<TenantUserCompanyQueryRow> query = baseQuery;
		var search = args.Filters?.Search?.Trim();
		if (!string.IsNullOrEmpty(search)) {
			var searchPattern = $"%{LikePatternUtils.EscapeLikePattern(search)}%";
			query =
				from row in query
				where EF.Functions.ILike(row.Tenant.Name, searchPattern, LikePatternUtils.LikeEscapeChar)
					|| EF.Functions.ILike(row.Tenant.Code, searchPattern, LikePatternUtils.LikeEscapeChar)
				select row;
		}

		var hasAnyCompany =
			await baseQuery.AnyAsync(cancellationToken);
		if (!hasAnyCompany) {
			if (args.Cursor != Guid.Empty) {
				return new FindTenantUserCompaniesResult
					.CursorNotFound(args.Cursor.ToString());
			}

			return new FindTenantUserCompaniesResult.Success(
				new CursorPaginatedResult<TenantUserCompanyData> {
					Data = [],
					NextCursor = null,
				}
			);
		}

		if (args.Cursor != Guid.Empty) {
			var cursorValue =
				await handler.GetCursorValue(args.Cursor);

			if (cursorValue is null) {
				return new FindTenantUserCompaniesResult
					.CursorNotFound(args.Cursor.ToString());
			}

			query = handler.ApplyFilter(
				query,
				cursorValue,
				effectiveSortOrder == SortOrder.Asc
			);
		}

		var orderedQuery = handler.ApplyOrdering(
			query,
			effectiveSortOrder == SortOrder.Asc
		);

		var results = await orderedQuery
			.Take(effectiveLimit + 1)
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (results.Count > effectiveLimit) {
			results.RemoveAt(results.Count - 1);
			nextCursor = results.Last()
				.Tenant.GetRequiredId().ToString();
		}

		return new FindTenantUserCompaniesResult.Success(
			new CursorPaginatedResult<TenantUserCompanyData> {
				Data = results.Select(row => new TenantUserCompanyData {
					Account = row.Account,
					Tenant = row.Tenant,
					AccountLevel = row.Account.Level,
					UserStatus = row.User.Status,
				}).ToList(),
				NextCursor = nextCursor,
			}
		);
	}
}
