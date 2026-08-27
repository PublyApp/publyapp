using System.Linq.Expressions;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Invitations.Services;

public sealed record TenantInvitationCounts(int Pending, int ExpiringSoon);

// Discriminates why a checked invitation token cannot be accepted, so callers can tell an
// already-used link apart from an expired or revoked one instead of collapsing them all into
// "not found". NotFound also covers a token that never existed and a soft-deleted invitation
// (the latter has no reachable creation path today, so it is treated the same as unknown).
public enum InvitationTokenStatus {
	Valid,
	NotFound,
	AlreadyAccepted,
	Expired,
	Revoked,
}

public sealed record InvitationTokenLookupResult(InvitationTokenStatus Status, Invitation? Invitation);

public interface IInvitationQueryService {
	Task<Invitation?> GetInvitationByTokenAsync(
		string token,
		CancellationToken cancellationToken = default);

	Task<InvitationTokenLookupResult> GetInvitationTokenStatusAsync(
		string token,
		CancellationToken cancellationToken = default);

	Task<Invitation?> GetStaffInvitationByIdAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default);

	Task<StaffInvitationDetailsResult?> GetStaffInvitationDetailsAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default);

	Task<FindStaffInvitationsResult> FindStaffInvitationsAsync(
		FindStaffInvitationsArgs args,
		CancellationToken cancellationToken = default);

	Task<FindTenantInvitationsResult> FindTenantInvitationsAsync(
		Guid tenantId,
		FindTenantInvitationsArgs args,
		CancellationToken cancellationToken = default);

	// Counts for the tenant detail page: pending (effective, excludes derived-expired) and the
	// subset of those expiring within 48h. A future (TenantId, Status) index would help this at
	// scale; today's (TenantId, Scope) + (ExpiresAt) indexes already cover the filter columns.
	Task<TenantInvitationCounts> CountTenantInvitationsAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default);
}

[Service(ServiceLifetime.Scoped)]
public sealed class InvitationQueryService : IInvitationQueryService {
	private static readonly Expression<Func<Invitation, AccountLevel>>
		EffectiveAccountLevelExpression =
			invitation => invitation.AccountLevel ?? AccountLevel.User;
	private static readonly Func<Invitation, AccountLevel> GetEffectiveAccountLevel =
		EffectiveAccountLevelExpression.Compile();

	private readonly AppDbContext _dbContext;
	private readonly ILogger<InvitationQueryService> _logger;

	public InvitationQueryService(AppDbContext dbContext, ILogger<InvitationQueryService> logger) {
		_dbContext = dbContext;
		_logger = logger;
	}

	public async Task<Invitation?> GetInvitationByTokenAsync(
		string token,
		CancellationToken cancellationToken = default
	) {
		var invitation = await FindInvitationByTokenAsync(token, cancellationToken);

		if (invitation is null) {
			return null;
		}

		if (!invitation.CanBeAccepted()) {
			if (_logger.IsEnabled(LogLevel.Warning)) {
				_logger.LogWarning(
					"Invitation {InvitationId} cannot be accepted (expired, revoked, or deleted)",
					invitation.Id
				);
			}
			return null;
		}

		return invitation;
	}

	public async Task<InvitationTokenLookupResult> GetInvitationTokenStatusAsync(
		string token,
		CancellationToken cancellationToken = default
	) {
		var invitation = await FindInvitationByTokenAsync(token, cancellationToken);

		if (invitation is null || invitation.IsDeleted) {
			return new InvitationTokenLookupResult(InvitationTokenStatus.NotFound, null);
		}

		if (invitation.CanBeAccepted()) {
			return new InvitationTokenLookupResult(InvitationTokenStatus.Valid, invitation);
		}

		if (invitation.IsAccepted()) {
			return new InvitationTokenLookupResult(InvitationTokenStatus.AlreadyAccepted, invitation);
		}

		if (invitation.IsRevoked()) {
			return new InvitationTokenLookupResult(InvitationTokenStatus.Revoked, invitation);
		}

		// Only remaining case given CanBeAccepted()/IsAccepted()/IsRevoked() above: still Pending
		// but past ExpiresAt.
		return new InvitationTokenLookupResult(InvitationTokenStatus.Expired, invitation);
	}

	private async Task<Invitation?> FindInvitationByTokenAsync(
		string token,
		CancellationToken cancellationToken
	) {
		// Intentionally tracked: anonymous acceptance mutates this invitation later in the same request scope.
		var invitationQuery =
			from inv in _dbContext.Invitation
			where inv.Token == token
			select inv;

		return await invitationQuery
			.Include(inv => inv.InvitationProfiles)
			.ThenInclude(ip => ip.Profile)
			.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<Invitation?> GetStaffInvitationByIdAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default
	) {
		// Scope guard: only return staff invitations for staff-only actions.
		return await _dbContext.Invitation
			.AsNoTracking()
			.Where(inv => inv.Id == invitationId && inv.Scope == InvitationScope.Staff)
			.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<StaffInvitationDetailsResult?> GetStaffInvitationDetailsAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default
	) {
		// Load invitation with invited-by user
		var invitationWithInviter = await (
			from inv in _dbContext.Invitation.AsNoTracking()
			where inv.Id == invitationId && inv.Scope == InvitationScope.Staff
			join inviter in _dbContext.User.AsNoTracking() on inv.InvitedByUserId equals inviter.Id
			select new {
				Invitation = inv,
				InviterFirstName = inviter.FirstName,
				InviterLastName = inviter.LastName
			}
		).FirstOrDefaultAsync(cancellationToken);

		if (invitationWithInviter is null) {
			return null;
		}

		var invitation = invitationWithInviter.Invitation;

		// Load profiles for the invitation
		var profiles = await (
			from ip in _dbContext.InvitationProfile.AsNoTracking()
			where ip.InvitationId == invitationId
			join p in _dbContext.Profile.AsNoTracking() on ip.ProfileId equals p.Id
			select new StaffInvitationProfileInfo {
				Id = p.Id ?? Guid.Empty,
				Name = p.Name
			}
		).ToListAsync(cancellationToken);

		var inviterName =
			$"{invitationWithInviter.InviterFirstName} {invitationWithInviter.InviterLastName}";

		return new StaffInvitationDetailsResult {
			Id = invitation.GetRequiredId(),
			Email = invitation.Email,
			Status = Invitation.GetEffectiveStatus(
				invitation.Status,
				invitation.ExpiresAt,
				DateTime.UtcNow
			),
			ExpiresAt = invitation.ExpiresAt,
			AcceptedAt = invitation.AcceptedAt,
			RevokedAt = invitation.RevokedAt,
			CreatedAt = invitation.CreatedAt,
			InvitedByName = inviterName,
			InvitedByUserId = invitation.InvitedByUserId,
			Profiles = profiles
		};
	}

	public async Task<FindStaffInvitationsResult> FindStaffInvitationsAsync(
		FindStaffInvitationsArgs args,
		CancellationToken cancellationToken = default
	) {
		var cursor = args.Cursor;
		var effectiveLimit = args.Limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? "created_at";
		var statuses = args.Statuses;

		// Keyset pagination handlers per sortId (cursor stays a Guid).
		var sortFieldHandlers = new Dictionary<string, CursorSortFieldHandler<Invitation>>(
			StringComparer.OrdinalIgnoreCase
		) {
			["created_at"] = CursorSortFieldHandlerFactory.Create<Invitation, DateTime, Guid?>(
				cursorLookupQuery: () => _dbContext.Invitation
					.AsNoTracking()
					.Where(inv => inv.Scope == InvitationScope.Staff),
				keySelector: inv => inv.CreatedAt,
				idSelector: inv => inv.Id,
				cancellationToken
			),
			["expires_at"] = CursorSortFieldHandlerFactory.Create<Invitation, DateTime, Guid?>(
				cursorLookupQuery: () => _dbContext.Invitation
					.AsNoTracking()
					.Where(inv => inv.Scope == InvitationScope.Staff),
				keySelector: inv => inv.ExpiresAt,
				idSelector: inv => inv.Id,
				cancellationToken
			),
			["email"] = CursorSortFieldHandlerFactory.Create<Invitation, string, Guid?>(
				cursorLookupQuery: () => _dbContext.Invitation
					.AsNoTracking()
					.Where(inv => inv.Scope == InvitationScope.Staff),
				keySelector: inv => inv.Email,
				idSelector: inv => inv.Id,
				cancellationToken
			),
			["accepted_at"] = CursorSortFieldHandlerFactory.Create<Invitation, DateTime, Guid?>(
				cursorLookupQuery: () => _dbContext.Invitation
					.AsNoTracking()
					.Where(inv => inv.Scope == InvitationScope.Staff),
				// Treat null AcceptedAt as min value to keep ordering stable.
				keySelector: inv => inv.AcceptedAt ?? DateTime.MinValue,
				idSelector: inv => inv.Id,
				cancellationToken
			),
		};

		if (
			!sortFieldHandlers.TryGetValue(
				effectiveSortId,
				out CursorSortFieldHandler<Invitation>? handler
			)
		) {
			return new FindStaffInvitationsResult.InvalidSortId(effectiveSortId);
		}

		var query = _dbContext.Invitation
			.AsNoTracking()
			.Where(inv => inv.Scope == InvitationScope.Staff && inv.Id != null);

		if (statuses is { Count: > 0 } activeStatuses) {
			var now = DateTime.UtcNow;
			query = query.Where(inv =>
				// Filters are effective statuses: Expired is derived from Pending + ExpiresAt.
				(activeStatuses.Contains(InvitationEffectiveStatus.Pending) && inv.Status == InvitationStatus.Pending && inv.ExpiresAt > now) ||
				(activeStatuses.Contains(InvitationEffectiveStatus.Accepted) && inv.Status == InvitationStatus.Accepted) ||
				(activeStatuses.Contains(InvitationEffectiveStatus.Revoked) && inv.Status == InvitationStatus.Revoked) ||
				(activeStatuses.Contains(InvitationEffectiveStatus.Expired) && inv.Status == InvitationStatus.Pending && inv.ExpiresAt <= now)
			);
		}

		if (cursor != Guid.Empty) {
			var cursorValue = await handler.GetCursorValue(cursor);
			if (cursorValue is null) {
				return new FindStaffInvitationsResult.CursorNotFound(cursor.ToString());
			}

			query = handler.ApplyFilter(query, cursorValue, effectiveSortOrder == SortOrder.Asc);
		}

		var orderedQuery = handler.ApplyOrdering(query, effectiveSortOrder == SortOrder.Asc);

		// Fetch one extra row to compute the next cursor.
		var results = await orderedQuery
			.Join(
				_dbContext.User.AsNoTracking(),
				inv => inv.InvitedByUserId,
				inviter => inviter.Id,
				(inv, inviter) => new {
					Invitation = inv,
					InviterName = $"{inviter.FirstName} {inviter.LastName}"
				}
			)
			.Take(effectiveLimit + 1)
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (results.Count > effectiveLimit) {
			results.RemoveAt(results.Count - 1);
			nextCursor = results.Last().Invitation.GetRequiredId().ToString();
		}

		// Load profile names separately to avoid duplicating invitation rows.
		var invitationIds = results.Select(r => r.Invitation.GetRequiredId()).ToList();
		var profileQuery =
			from ip in _dbContext.InvitationProfile.AsNoTracking()
			where invitationIds.Contains(ip.InvitationId)
			join p in _dbContext.Profile.AsNoTracking() on ip.ProfileId equals p.Id
			select new {
				InvitationId = ip.InvitationId,
				Profile = new StaffInvitationProfileInfo {
					Id = p.Id ?? Guid.Empty,
					Name = p.Name
				}
			};

		var profileRows = await profileQuery.ToListAsync(cancellationToken);
		var profilesByInvitation = profileRows
			.GroupBy(item => item.InvitationId)
			.ToDictionary(
				group => group.Key,
				group => group.Select(item => item.Profile).ToList()
			);

		var profileNamesByInvitation = profilesByInvitation
			.ToDictionary(
				group => group.Key,
				group => string.Join(", ", group.Value.Select(profile => profile.Name))
			);

		var invitationItems = results.Select(r => {
			var invitationId = r.Invitation.GetRequiredId();
			var profileName = profileNamesByInvitation.TryGetValue(invitationId, out var name)
				? name
				: string.Empty;
			return new InvitationListItem {
				Id = invitationId,
				Email = r.Invitation.Email,
				Scope = "Staff",
				ProfileName = profileName,
				Status = Invitation.GetEffectiveStatus(
					r.Invitation.Status,
					r.Invitation.ExpiresAt,
					DateTime.UtcNow
				),
				ExpiresAt = r.Invitation.ExpiresAt,
				AcceptedAt = r.Invitation.AcceptedAt,
				CreatedAt = r.Invitation.CreatedAt,
				InvitedByName = r.InviterName
			};
		}).ToList();

		return new FindStaffInvitationsResult.Success(
			new CursorPaginatedResult<InvitationListItem> {
				Data = invitationItems,
				NextCursor = nextCursor,
			}
		);
	}

	public async Task<FindTenantInvitationsResult> FindTenantInvitationsAsync(
		Guid tenantId,
		FindTenantInvitationsArgs args,
		CancellationToken cancellationToken = default
	) {
		var cursor = args.Cursor;
		var effectiveLimit = args.Limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder;
		var effectiveSortId = args.SortId ?? "created_at";
		var filters = args.Filters;

		// Keyset pagination handlers per sortId (cursor stays a Guid).
		var sortFieldHandlers = new Dictionary<string, CursorSortFieldHandler<Invitation>>(
			StringComparer.OrdinalIgnoreCase
		) {
			["created_at"] = CursorSortFieldHandlerFactory.Create<Invitation, DateTime, Guid?>(
				cursorLookupQuery: () => _dbContext.Invitation
					.AsNoTracking()
					.Where(inv => inv.Scope == InvitationScope.Tenant && inv.TenantId == tenantId),
				keySelector: inv => inv.CreatedAt,
				idSelector: inv => inv.Id,
				cancellationToken
			),
			["expires_at"] = CursorSortFieldHandlerFactory.Create<Invitation, DateTime, Guid?>(
				cursorLookupQuery: () => _dbContext.Invitation
					.AsNoTracking()
					.Where(inv => inv.Scope == InvitationScope.Tenant && inv.TenantId == tenantId),
				keySelector: inv => inv.ExpiresAt,
				idSelector: inv => inv.Id,
				cancellationToken
			),
			["email"] = CursorSortFieldHandlerFactory.Create<Invitation, string, Guid?>(
				cursorLookupQuery: () => _dbContext.Invitation
					.AsNoTracking()
					.Where(inv => inv.Scope == InvitationScope.Tenant && inv.TenantId == tenantId),
				keySelector: inv => inv.Email,
				idSelector: inv => inv.Id,
				cancellationToken
			),
			["accepted_at"] = CursorSortFieldHandlerFactory.Create<Invitation, DateTime, Guid?>(
				cursorLookupQuery: () => _dbContext.Invitation
					.AsNoTracking()
					.Where(inv => inv.Scope == InvitationScope.Tenant && inv.TenantId == tenantId),
				// Treat null AcceptedAt as min value to keep ordering stable.
				keySelector: inv => inv.AcceptedAt ?? DateTime.MinValue,
				idSelector: inv => inv.Id,
				cancellationToken
			),
		};

		if (
			!sortFieldHandlers.TryGetValue(
				effectiveSortId,
				out CursorSortFieldHandler<Invitation>? handler
			)
		) {
			return new FindTenantInvitationsResult.InvalidSortId(effectiveSortId);
		}

		var query = _dbContext.Invitation
			.AsNoTracking()
			.Where(inv => inv.Scope == InvitationScope.Tenant && inv.TenantId == tenantId && inv.Id != null);

		var searchQuery = filters.Search;
		if (!string.IsNullOrWhiteSpace(searchQuery)) {
			var pattern = $"%{LikePatternUtils.EscapeLikePattern(searchQuery.Trim())}%";
			query = query.Where(inv => EF.Functions.ILike(inv.Email, pattern, LikePatternUtils.LikeEscapeChar));
		}

		if (filters.Status is { Count: > 0 } statuses) {
			var now = DateTime.UtcNow;
			query = query.Where(inv =>
				// Filters are effective statuses: Expired is derived from Pending + ExpiresAt.
				(statuses.Contains(InvitationEffectiveStatus.Pending) && inv.Status == InvitationStatus.Pending && inv.ExpiresAt > now) ||
				(statuses.Contains(InvitationEffectiveStatus.Accepted) && inv.Status == InvitationStatus.Accepted) ||
				(statuses.Contains(InvitationEffectiveStatus.Revoked) && inv.Status == InvitationStatus.Revoked) ||
				(statuses.Contains(InvitationEffectiveStatus.Expired) && inv.Status == InvitationStatus.Pending && inv.ExpiresAt <= now)
			);
		}

		if (filters.Level is { Count: > 0 } levels) {
			query = query.Where(BuildEffectiveAccountLevelPredicate(levels));
		}

		if (cursor != Guid.Empty) {
			var cursorValue = await handler.GetCursorValue(cursor);
			if (cursorValue is null) {
				return new FindTenantInvitationsResult.CursorNotFound(cursor.ToString());
			}

			query = handler.ApplyFilter(query, cursorValue, effectiveSortOrder == SortOrder.Asc);
		}

		var orderedQuery = handler.ApplyOrdering(query, effectiveSortOrder == SortOrder.Asc);

		var results = await orderedQuery
			.Join(
				_dbContext.User.AsNoTracking(),
				inv => inv.InvitedByUserId,
				inviter => inviter.Id,
				(inv, inviter) => new {
					Invitation = inv,
					InviterName = $"{inviter.FirstName} {inviter.LastName}"
				}
			)
			.Take(effectiveLimit + 1)
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (results.Count > effectiveLimit) {
			results.RemoveAt(results.Count - 1);
			nextCursor = results.Last().Invitation.GetRequiredId().ToString();
		}

		var invitationIds = results.Select(r => r.Invitation.GetRequiredId()).ToList();
		var profileRowsQuery =
			from ip in _dbContext.InvitationProfile.AsNoTracking()
			where invitationIds.Contains(ip.InvitationId)
			join p in _dbContext.Profile.AsNoTracking() on ip.ProfileId equals p.Id
			select new {
				InvitationId = ip.InvitationId,
				Profile = new StaffInvitationProfileInfo {
					Id = p.Id ?? Guid.Empty,
					Name = p.Name
				}
			};

		var profileRows = await profileRowsQuery.ToListAsync(cancellationToken);
		var profilesByInvitation = profileRows
			.GroupBy(item => item.InvitationId)
			.ToDictionary(
				group => group.Key,
				group => group.Select(item => item.Profile).ToList()
			);

		var profileNamesByInvitation = profileRows
			.GroupBy(item => item.InvitationId)
			.ToDictionary(
				group => group.Key,
				group => string.Join(", ", group.Select(item => item.Profile.Name))
			);

		var invitationItems = results.Select(r => {
			var invitationId = r.Invitation.GetRequiredId();
			var profiles = profilesByInvitation.TryGetValue(invitationId, out var foundProfiles)
				? foundProfiles
				: [];
			var profileName = profileNamesByInvitation.TryGetValue(invitationId, out var name)
				? name
				: null;
			var accountLevel = GetEffectiveAccountLevel(r.Invitation);
			return new StaffTenantInvitationListItem {
				Id = invitationId,
				Email = r.Invitation.Email,
				Scope = "Tenant",
				ProfileName = profileName,
				Profiles = profiles,
				Status = Invitation.GetEffectiveStatus(
					r.Invitation.Status,
					r.Invitation.ExpiresAt,
					DateTime.UtcNow
				),
				AccountLevel = accountLevel,
				ExpiresAt = r.Invitation.ExpiresAt,
				AcceptedAt = r.Invitation.AcceptedAt,
				CreatedAt = r.Invitation.CreatedAt,
				InvitedByName = r.InviterName
			};
		}).ToList();

		return new FindTenantInvitationsResult.Success(
			new CursorPaginatedResult<StaffTenantInvitationListItem> {
				Data = invitationItems,
				NextCursor = nextCursor,
			}
		);
	}

	private static Expression<Func<Invitation, bool>>
	BuildEffectiveAccountLevelPredicate(
		IReadOnlySet<AccountLevel> levels
	) {
		var containsLevel = Expression.Call(
			typeof(Enumerable),
			nameof(Enumerable.Contains),
			[typeof(AccountLevel)],
			Expression.Constant(levels, typeof(IEnumerable<AccountLevel>)),
			EffectiveAccountLevelExpression.Body
		);

		return Expression.Lambda<Func<Invitation, bool>>(
			containsLevel,
			EffectiveAccountLevelExpression.Parameters
		);
	}

	public async Task<TenantInvitationCounts> CountTenantInvitationsAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var now = DateTime.UtcNow;
		var expiringSoonThreshold = now.AddHours(48);

		var pendingQuery =
			from inv in _dbContext.Invitation.AsNoTracking()
			where inv.TenantId == tenantId
				&& inv.Scope == InvitationScope.Tenant
				&& inv.Status == InvitationStatus.Pending
				&& inv.ExpiresAt > now
				&& !inv.IsDeleted
			select inv;

		// Single round-trip: one conditional-aggregate query (Postgres COUNT(*)
		// FILTER (WHERE ...)) instead of two sequential CountAsync calls over the
		// same predicate.
		var counts = await (
			from inv in pendingQuery
			group inv by 1 into g
			select new {
				Pending = g.Count(),
				ExpiringSoon = g.Count(i => i.ExpiresAt <= expiringSoonThreshold)
			}
		).FirstOrDefaultAsync(cancellationToken);

		return new TenantInvitationCounts(counts?.Pending ?? 0, counts?.ExpiringSoon ?? 0);
	}

}
