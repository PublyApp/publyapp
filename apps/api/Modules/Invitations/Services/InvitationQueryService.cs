using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Roles.Services;

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
	private readonly AppDbContext _DbContext;
	private readonly ILogger<InvitationQueryService> _Logger;

	public InvitationQueryService(AppDbContext dbContext, ILogger<InvitationQueryService> logger) {
		this._DbContext = dbContext;
		this._Logger = logger;
	}

	public async Task<Invitation?> GetInvitationByTokenAsync(
		string token,
		CancellationToken cancellationToken = default
	) {
		var invitation = await this._FindInvitationByTokenAsync(token, cancellationToken);

		if (invitation is null) {
			return null;
		}

		if (!invitation.CanBeAccepted()) {
			if (this._Logger.IsEnabled(LogLevel.Warning)) {
				this._Logger.LogWarning(
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
		var invitation = await this._FindInvitationByTokenAsync(token, cancellationToken);

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

	private async Task<Invitation?> _FindInvitationByTokenAsync(
		string token,
		CancellationToken cancellationToken
	) {
		// Intentionally tracked: anonymous acceptance mutates this invitation later in the same request scope.
		var invitationQuery =
			from inv in this._DbContext.Invitation
			where inv.Token == token
			select inv;

		return await invitationQuery
			.Include(inv => inv.InvitationRoles)
			.ThenInclude(ip => ip.Role)
			.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<Invitation?> GetStaffInvitationByIdAsync(
		Guid invitationId,
		CancellationToken cancellationToken = default
	) {
		// Scope guard: only return staff invitations for staff-only actions.
		return await this._DbContext.Invitation
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
			from inv in this._DbContext.Invitation.AsNoTracking()
			where inv.Id == invitationId && inv.Scope == InvitationScope.Staff
			join inviter in this._DbContext.User.AsNoTracking() on inv.InvitedByUserId equals inviter.Id
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

		// Load roles for the invitation
		var roles = await (
			from ip in this._DbContext.InvitationRole.AsNoTracking()
			where ip.InvitationId == invitationId
			join p in this._DbContext.Role.AsNoTracking() on ip.RoleId equals p.Id
			select new StaffInvitationRoleInfo {
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
			Roles = roles
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
				cursorLookupQuery: () => this._DbContext.Invitation
					.AsNoTracking()
					.Where(inv => inv.Scope == InvitationScope.Staff),
				keySelector: inv => inv.CreatedAt,
				idSelector: inv => inv.Id,
				cancellationToken
			),
			["expires_at"] = CursorSortFieldHandlerFactory.Create<Invitation, DateTime, Guid?>(
				cursorLookupQuery: () => this._DbContext.Invitation
					.AsNoTracking()
					.Where(inv => inv.Scope == InvitationScope.Staff),
				keySelector: inv => inv.ExpiresAt,
				idSelector: inv => inv.Id,
				cancellationToken
			),
			["email"] = CursorSortFieldHandlerFactory.Create<Invitation, string, Guid?>(
				cursorLookupQuery: () => this._DbContext.Invitation
					.AsNoTracking()
					.Where(inv => inv.Scope == InvitationScope.Staff),
				keySelector: inv => inv.Email,
				idSelector: inv => inv.Id,
				cancellationToken
			),
			["accepted_at"] = CursorSortFieldHandlerFactory.Create<Invitation, DateTime, Guid?>(
				cursorLookupQuery: () => this._DbContext.Invitation
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

		var query = this._DbContext.Invitation
			.AsNoTracking()
			.Where(inv => inv.Scope == InvitationScope.Staff && inv.Id != null);

		if (args.Search is { } search) {
			var trimmed = search.Trim();
			if (trimmed.Length > 0) {
				var pattern = $"%{LikePatternUtils.EscapeLikePattern(trimmed)}%";
				query = query.Where(inv =>
					EF.Functions.ILike(inv.Email, pattern, LikePatternUtils.LikeEscapeChar)
					|| this._DbContext.User.Any(inviter =>
						inviter.Id == inv.InvitedByUserId
						&& ((inviter.FirstName != null && EF.Functions.ILike(inviter.FirstName, pattern, LikePatternUtils.LikeEscapeChar))
							|| (inviter.LastName != null && EF.Functions.ILike(inviter.LastName, pattern, LikePatternUtils.LikeEscapeChar))))
				);
			}
		}

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

		// Facets over the whole filtered collection (cursor and limit excluded).
		var facetNow = DateTime.UtcNow;
		var expiringSoonLimit = facetNow.AddDays(3);
		var facetRows = await (
			from inv in query
			group inv by inv.Status into g
			select new {
				Status = g.Key,
				Count = g.Count(),
				Expired = g.Count(inv => inv.ExpiresAt <= facetNow),
				ExpiringSoon = g.Count(inv =>
					inv.ExpiresAt > facetNow && inv.ExpiresAt <= expiringSoonLimit),
			}
		).ToListAsync(cancellationToken);

		var pending = 0;
		var accepted = 0;
		var expired = 0;
		var revoked = 0;
		var expiringSoon = 0;
		foreach (var facet in facetRows) {
			if (facet.Status == InvitationStatus.Pending) {
				pending += facet.Count - facet.Expired;
				expired += facet.Expired;
				expiringSoon += facet.ExpiringSoon;
			} else if (facet.Status == InvitationStatus.Accepted) {
				accepted += facet.Count;
			} else if (facet.Status == InvitationStatus.Revoked) {
				revoked += facet.Count;
			}
		}

		// Invitations per role over the same filtered collection (an invitation
		// carrying several roles counts once in each).
		var filteredInvitationIds = query.Select(inv => inv.Id);
		var roleCountRows = await (
			from invitationRole in this._DbContext.InvitationRole.AsNoTracking()
			join role in this._DbContext.Role.AsNoTracking()
				on (Guid?)invitationRole.RoleId equals role.Id
			where !role.IsDeleted
				&& filteredInvitationIds.Contains((Guid?)invitationRole.InvitationId)
			group role by new { role.Id, role.Name } into g
			select new { g.Key.Id, g.Key.Name, Count = g.Count() }
		).ToListAsync(cancellationToken);
		var roleCounts = roleCountRows
			.Where(row => row.Id is not null)
			.Select(row => new StaffRoleCount(row.Id ?? Guid.Empty, row.Name, row.Count))
			.OrderByDescending(row => row.Count)
			.ThenBy(row => row.Name, StringComparer.OrdinalIgnoreCase)
			.ToList();

		var counts = new StaffInvitationCounts(
			Total: pending + accepted + expired + revoked,
			Pending: pending,
			Accepted: accepted,
			Expired: expired,
			Revoked: revoked,
			ExpiringSoon: expiringSoon,
			RoleCounts: roleCounts
		);

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
				this._DbContext.User.AsNoTracking(),
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

		// Load role names separately to avoid duplicating invitation rows.
		var invitationIds = results.Select(r => r.Invitation.GetRequiredId()).ToList();
		var roleQuery =
			from ip in this._DbContext.InvitationRole.AsNoTracking()
			where invitationIds.Contains(ip.InvitationId)
			join p in this._DbContext.Role.AsNoTracking() on ip.RoleId equals p.Id
			select new {
				InvitationId = ip.InvitationId,
				Role = new StaffInvitationRoleInfo {
					Id = p.Id ?? Guid.Empty,
					Name = p.Name
				}
			};

		var roleRows = await roleQuery.ToListAsync(cancellationToken);
		var rolesByInvitation = roleRows
			.GroupBy(item => item.InvitationId)
			.ToDictionary(
				group => group.Key,
				group => group.Select(item => item.Role).ToList()
			);

		var roleNamesByInvitation = rolesByInvitation
			.ToDictionary(
				group => group.Key,
				group => string.Join(", ", group.Value.Select(role => role.Name))
			);

		var invitationItems = results.Select(r => {
			var invitationId = r.Invitation.GetRequiredId();
			var roleName = roleNamesByInvitation.TryGetValue(invitationId, out var name)
				? name
				: string.Empty;
			return new InvitationListItem {
				Id = invitationId,
				Email = r.Invitation.Email,
				Scope = "Staff",
				RoleName = roleName,
				RoleNames = rolesByInvitation.TryGetValue(invitationId, out var staffRoles)
					? staffRoles.Select(role => role.Name).ToList()
					: [],
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
			},
			counts
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
				cursorLookupQuery: () => this._DbContext.Invitation
					.AsNoTracking()
					.Where(inv => inv.Scope == InvitationScope.Tenant && inv.TenantId == tenantId),
				keySelector: inv => inv.CreatedAt,
				idSelector: inv => inv.Id,
				cancellationToken
			),
			["expires_at"] = CursorSortFieldHandlerFactory.Create<Invitation, DateTime, Guid?>(
				cursorLookupQuery: () => this._DbContext.Invitation
					.AsNoTracking()
					.Where(inv => inv.Scope == InvitationScope.Tenant && inv.TenantId == tenantId),
				keySelector: inv => inv.ExpiresAt,
				idSelector: inv => inv.Id,
				cancellationToken
			),
			["email"] = CursorSortFieldHandlerFactory.Create<Invitation, string, Guid?>(
				cursorLookupQuery: () => this._DbContext.Invitation
					.AsNoTracking()
					.Where(inv => inv.Scope == InvitationScope.Tenant && inv.TenantId == tenantId),
				keySelector: inv => inv.Email,
				idSelector: inv => inv.Id,
				cancellationToken
			),
			["accepted_at"] = CursorSortFieldHandlerFactory.Create<Invitation, DateTime, Guid?>(
				cursorLookupQuery: () => this._DbContext.Invitation
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

		var query = this._DbContext.Invitation
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
				this._DbContext.User.AsNoTracking(),
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
		var roleRowsQuery =
			from ip in this._DbContext.InvitationRole.AsNoTracking()
			where invitationIds.Contains(ip.InvitationId)
			join p in this._DbContext.Role.AsNoTracking() on ip.RoleId equals p.Id
			select new {
				InvitationId = ip.InvitationId,
				Role = new StaffInvitationRoleInfo {
					Id = p.Id ?? Guid.Empty,
					Name = p.Name
				}
			};

		var roleRows = await roleRowsQuery.ToListAsync(cancellationToken);
		var rolesByInvitation = roleRows
			.GroupBy(item => item.InvitationId)
			.ToDictionary(
				group => group.Key,
				group => group.Select(item => item.Role).ToList()
			);

		var roleNamesByInvitation = roleRows
			.GroupBy(item => item.InvitationId)
			.ToDictionary(
				group => group.Key,
				group => string.Join(", ", group.Select(item => item.Role.Name))
			);

		var invitationItems = results.Select(r => {
			var invitationId = r.Invitation.GetRequiredId();
			var roles = rolesByInvitation.TryGetValue(invitationId, out var foundRoles)
				? foundRoles
				: [];
			var roleName = roleNamesByInvitation.TryGetValue(invitationId, out var name)
				? name
				: null;
			return new StaffTenantInvitationListItem {
				Id = invitationId,
				Email = r.Invitation.Email,
				Scope = "Tenant",
				RoleName = roleName,
				Roles = roles,
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

		return new FindTenantInvitationsResult.Success(
			new CursorPaginatedResult<StaffTenantInvitationListItem> {
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
			from inv in this._DbContext.Invitation.AsNoTracking()
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
