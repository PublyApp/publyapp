using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;

namespace PublyApp.Api.Modules.Invitations.Services;

public sealed record TenantInvitationCounts(int Pending, int ExpiringSoon);

public interface IInvitationQueryService {
	Task<Invitation?> GetInvitationByTokenAsync(
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
		// Intentionally tracked: anonymous acceptance mutates this invitation later in the same request scope.
		var invitationQuery =
			from inv in _dbContext.Invitation
			where inv.Token == token
			select inv;

		var invitation = await invitationQuery
			.Include(inv => inv.InvitationProfiles)
			.ThenInclude(ip => ip.Profile)
			.FirstOrDefaultAsync(cancellationToken);

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
			Status = Invitation.GetEffectiveStatusDescription(
				Invitation.GetEffectiveStatus(
					invitation.Status,
					invitation.ExpiresAt,
					DateTime.UtcNow
				)
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
			["created_at"] = new CursorSortFieldHandler<Invitation>(
				getCursorValue: async (guid) => {
					var invitation = await _dbContext.Invitation
						.AsNoTracking()
						.Where(inv => inv.Id == guid && inv.Scope == InvitationScope.Staff)
						.Select(inv => new { inv.CreatedAt, inv.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return invitation is not null ? (invitation.CreatedAt, invitation.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorCreatedAt, cursorId) = ((DateTime, Guid?))cursorValue;
					return isAsc
						? q.Where(inv => inv.CreatedAt > cursorCreatedAt || (inv.CreatedAt == cursorCreatedAt && inv.Id > cursorId))
						: q.Where(inv => inv.CreatedAt < cursorCreatedAt || (inv.CreatedAt == cursorCreatedAt && inv.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(inv => inv.CreatedAt).ThenBy(inv => inv.Id)
					: q.OrderByDescending(inv => inv.CreatedAt).ThenByDescending(inv => inv.Id)
			),
			["expires_at"] = new CursorSortFieldHandler<Invitation>(
				getCursorValue: async (guid) => {
					var invitation = await _dbContext.Invitation
						.AsNoTracking()
						.Where(inv => inv.Id == guid && inv.Scope == InvitationScope.Staff)
						.Select(inv => new { inv.ExpiresAt, inv.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return invitation is not null ? (invitation.ExpiresAt, invitation.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorExpiresAt, cursorId) = ((DateTime, Guid?))cursorValue;
					return isAsc
						? q.Where(inv => inv.ExpiresAt > cursorExpiresAt || (inv.ExpiresAt == cursorExpiresAt && inv.Id > cursorId))
						: q.Where(inv => inv.ExpiresAt < cursorExpiresAt || (inv.ExpiresAt == cursorExpiresAt && inv.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(inv => inv.ExpiresAt).ThenBy(inv => inv.Id)
					: q.OrderByDescending(inv => inv.ExpiresAt).ThenByDescending(inv => inv.Id)
			),
			["email"] = new CursorSortFieldHandler<Invitation>(
				getCursorValue: async (guid) => {
					var invitation = await _dbContext.Invitation
						.AsNoTracking()
						.Where(inv => inv.Id == guid && inv.Scope == InvitationScope.Staff)
						.Select(inv => new { inv.Email, inv.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return invitation is not null ? (invitation.Email, invitation.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorEmail, cursorId) = ((string, Guid?))cursorValue;
					return isAsc
						? q.Where(inv => inv.Email.CompareTo(cursorEmail) > 0 || (inv.Email == cursorEmail && inv.Id > cursorId))
						: q.Where(inv => inv.Email.CompareTo(cursorEmail) < 0 || (inv.Email == cursorEmail && inv.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(inv => inv.Email).ThenBy(inv => inv.Id)
					: q.OrderByDescending(inv => inv.Email).ThenByDescending(inv => inv.Id)
			),
			["accepted_at"] = new CursorSortFieldHandler<Invitation>(
				getCursorValue: async (guid) => {
					var invitation = await _dbContext.Invitation
						.AsNoTracking()
						.Where(inv => inv.Id == guid && inv.Scope == InvitationScope.Staff)
						.Select(inv => new {
							// Treat null AcceptedAt as min value to keep ordering stable.
							AcceptedAt = inv.AcceptedAt ?? DateTime.MinValue,
							inv.Id
						})
						.FirstOrDefaultAsync(cancellationToken);
					return invitation is not null ? (invitation.AcceptedAt, invitation.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorAcceptedAt, cursorId) = ((DateTime, Guid?))cursorValue;
					return isAsc
						? q.Where(inv =>
							(inv.AcceptedAt ?? DateTime.MinValue) > cursorAcceptedAt
							|| ((inv.AcceptedAt ?? DateTime.MinValue) == cursorAcceptedAt && inv.Id > cursorId))
						: q.Where(inv =>
							(inv.AcceptedAt ?? DateTime.MinValue) < cursorAcceptedAt
							|| ((inv.AcceptedAt ?? DateTime.MinValue) == cursorAcceptedAt && inv.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(inv => inv.AcceptedAt ?? DateTime.MinValue).ThenBy(inv => inv.Id)
					: q.OrderByDescending(inv => inv.AcceptedAt ?? DateTime.MinValue).ThenByDescending(inv => inv.Id)
			)
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
		var profileNamesQuery =
			from ip in _dbContext.InvitationProfile.AsNoTracking()
			where invitationIds.Contains(ip.InvitationId)
			join p in _dbContext.Profile.AsNoTracking() on ip.ProfileId equals p.Id
			select new {
				InvitationId = ip.InvitationId,
				ProfileName = p.Name
			};

		var profileNames = await profileNamesQuery.ToListAsync(cancellationToken);
		var profileNamesByInvitation = profileNames
			.GroupBy(pn => pn.InvitationId)
			.ToDictionary(g => g.Key, g => string.Join(", ", g.Select(x => x.ProfileName)));

		var invitationItems = results.Select(r => {
			var invitationId = r.Invitation.GetRequiredId();
			var profileName = profileNamesByInvitation.TryGetValue(invitationId, out var name) ? name : "";
			return new InvitationListItem {
				Id = invitationId,
				Email = r.Invitation.Email,
				Scope = "Staff",
				ProfileName = profileName,
				Status = Invitation.GetEffectiveStatusDescription(
					Invitation.GetEffectiveStatus(
						r.Invitation.Status,
						r.Invitation.ExpiresAt,
						DateTime.UtcNow
					)
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
			["created_at"] = new CursorSortFieldHandler<Invitation>(
				getCursorValue: async (guid) => {
					var invitation = await _dbContext.Invitation
						.AsNoTracking()
						.Where(inv => inv.Id == guid && inv.Scope == InvitationScope.Tenant && inv.TenantId == tenantId)
						.Select(inv => new { inv.CreatedAt, inv.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return invitation is not null ? (invitation.CreatedAt, invitation.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorCreatedAt, cursorId) = ((DateTime, Guid?))cursorValue;
					return isAsc
						? q.Where(inv => inv.CreatedAt > cursorCreatedAt || (inv.CreatedAt == cursorCreatedAt && inv.Id > cursorId))
						: q.Where(inv => inv.CreatedAt < cursorCreatedAt || (inv.CreatedAt == cursorCreatedAt && inv.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(inv => inv.CreatedAt).ThenBy(inv => inv.Id)
					: q.OrderByDescending(inv => inv.CreatedAt).ThenByDescending(inv => inv.Id)
			),
			["expires_at"] = new CursorSortFieldHandler<Invitation>(
				getCursorValue: async (guid) => {
					var invitation = await _dbContext.Invitation
						.AsNoTracking()
						.Where(inv => inv.Id == guid && inv.Scope == InvitationScope.Tenant && inv.TenantId == tenantId)
						.Select(inv => new { inv.ExpiresAt, inv.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return invitation is not null ? (invitation.ExpiresAt, invitation.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorExpiresAt, cursorId) = ((DateTime, Guid?))cursorValue;
					return isAsc
						? q.Where(inv => inv.ExpiresAt > cursorExpiresAt || (inv.ExpiresAt == cursorExpiresAt && inv.Id > cursorId))
						: q.Where(inv => inv.ExpiresAt < cursorExpiresAt || (inv.ExpiresAt == cursorExpiresAt && inv.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(inv => inv.ExpiresAt).ThenBy(inv => inv.Id)
					: q.OrderByDescending(inv => inv.ExpiresAt).ThenByDescending(inv => inv.Id)
			),
			["email"] = new CursorSortFieldHandler<Invitation>(
				getCursorValue: async (guid) => {
					var invitation = await _dbContext.Invitation
						.AsNoTracking()
						.Where(inv => inv.Id == guid && inv.Scope == InvitationScope.Tenant && inv.TenantId == tenantId)
						.Select(inv => new { inv.Email, inv.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return invitation is not null ? (invitation.Email, invitation.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorEmail, cursorId) = ((string, Guid?))cursorValue;
					return isAsc
						? q.Where(inv => inv.Email.CompareTo(cursorEmail) > 0 || (inv.Email == cursorEmail && inv.Id > cursorId))
						: q.Where(inv => inv.Email.CompareTo(cursorEmail) < 0 || (inv.Email == cursorEmail && inv.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(inv => inv.Email).ThenBy(inv => inv.Id)
					: q.OrderByDescending(inv => inv.Email).ThenByDescending(inv => inv.Id)
			),
			["accepted_at"] = new CursorSortFieldHandler<Invitation>(
				getCursorValue: async (guid) => {
					var invitation = await _dbContext.Invitation
						.AsNoTracking()
						.Where(inv => inv.Id == guid && inv.Scope == InvitationScope.Tenant && inv.TenantId == tenantId)
						.Select(inv => new {
							AcceptedAt = inv.AcceptedAt ?? DateTime.MinValue,
							inv.Id
						})
						.FirstOrDefaultAsync(cancellationToken);
					return invitation is not null ? (invitation.AcceptedAt, invitation.Id) : null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorAcceptedAt, cursorId) = ((DateTime, Guid?))cursorValue;
					return isAsc
						? q.Where(inv =>
							(inv.AcceptedAt ?? DateTime.MinValue) > cursorAcceptedAt
							|| ((inv.AcceptedAt ?? DateTime.MinValue) == cursorAcceptedAt && inv.Id > cursorId))
						: q.Where(inv =>
							(inv.AcceptedAt ?? DateTime.MinValue) < cursorAcceptedAt
							|| ((inv.AcceptedAt ?? DateTime.MinValue) == cursorAcceptedAt && inv.Id < cursorId));
				},
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(inv => inv.AcceptedAt ?? DateTime.MinValue).ThenBy(inv => inv.Id)
					: q.OrderByDescending(inv => inv.AcceptedAt ?? DateTime.MinValue).ThenByDescending(inv => inv.Id)
			)
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
		var profileNamesQuery =
			from ip in _dbContext.InvitationProfile.AsNoTracking()
			where invitationIds.Contains(ip.InvitationId)
			join p in _dbContext.Profile.AsNoTracking() on ip.ProfileId equals p.Id
			select new {
				InvitationId = ip.InvitationId,
				ProfileName = p.Name
			};

		var profileNames = await profileNamesQuery.ToListAsync(cancellationToken);
		var profileNamesByInvitation = profileNames
			.GroupBy(pn => pn.InvitationId)
			.ToDictionary(g => g.Key, g => string.Join(", ", g.Select(x => x.ProfileName)));

		var invitationItems = results.Select(r => {
			var invitationId = r.Invitation.GetRequiredId();
			var profileName = profileNamesByInvitation.TryGetValue(invitationId, out var name) ? name : "";
			return new InvitationListItem {
				Id = invitationId,
				Email = r.Invitation.Email,
				Scope = "Tenant",
				ProfileName = profileName,
				Status = Invitation.GetEffectiveStatusDescription(
					Invitation.GetEffectiveStatus(
						r.Invitation.Status,
						r.Invitation.ExpiresAt,
						DateTime.UtcNow
					)
				),
				ExpiresAt = r.Invitation.ExpiresAt,
				AcceptedAt = r.Invitation.AcceptedAt,
				CreatedAt = r.Invitation.CreatedAt,
				InvitedByName = r.InviterName
			};
		}).ToList();

		return new FindTenantInvitationsResult.Success(
			new CursorPaginatedResult<InvitationListItem> {
				Data = invitationItems,
				NextCursor = nextCursor,
			}
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
