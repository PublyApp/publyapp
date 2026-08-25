using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Lib;
using PublyApp.Api.Modules.SocialAccounts.Providers.Bluesky;

namespace PublyApp.Api.Modules.SocialAccounts.Services;

public record FindSocialAccountsArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	Guid? ProjectId
) {
	public const string DefaultSortId = "created_at";
}

public abstract record FindSocialAccountsResult {
	public sealed record Success(CursorPaginatedResult<SocialAccountListItem> Data)
		: FindSocialAccountsResult;

	public sealed record CursorNotFound(string Cursor) : FindSocialAccountsResult;

	public sealed record InvalidSortId(string SortId) : FindSocialAccountsResult;
}

public abstract record ConnectSocialAccountResult {
	public sealed record Connected(SocialAccount Account, bool AlreadyConnected)
		: ConnectSocialAccountResult;

	/// <summary>Bluesky refused the credentials/identifier — nothing was stored.</summary>
	public sealed record Refused(string Reason) : ConnectSocialAccountResult;

	/// <summary>Bluesky could not be reached — nothing was stored.</summary>
	public sealed record Unreachable() : ConnectSocialAccountResult;
}

public abstract record ReconnectSocialAccountResult {
	public sealed record Reconnected(SocialAccount Account) : ReconnectSocialAccountResult;

	public sealed record NotFound() : ReconnectSocialAccountResult;

	/// <summary>Bluesky refused the new secret — the stored row is untouched.</summary>
	public sealed record Refused(string Reason) : ReconnectSocialAccountResult;

	public sealed record Unreachable() : ReconnectSocialAccountResult;
}

public abstract record DisconnectSocialAccountResult {
	public sealed record Disconnected(SocialAccount Account) : DisconnectSocialAccountResult;

	public sealed record NotFound() : DisconnectSocialAccountResult;
}

public abstract record SetSocialAccountProjectsResult {
	public sealed record Applied(
		SocialAccount Account,
		int AttachedCount,
		int DetachedCount
	) : SetSocialAccountProjectsResult;

	public sealed record NotFound() : SetSocialAccountProjectsResult;

	public sealed record InvalidProject(Guid ProjectId) : SetSocialAccountProjectsResult;
}

public record SocialAccountListItem {
	public required Guid Id { get; init; }
	public required string Provider { get; init; }
	public required string ExternalAccountId { get; init; }
	public required string DisplayHandle { get; init; }
	public required string Status { get; init; }
	public required string CredentialType { get; init; }
	public required DateTime? LastSuccessAt { get; init; }
	public required string? LastError { get; init; }
	public required IReadOnlyList<Guid> ProjectIds { get; init; }
}

/// <summary>
/// Wire formatters for the social-accounts slice: snake_case multi-word wire values
/// per the API contract naming split (no collapsed lowercase).
/// </summary>
public static class SocialAccountWire {
	public static string FormatStatus(SocialAccountStatus status) {
		return status switch {
			SocialAccountStatus.Active => "active",
			SocialAccountStatus.NeedsReconnect => "needs_reconnect",
			SocialAccountStatus.Revoked => "revoked",
			_ => throw new ArgumentOutOfRangeException(nameof(status), status, "Unhandled SocialAccountStatus"),
		};
	}

	public static string FormatCredentialType(SocialCredentialType type) {
		return type switch {
			SocialCredentialType.AppPassword => "app_password",
			SocialCredentialType.OAuth => "oauth",
			_ => throw new ArgumentOutOfRangeException(nameof(type), type, "Unhandled SocialCredentialType"),
		};
	}
}

/// <summary>
/// Domain service for social account operations.
/// Methods added here MUST use their tenantId parameter
/// (enforced by SocialAccountArchitecture.Spec).
/// </summary>
public sealed class SocialAccountService {
	private readonly AppDbContext _db;
	private readonly ICredentialProtector _protector;
	private readonly IBlueskyClient _bluesky;

	public SocialAccountService(
		AppDbContext db,
		ICredentialProtector protector,
		IBlueskyClient bluesky
	) {
		_db = db;
		_protector = protector;
		_bluesky = bluesky;
	}

	public async Task<SocialAccount?> FindByExternalAccountAsync(
		Guid tenantId,
		SocialProvider provider,
		string externalAccountId,
		CancellationToken ct = default
	) {
		return await _db.SocialAccount
			.Where(a => a.TenantId == tenantId
				&& a.Provider == provider
				&& a.ExternalAccountId == externalAccountId
				&& !a.IsDeleted)
			.FirstOrDefaultAsync(ct);
	}

	// ── Find (keyset list with optional project visibility filter) ────────────

	public async Task<FindSocialAccountsResult> FindForTenantAsync(
		Guid tenantId,
		FindSocialAccountsArgs args,
		CancellationToken cancellationToken = default
	) {
		var cursor = args.Cursor;
		var effectiveLimit = args.Limit
			?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? FindSocialAccountsArgs.DefaultSortId;

		var sortFieldHandlers =
			new Dictionary<string, CursorSortFieldHandler<SocialAccount>>(
				StringComparer.OrdinalIgnoreCase
			) {
				["created_at"] = new CursorSortFieldHandler<SocialAccount>(
					getCursorValue: async (guid) => {
						var account = await (
							from a in _db.SocialAccount.AsNoTracking()
							where a.Id == guid
								&& a.TenantId == tenantId
								&& !a.IsDeleted
							select new { a.CreatedAt, a.Id }
						).FirstOrDefaultAsync(cancellationToken);
						return account is not null
							? (account.CreatedAt, account.Id)
							: null;
					},
					applyFilter: (q, cursorValue, isAsc) => {
						if (cursorValue is null) {
							return q;
						}
						var (cursorCreatedAt, cursorId) =
							((DateTime, Guid?))cursorValue;
						return isAsc
							? q.Where(a =>
								a.CreatedAt > cursorCreatedAt
								|| (a.CreatedAt == cursorCreatedAt
									&& a.Id > cursorId))
							: q.Where(a =>
								a.CreatedAt < cursorCreatedAt
								|| (a.CreatedAt == cursorCreatedAt
									&& a.Id < cursorId));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(a => a.CreatedAt).ThenBy(a => a.Id)
						: q.OrderByDescending(a => a.CreatedAt)
							.ThenByDescending(a => a.Id)
				),
				["updated_at"] = new CursorSortFieldHandler<SocialAccount>(
					getCursorValue: async (guid) => {
						var account = await (
							from a in _db.SocialAccount.AsNoTracking()
							where a.Id == guid
								&& a.TenantId == tenantId
								&& !a.IsDeleted
							select new { a.UpdatedAt, a.Id }
						).FirstOrDefaultAsync(cancellationToken);
						return account is not null
							? (account.UpdatedAt, account.Id)
							: null;
					},
					applyFilter: (q, cursorValue, isAsc) => {
						if (cursorValue is null) {
							return q;
						}
						var (cursorUpdatedAt, cursorId) =
							((DateTime, Guid?))cursorValue;
						return isAsc
							? q.Where(a =>
								a.UpdatedAt > cursorUpdatedAt
								|| (a.UpdatedAt == cursorUpdatedAt
									&& a.Id > cursorId))
							: q.Where(a =>
								a.UpdatedAt < cursorUpdatedAt
								|| (a.UpdatedAt == cursorUpdatedAt
									&& a.Id < cursorId));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(a => a.UpdatedAt).ThenBy(a => a.Id)
						: q.OrderByDescending(a => a.UpdatedAt)
							.ThenByDescending(a => a.Id)
				),
			};

		if (!sortFieldHandlers.TryGetValue(
			effectiveSortId, out CursorSortFieldHandler<SocialAccount>? handler
		)) {
			return new FindSocialAccountsResult.InvalidSortId(effectiveSortId);
		}

		IQueryable<SocialAccount> query =
			from a in _db.SocialAccount.AsNoTracking()
			where a.TenantId == tenantId && !a.IsDeleted
			select a;

		if (cursor != Guid.Empty) {
			var cursorValue = await handler.GetCursorValue(cursor);
			if (cursorValue is null) {
				return new FindSocialAccountsResult.CursorNotFound(
					cursor.ToString()
				);
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

		// Visibility (spec §2): when filtering by project, unattached accounts are
		// visible everywhere and attached ones only in their projects. Filter before
		// paging so an attached-to-X account never leaks into a Y-filtered page;
		// documented tradeoff (plan Task 3): correctness over deep-cursor stability.
		List<SocialAccount> results;
		if (args.ProjectId.HasValue) {
			var projectId = args.ProjectId.Value;
			var candidates = await orderedQuery
				.ToListAsync(cancellationToken);
			// Links must be loaded BEFORE VisibleIn runs: with AsNoTracking the
			// Projects navigation is otherwise empty and every account would look
			// unattached (visible everywhere) — a cross-project leak.
			await LoadProjectLinksAsync(candidates, cancellationToken);
			results = candidates
				.Where(a => VisibleIn.Visible(a, projectId))
				.Take(effectiveLimit + 1)
				.ToList();
		} else {
			results = await orderedQuery
				.Take(effectiveLimit + 1)
				.ToListAsync(cancellationToken);
			await LoadProjectLinksAsync(results, cancellationToken);
		}

		string? nextCursor = null;
		if (results.Count > effectiveLimit) {
			results.RemoveAt(results.Count - 1);
			nextCursor = results.Last().GetRequiredId().ToString();
		}

		var items = results.Select(ToListItem).ToList();

		return new FindSocialAccountsResult.Success(
			new CursorPaginatedResult<SocialAccountListItem> {
				Data = items,
				NextCursor = nextCursor,
			}
		);
	}

	public async Task<SocialAccount?> GetByIdForTenantAsync(
		Guid tenantId,
		Guid id,
		CancellationToken cancellationToken = default
	) {
		return await (
			from a in _db.SocialAccount.AsNoTracking()
			where a.Id == id && a.TenantId == tenantId && !a.IsDeleted
			select a
		).FirstOrDefaultAsync(cancellationToken);
	}

	// ── Connect / reconnect / disconnect ──────────────────────────────────────

	public async Task<ConnectSocialAccountResult> ConnectForTenantAsync(
		Guid tenantId,
		string identifier,
		string appPassword,
		CancellationToken cancellationToken = default
	) {
		var opened = await _bluesky.CreateSessionAsync(
			new BlueskyCredentials(identifier.Trim(), appPassword),
			cancellationToken
		);

		if (opened is BlueskySessionResult.AccountFailure refused) {
			// Bluesky refusal → nothing stored (spec §6): return the cause only.
			return new ConnectSocialAccountResult.Refused(refused.Reason);
		}

		if (opened is BlueskySessionResult.Transient) {
			return new ConnectSocialAccountResult.Unreachable();
		}

		var success = (BlueskySessionResult.Success)opened;
		var did = success.Identity.Did;
		var handle = success.Identity.Handle;

		var existing = await FindByExternalAccountAsync(
			tenantId, SocialProvider.Bluesky, did, cancellationToken
		);

		if (existing is not null && existing.Status == SocialAccountStatus.Active) {
			return new ConnectSocialAccountResult.Connected(existing, true);
		}

		if (existing is not null) {
			// Same DID reconnecting after disconnect/needs-reconnect: replace the
			// secret and reactivate. The blob is write-only from here on.
			existing.ProtectedCredentials = _protector.Protect(
				appPassword, SocialProvider.Bluesky
			);
			existing.DisplayHandle = handle;
			existing.Status = SocialAccountStatus.Active;
			existing.LastError = null;
			existing.LastSuccessAt = DateTime.UtcNow;
			await _db.SaveChangesAsync(cancellationToken);
			return new ConnectSocialAccountResult.Connected(existing, false);
		}

		var account = new SocialAccount {
			TenantId = tenantId,
			Provider = SocialProvider.Bluesky,
			ExternalAccountId = did,
			DisplayHandle = handle,
			CredentialType = SocialCredentialType.AppPassword,
			ProtectedCredentials = _protector.Protect(
				appPassword, SocialProvider.Bluesky
			),
			Status = SocialAccountStatus.Active,
			LastSuccessAt = DateTime.UtcNow,
		};
		await _db.SocialAccount.AddAsync(account, cancellationToken);
		await _db.SaveChangesAsync(cancellationToken);

		return new ConnectSocialAccountResult.Connected(account, false);
	}

	public async Task<ReconnectSocialAccountResult> ReconnectForTenantAsync(
		Guid tenantId,
		Guid socialAccountId,
		string appPassword,
		CancellationToken cancellationToken = default
	) {
		var account = await (
			from a in _db.SocialAccount
			where a.Id == socialAccountId
				&& a.TenantId == tenantId
				&& !a.IsDeleted
			select a
		).FirstOrDefaultAsync(cancellationToken);

		if (account is null) {
			return new ReconnectSocialAccountResult.NotFound();
		}

		// Spec §3: a revoked account cannot be reconnected — connecting a different
		// account requires reassigning paused posts by hand; surface 404 semantics.
		if (account.Status == SocialAccountStatus.Revoked) {
			return new ReconnectSocialAccountResult.NotFound();
		}

		var opened = await _bluesky.CreateSessionAsync(
			new BlueskyCredentials(account.DisplayHandle, appPassword),
			cancellationToken
		);

		if (opened is BlueskySessionResult.AccountFailure refused) {
			return new ReconnectSocialAccountResult.Refused(refused.Reason);
		}

		if (opened is BlueskySessionResult.Transient) {
			return new ReconnectSocialAccountResult.Unreachable();
		}

		var success = (BlueskySessionResult.Success)opened;
		account.ProtectedCredentials = _protector.Protect(
			appPassword, SocialProvider.Bluesky
		);
		account.DisplayHandle = success.Identity.Handle;
		account.Status = SocialAccountStatus.Active;
		account.LastError = null;
		account.LastSuccessAt = DateTime.UtcNow;
		await _db.SaveChangesAsync(cancellationToken);

		return new ReconnectSocialAccountResult.Reconnected(account);
	}

	public async Task<DisconnectSocialAccountResult> DisconnectForTenantAsync(
		Guid tenantId,
		Guid socialAccountId,
		CancellationToken cancellationToken = default
	) {
		var account = await (
			from a in _db.SocialAccount
			where a.Id == socialAccountId
				&& a.TenantId == tenantId
				&& !a.IsDeleted
			select a
		).FirstOrDefaultAsync(cancellationToken);

		if (account is null) {
			return new DisconnectSocialAccountResult.NotFound();
		}

		// Revoked + secret erased (spec §3); history stays (soft delete untouched).
		account.Status = SocialAccountStatus.Revoked;
		account.ProtectedCredentials = string.Empty;
		account.LastError = null;
		await _db.SaveChangesAsync(cancellationToken);

		return new DisconnectSocialAccountResult.Disconnected(account);
	}

	// ── Project attachments (replace-all, empty set = visible everywhere) ─────

	public async Task<SetSocialAccountProjectsResult> SetProjectsForTenantAsync(
		Guid tenantId,
		Guid socialAccountId,
		IReadOnlyList<Guid> projectIds,
		CancellationToken cancellationToken = default
	) {
		var account = await (
			from a in _db.SocialAccount
			where a.Id == socialAccountId
				&& a.TenantId == tenantId
				&& !a.IsDeleted
			select a
		).FirstOrDefaultAsync(cancellationToken);

		if (account is null) {
			return new SetSocialAccountProjectsResult.NotFound();
		}

		var distinctIds = projectIds.Distinct().ToList();

		// Every requested id must be one of this tenant's live projects.
		var tenantProjectIds = await (
			from p in _db.Project.AsNoTracking()
			where p.TenantId == tenantId && !p.IsDeleted
			select p.Id
		).ToListAsync(cancellationToken);
		var knownProjectIds = tenantProjectIds.ToHashSet();
		var unknown = distinctIds.FirstOrDefault(
			id => !knownProjectIds.Contains(id)
		);
		if (unknown != Guid.Empty) {
			return new SetSocialAccountProjectsResult.InvalidProject(unknown);
		}

		var links = await (
			from l in _db.SocialAccountProject
			where l.SocialAccountId == socialAccountId
			select l
		).ToListAsync(cancellationToken);
		var current = links.Select(l => l.ProjectId).ToHashSet();

		var toAdd = distinctIds.Where(id => !current.Contains(id)).ToList();
		var toRemove = links.Where(l => !distinctIds.Contains(l.ProjectId)).ToList();

		foreach (var id in toAdd) {
			await _db.SocialAccountProject.AddAsync(new SocialAccountProject {
				SocialAccountId = socialAccountId,
				ProjectId = id,
			}, cancellationToken);
		}
		_db.SocialAccountProject.RemoveRange(toRemove);
		await _db.SaveChangesAsync(cancellationToken);

		return new SetSocialAccountProjectsResult.Applied(
			account,
			toAdd.Count,
			toRemove.Count
		);
	}

	// ── helpers ────────────────────────────────────────────────────────────────

	private async Task LoadProjectLinksAsync(
		List<SocialAccount> accounts,
		CancellationToken cancellationToken
	) {
		if (accounts.Count == 0) {
			return;
		}

		var ids = accounts.Select(a => a.Id).ToList();
		var links = await (
			from l in _db.SocialAccountProject.AsNoTracking()
			where ids.Contains(l.SocialAccountId)
			select l
		).ToListAsync(cancellationToken);

		var byAccount = links.GroupBy(l => l.SocialAccountId)
			.ToDictionary(g => g.Key, g => g.ToList());
		foreach (var account in accounts) {
			account.Projects = byAccount.TryGetValue(
				account.GetRequiredId(), out var value
			) ? value : [];
		}
	}

	internal static SocialAccountListItem ToListItem(SocialAccount account) {
		return new SocialAccountListItem {
			Id = account.GetRequiredId(),
			Provider = "bluesky",
			ExternalAccountId = account.ExternalAccountId,
			DisplayHandle = account.DisplayHandle,
			Status = SocialAccountWire.FormatStatus(account.Status),
			CredentialType = SocialAccountWire.FormatCredentialType(
				account.CredentialType
			),
			LastSuccessAt = account.LastSuccessAt,
			LastError = account.LastError,
			ProjectIds = account.Projects
				.Select(p => p.ProjectId)
				.OrderBy(id => id)
				.ToList(),
		};
	}
}
