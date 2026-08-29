using System.Globalization;
using System.Text;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Lib;

namespace PublyApp.Api.Modules.Publishing.Services;

/// <summary>
/// Arguments for scheduling a post onto one or more social accounts (D3 Task 1).
/// <see cref="ScheduledAtLocal"/> carries an ISO 8601 UTC instant (the wire
/// validator guarantees the Z/offset designator); <see cref="TimeZone"/> is the
/// IANA zone every screen shows the schedule in.
/// </summary>
public record SchedulePublicationArgs(
	Guid TenantId,
	Guid PostId,
	List<Guid> AccountIds,
	DateTime ScheduledAtLocal,
	string TimeZone,
	Guid ActorUserId
);

/// <summary>
/// Result union for scheduling. <see cref="ScheduleResult.NotFound"/> means the
/// post does not exist in the calling tenant (unknown id or foreign row — both 404).
/// </summary>
public abstract record ScheduleResult {
	public sealed record Scheduled(IReadOnlyList<Publication> Publications)
		: ScheduleResult;

	public sealed record NotFound() : ScheduleResult;

	/// <summary>
	/// An account is missing, inactive, or invisible in the post's project.
	/// <see cref="ErrorKey"/> discriminates the failure so the calling handler can
	/// pick the right translation key: the generic <c>accountIds</c> key for the
	/// dynamic-text causes, and <see cref="AccountNotInProjectErrorKey"/> for the
	/// static project-visibility cause.
	/// </summary>
	public sealed record InvalidAccounts(string Cause, string ErrorKey) : ScheduleResult {
		/// <summary>
		/// Stable key for the project-visibility failure, mapped by the handler to
		/// <c>ResponseKeys.PublicationScheduleAccountNotInProject</c> so the cause
		/// renders in the caller's locale (fr and en).
		/// </summary>
		public const string AccountNotInProjectErrorKey =
			"publication-schedule-account-not-in-project";
	}

	/// <summary>The schedule itself is invalid (past instant, bad zone).</summary>
	public sealed record InvalidSchedule(string Cause, string ErrorKey)
		: ScheduleResult;
}

/// <summary>Outcome of cancelling a post's schedule (D3 Task 3).</summary>
public record CancelScheduleResult(int DeletedCount, int KeptCount);

/// <summary>
/// One wire row of the scheduled-publications list (D3 Task 4): the publication
/// plus its account/post context and the DST-aware zone-local ISO string.
/// </summary>
public sealed class ScheduledPublicationItem {
	public required Guid PublicationId { get; init; }
	public required Guid PostId { get; init; }
	public required string PostBodyPreview { get; init; }
	public required string PostStatus { get; init; }
	public required Guid SocialAccountId { get; init; }
	public required string AccountDisplayHandle { get; init; }
	public required DateTime ScheduledAtUtc { get; init; }
	public required string ScheduledAtLocal { get; init; }
	public required string TimeZone { get; init; }
	public required string Status { get; init; }
}

/// <summary>Arguments for the queue/calendar list (D3 Task 4).</summary>
public record FindScheduledPublicationsArgs(
	Guid TenantId,
	DateTime FromUtc,
	DateTime ToUtc,
	IReadOnlyList<PublicationStatus>? Statuses,
	string? Cursor,
	int Limit
);

/// <summary>Result union for the find endpoint.</summary>
public abstract record FindScheduledResult {
	public sealed record Success(
		CursorPaginatedResult<ScheduledPublicationItem> Page
	) : FindScheduledResult;

	public sealed record CursorNotFound() : FindScheduledResult;

	/// <summary>
	/// Window bounds violated: ErrorKey is publication-window-invalid or
	/// publication-window-too-wide, surfaced as a stable 422 key.
	/// </summary>
	public sealed record InvalidWindow(string ErrorKey) : FindScheduledResult;
}

/// <summary>
/// Arguments for editing a post's text and/or replacing its schedule pair (D3
/// Task 2). Instant and zone travel together or not at all.
/// </summary>
public record EditPostScheduleArgs(
	Guid TenantId,
	Guid PostId,
	PatchField<string> Body,
	PatchField<DateTime> ScheduledAtLocal,
	PatchField<string> TimeZone,
	Guid ActorUserId
);

/// <summary>
/// Arguments for cancelling every scheduled publication of one post (D3 Task 4).
/// Tenant-scoped load; actor recorded for audit parity with the other writers.
/// </summary>
public record CancelPostScheduleArgs(
	Guid TenantId,
	Guid PostId,
	Guid ActorUserId
);

/// <summary>
/// One reschedule the CALLING HANDLER still owes a publication: apply it through
/// <see cref="IPublicationStatusTransitionService"/>, the single legal writer of
/// <see cref="PublicationStatus"/>. Carries the validated schedule pair so the
/// handler never re-parses or re-validates the wire values.
/// </summary>
public sealed record PendingReschedule(
	Guid PublicationId,
	Guid SocialAccountId,
	PublicationSchedule Schedule
);

/// <summary>
/// Result union for the edit endpoint. <see cref="EditPostScheduleResult.InProgressConflict"/>
/// refuses the WHOLE edit while any publication is being published right now.
/// </summary>
public abstract record EditPostScheduleResult {
	public sealed record Success(
		Post Post,
		IReadOnlyList<PendingReschedule> Reschedules
	) : EditPostScheduleResult;

	public sealed record NotFound() : EditPostScheduleResult;

	/// <summary>Any publication is InProgress — the whole edit is refused (409).</summary>
	public sealed record InProgressConflict() : EditPostScheduleResult;

	/// <summary>The new schedule is invalid (past instant beyond drift, bad zone).</summary>
	public sealed record InvalidSchedule(string Cause, string ErrorKey)
		: EditPostScheduleResult;
}

public interface IPublicationService {
	Task<ScheduleResult> ScheduleAsync(
		SchedulePublicationArgs args,
		CancellationToken cancellationToken = default
	);

	/// <summary>
	/// Hard-deletes every Scheduled publication of the post and returns the
	/// deleted/kept counts, or null when the post does not exist in the tenant.
	/// </summary>
	Task<CancelScheduleResult?> CancelScheduleAsync(
		CancelPostScheduleArgs args,
		CancellationToken cancellationToken = default
	);

	Task<FindScheduledResult> FindScheduledAsync(
		FindScheduledPublicationsArgs args,
		CancellationToken cancellationToken = default
	);

	/// <summary>
	/// Validates and stages a post's text/schedule edit, returning the result
	/// union for the calling handler to apply. Lives on the interface (not just the
	/// concrete service) so handlers depend on <see cref="IPublicationService"/>
	/// and resolve through the [Service] registration.
	/// </summary>
	Task<EditPostScheduleResult> EditPostCoreAsync(
		EditPostScheduleArgs args,
		CancellationToken cancellationToken = default
	);
}

[PublyApp.Api.Lib.DI.Service(Microsoft.Extensions.DependencyInjection.ServiceLifetime.Scoped)]
public sealed class PublicationService : IPublicationService {
	// Small tolerance so an operator clicking "schedule for 10:00" at 09:59:58 is
	// not rejected by clock drift between browser and server.
	private const int PastDriftToleranceSeconds = 120;

	private readonly AppDbContext _dbContext;
	private readonly IHttpContextAccessor _httpContextAccessor;

	public PublicationService(
		AppDbContext dbContext,
		IHttpContextAccessor httpContextAccessor
	) {
		_dbContext = dbContext;
		_httpContextAccessor = httpContextAccessor;
	}

	public async Task<ScheduleResult> ScheduleAsync(
		SchedulePublicationArgs args,
		CancellationToken cancellationToken = default
	) {
		var timeZoneId = args.TimeZone.Trim();

		if (!TimeZoneInfo.TryFindSystemTimeZoneById(timeZoneId, out var zone)
			|| zone is null) {
			return new ScheduleResult.InvalidSchedule(
				$"'{timeZoneId}' is not an IANA time zone identifier.",
				"timeZone"
			);
		}

		_ = zone; // kept for symmetry with later wall-clock conversion needs

		if (args.ScheduledAtLocal
			< DateTime.UtcNow.AddSeconds(-PastDriftToleranceSeconds)) {
			return new ScheduleResult.InvalidSchedule(
				"The requested date is already in the past. Pick a future date and time.",
				"scheduledAtLocal"
			);
		}

		var post = await (
			from p in _dbContext.Post
			where p.Id == args.PostId
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
			select p
		).FirstOrDefaultAsync(cancellationToken);
		if (post is null) {
			return new ScheduleResult.NotFound();
		}

		var accountIds = args.AccountIds.Distinct().ToList();

		var accounts = await (
			from account in _dbContext.SocialAccount
			where account.TenantId == args.TenantId
				&& !account.IsDeleted
				&& account.Id != null
				&& accountIds.Contains(account.Id.Value)
			select account
		).ToListAsync(cancellationToken);

		await PopulateProjectLinksAsync(accounts, accountIds, cancellationToken);

		foreach (var accountId in accountIds) {
			var failure = ValidateAccount(accounts, accountId, post);
			if (failure is not null) {
				return failure;
			}
		}

		// The parsed value is already the exact UTC instant (validator contract):
		// no conversion here. Rows default to Scheduled on insert — no transition.
		var publications = accountIds
			.Select(accountId => new Publication {
				TenantId = args.TenantId,
				PostId = post.GetRequiredId(),
				SocialAccountId = accountId,
				Status = PublicationStatus.Scheduled,
				ScheduledAtUtc = args.ScheduledAtLocal,
				ScheduledTimeZone = timeZoneId,
				IdempotencyKey = "pending",
			})
			.ToList();

		_dbContext.Publication.AddRange(publications);
		AddAuditEntry(args, publications.Count, timeZoneId);
		await _dbContext.SaveChangesAsync(cancellationToken);

		// The key derives deterministically from the DB-generated row id (Epic A §4.1).
		foreach (var publication in publications) {
			publication.IdempotencyKey =
				PublicationIdempotencyKey.For(publication.GetRequiredId());
		}
		await _dbContext.SaveChangesAsync(cancellationToken);

		return new ScheduleResult.Scheduled(publications);
	}

	/// <summary>
	/// Validates the whole edit and stages every change EXCEPT publication status:
	/// the post text is set on the tracked post, and each Scheduled/Paused target
	/// becomes a <see cref="PendingReschedule"/> for the calling handler to apply
	/// through <see cref="IPublicationStatusTransitionService"/> (handlers
	/// orchestrate; domain services never inject domain services). Deliberately not
	/// on <see cref="IPublicationService"/>: the use case spans this preparation
	/// plus handler-driven transitions.
	/// </summary>
	public async Task<EditPostScheduleResult> EditPostCoreAsync(
		EditPostScheduleArgs args,
		CancellationToken cancellationToken = default
	) {
		var post = await (
			from p in _dbContext.Post
			where p.Id == args.PostId
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
			select p
		).FirstOrDefaultAsync(cancellationToken);
		if (post is null) {
			return new EditPostScheduleResult.NotFound();
		}

		// Refuse BEFORE touching anything: the text stays untouched too.
		var postId = post.GetRequiredId();
		var hasInProgress = await (
			from p in _dbContext.Publication.AsNoTracking()
			where p.PostId == postId
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
				&& p.Status == PublicationStatus.InProgress
			select p.Id
		).AnyAsync(cancellationToken);
		if (hasInProgress) {
			return new EditPostScheduleResult.InProgressConflict();
		}

		// Build the schedule value object ONCE, before any write (plan Step 3).
		PublicationSchedule? schedule = null;
		if (args.ScheduledAtLocal.IsPresent) {
			if (!args.TimeZone.IsPresent) {
				return new EditPostScheduleResult.InvalidSchedule(
					"scheduledAtLocal and timeZone must be sent together.",
					"scheduledAtLocal"
				);
			}

			var timeZoneRaw = args.TimeZone.Value;
			if (timeZoneRaw is null) {
				return new EditPostScheduleResult.InvalidSchedule(
					"'null' is not an IANA time zone identifier.",
					"timeZone"
				);
			}

			var timeZoneValue = timeZoneRaw.Trim();
			if (!TimeZoneInfo.TryFindSystemTimeZoneById(timeZoneValue, out _)) {
				return new EditPostScheduleResult.InvalidSchedule(
					$"'{timeZoneValue}' is not an IANA time zone identifier.",
					"timeZone"
				);
			}

			// Past-drift rule on the raw pair, same tolerance as scheduling.
			if (args.ScheduledAtLocal.Value
				< DateTime.UtcNow.AddSeconds(-PastDriftToleranceSeconds)) {
				return new EditPostScheduleResult.InvalidSchedule(
					"The requested date is already in the past. "
						+ "Pick a future date and time.",
					"scheduledAtLocal"
				);
			}

			try {
				schedule = PublicationSchedule.Create(
					args.ScheduledAtLocal.Value,
					timeZoneValue
				);
			} catch (ArgumentException ex) {
				// Plain-words cause surfaced verbatim (transparent failure causes).
				return new EditPostScheduleResult.InvalidSchedule(
					ex.Message, "timeZone"
				);
			}
		} else if (args.TimeZone.IsPresent) {
			return new EditPostScheduleResult.InvalidSchedule(
				"timeZone can only be changed together with scheduledAtLocal.",
				"timeZone"
			);
		}

		if (args.Body.IsPresent && args.Body.Value is not null) {
			post.Body = args.Body.Value;
		}

		// Rows are NOT written here. Each Scheduled/Paused target becomes a plan the
		// calling handler applies through IPublicationStatusTransitionService; id
		// order keeps the handler's application deterministic.
		var reschedules = new List<PendingReschedule>();
		if (schedule is not null) {
			var targets = await (
				from p in _dbContext.Publication
				where p.PostId == postId
					&& p.TenantId == args.TenantId
					&& !p.IsDeleted
					&& (p.Status == PublicationStatus.Scheduled
						|| p.Status == PublicationStatus.Paused)
				orderby p.Id
				select p
			).ToListAsync(cancellationToken);

			reschedules.AddRange(targets.Select(publication =>
				new PendingReschedule(
					publication.GetRequiredId(),
					publication.SocialAccountId,
					schedule
				)
			));
		}

		AddAuditEntry(
			args.ActorUserId,
			AuditActions.PostUpdated,
			postId,
			new {
				args.TenantId,
				PostId = postId,
				RescheduledCount = reschedules.Count,
			}
		);
		// Same-SaveChanges as the body write, so the text change and its audit
		// commit atomically. The publication.rescheduled summary is written by the
		// calling handler AFTER the transitions, so it counts APPLIED moves.
		await _dbContext.SaveChangesAsync(cancellationToken);

		return new EditPostScheduleResult.Success(post, reschedules);
	}

	/// <summary>
	/// Loads each account's SocialAccountProject rows into the unmapped Projects
	/// navigation so <see cref="VisibleIn"/> can evaluate per-project visibility.
	/// </summary>
	private async Task PopulateProjectLinksAsync(
		List<SocialAccount> accounts,
		List<Guid> accountIds,
		CancellationToken cancellationToken
	) {
		var links = await (
			from link in _dbContext.Set<SocialAccountProject>()
			where accountIds.Contains(link.SocialAccountId)
			select new { link.SocialAccountId, link.ProjectId }
		).ToListAsync(cancellationToken);

		foreach (var account in accounts) {
			var id = account.GetRequiredId();
			account.Projects = links
				.Where(link => link.SocialAccountId == id)
				.Select(link => new SocialAccountProject {
					SocialAccountId = id,
					ProjectId = link.ProjectId,
				})
				.ToList();
		}
	}

	private static ScheduleResult.InvalidAccounts? ValidateAccount(
		List<SocialAccount> accounts,
		Guid accountId,
		Modules.Posts.Entities.Post post
	) {
		var account = accounts.FirstOrDefault(
			a => a.GetRequiredId() == accountId
		);
		if (account is null) {
			return new ScheduleResult.InvalidAccounts(
				$"Social account {accountId} was not found in this tenant.",
				"accountIds"
			);
		}

		if (account.Status != SocialAccountStatus.Active) {
			return new ScheduleResult.InvalidAccounts(
				$"Social account {account.DisplayHandle} is not active. "
				+ "Reconnect it before scheduling.",
				"accountIds"
			);
		}

		// A post bound to a project accepts only accounts visible in THAT project;
		// a project-less post is tenant-wide and accepts every active account. The
		// cause is plain words (transparent-failure rule); the stable key drives
		// the localized response-message translation.
		if (post.ProjectId is Guid projectId
			&& !VisibleIn.Visible(account, projectId)) {
			return new ScheduleResult.InvalidAccounts(
				"This account is not attached to the post's project. Pick an "
					+ "account visible in the project, or remove the post's project.",
				ScheduleResult.InvalidAccounts.AccountNotInProjectErrorKey
			);
		}

		return null;
	}

	/// <summary>
	/// Adds the audit entry to the current change tracker so it is flushed by the
	/// same SaveChanges — and therefore the same transaction — as the publication
	/// inserts. Deliberately not IAuditLogService (same-transaction precedent,
	/// TenantProfileAsStaffService.AddAuditEntry).
	/// </summary>
	private void AddAuditEntry(
		SchedulePublicationArgs args,
		int count,
		string timeZoneId
	) {
		AddAuditEntry(
			args.ActorUserId,
			AuditActions.PublicationScheduled,
			args.PostId,
			new {
				args.TenantId,
				args.PostId,
				Count = count,
				ScheduledAtUtc = args.ScheduledAtLocal.ToString("o"),
				ScheduledTimeZone = timeZoneId,
			}
		);
	}

	/// <summary>
	/// Adds the audit entry to the current change tracker so it is flushed by the
	/// same SaveChanges — and therefore the same transaction — as the state change
	/// it records. Deliberately not IAuditLogService: that would be a
	/// service-to-service dependency, and its own SaveChanges would make the audit
	/// a second commit that a cancellation could skip.
	/// </summary>
	public async Task<CancelScheduleResult?> CancelScheduleAsync(
		CancelPostScheduleArgs args,
		CancellationToken cancellationToken = default
	) {
		var tenantId = args.TenantId;
		var postId = args.PostId;
		var actorUserId = args.ActorUserId;
		var postExists = await (
			from p in _dbContext.Post.AsNoTracking()
			where p.Id == postId
				&& p.TenantId == tenantId
				&& !p.IsDeleted
			select p.Id
		).AnyAsync(cancellationToken);
		if (!postExists) {
			return null;
		}

		// SQL DELETE, not a status transition: cancelled publications leave no
		// history row (the audit entry below carries the durable record).
		var deletedCount = await (
			from p in _dbContext.Publication
			where p.PostId == postId
				&& p.TenantId == tenantId
				&& !p.IsDeleted
				&& p.Status == PublicationStatus.Scheduled
			select p
		).ExecuteDeleteAsync(cancellationToken);

		var keptCount = await (
			from p in _dbContext.Publication.AsNoTracking()
			where p.PostId == postId
				&& p.TenantId == tenantId
				&& !p.IsDeleted
			select p.Id
		).CountAsync(cancellationToken);

		if (deletedCount > 0) {
			AddAuditEntry(
				actorUserId,
				AuditActions.PublicationScheduleCancelled,
				postId,
				new {
					TenantId = tenantId,
					PostId = postId,
					DeletedCount = deletedCount,
					KeptCount = keptCount,
				}
			);
			await _dbContext.SaveChangesAsync(cancellationToken);
		}

		return new CancelScheduleResult(deletedCount, keptCount);
	}

	private const int BodyPreviewMaxLength = 120;

	public async Task<FindScheduledResult> FindScheduledAsync(
		FindScheduledPublicationsArgs args,
		CancellationToken cancellationToken = default
	) {
		if (args.FromUtc > args.ToUtc) {
			return new FindScheduledResult.InvalidWindow(
				"publication-window-invalid"
			);
		}

		if (args.ToUtc - args.FromUtc > TimeSpan.FromDays(31)) {
			return new FindScheduledResult.InvalidWindow(
				"publication-window-too-wide"
			);
		}

		var baseQuery =
			from publication in _dbContext.Publication.AsNoTracking()
			where publication.TenantId == args.TenantId
				&& !publication.IsDeleted
				&& publication.ScheduledAtUtc >= args.FromUtc
				&& publication.ScheduledAtUtc <= args.ToUtc
				&& (args.Statuses == null
					|| args.Statuses.Count == 0
					|| args.Statuses.Contains(publication.Status))
			select new {
				Publication = publication,
				AccountHandle = _dbContext.SocialAccount
					.Where(a => a.Id == publication.SocialAccountId)
					.Select(a => a.DisplayHandle)
					.FirstOrDefault(),
			};

		if (!string.IsNullOrEmpty(args.Cursor)) {
			if (!TryDecodeCursor(args.Cursor, out var cursorInstant,
					out var cursorId)) {
				return new FindScheduledResult.CursorNotFound();
			}

			var cursorExists = await (
				from p in _dbContext.Publication.AsNoTracking()
				where p.Id == cursorId
					&& p.ScheduledAtUtc == cursorInstant
				select p.Id
			).AnyAsync(cancellationToken);
			if (!cursorExists) {
				return new FindScheduledResult.CursorNotFound();
			}

			baseQuery = baseQuery.Where(row =>
				row.Publication.ScheduledAtUtc > cursorInstant
				|| (row.Publication.ScheduledAtUtc == cursorInstant
					&& row.Publication.Id > cursorId)
			);
		}

		var rows = await baseQuery
			.OrderBy(row => row.Publication.ScheduledAtUtc)
			.ThenBy(row => row.Publication.Id)
			.Take(args.Limit + 1)
			.ToListAsync(cancellationToken);

		var hasNextPage = rows.Count > args.Limit;
		if (hasNextPage) {
			rows.RemoveAt(rows.Count - 1);
		}

		var postIds = rows
			.Select(row => row.Publication.PostId)
			.Distinct()
			.ToList();

		var postRows = await (
			from p in _dbContext.Post.AsNoTracking()
			where p.Id.HasValue && postIds.Contains(p.Id.Value)
			select new { PostIdValue = p.Id, p.Body }
		).ToListAsync(cancellationToken);

		var postInfos = new Dictionary<Guid, string>(postRows.Count);
		foreach (var row in postRows) {
			if (row.PostIdValue is { } postIdValue) {
				postInfos[postIdValue] = row.Body;
			}
		}

		var postStatuses = await (
			from p in _dbContext.Publication.AsNoTracking()
			where postIds.Contains(p.PostId) && !p.IsDeleted
			select p
		).ToListAsync(cancellationToken);

		var items = new List<ScheduledPublicationItem>(rows.Count);
		foreach (var row in rows) {
			var publication = row.Publication;
			var postId = publication.PostId;
			var body = postInfos.TryGetValue(postId, out var value)
				? value ?? string.Empty
				: string.Empty;
			var derived = PostStatusDerivation.Derive(
				postStatuses
					.Where(s => s.PostId == postId)
					.ToList()
			);

			items.Add(new ScheduledPublicationItem {
				PublicationId = publication.GetRequiredId(),
				PostId = postId,
				PostBodyPreview = body.Length <= BodyPreviewMaxLength
					? body
					: body[..BodyPreviewMaxLength],
				PostStatus = derived.ToString().ToLowerInvariant(),
				SocialAccountId = publication.SocialAccountId,
				AccountDisplayHandle = row.AccountHandle ?? string.Empty,
				ScheduledAtUtc = publication.ScheduledAtUtc,
				ScheduledAtLocal = PublicationZoneFormatter.ToLocalIso(
					publication.ScheduledAtUtc,
					publication.ScheduledTimeZone
				),
				TimeZone = publication.ScheduledTimeZone,
				Status = PublicationWire.FormatStatus(publication.Status),
			});
		}

		var last = rows[^1].Publication;
		var page = new CursorPaginatedResult<ScheduledPublicationItem> {
			Data = items,
			NextCursor = hasNextPage
				? EncodeCursor(last.ScheduledAtUtc, last.GetRequiredId())
				: null,
		};
		return new FindScheduledResult.Success(page);
	}

	private static string EncodeCursor(DateTime utcInstant, Guid id) {
		return Convert.ToBase64String(Encoding.UTF8.GetBytes(
			$"{utcInstant:O}|{id}"
		));
	}

	private static bool TryDecodeCursor(
		string? encoded,
		out DateTime utcInstant,
		out Guid id
	) {
		utcInstant = default;
		id = default;
		if (string.IsNullOrEmpty(encoded)) {
			return false;
		}

		string decoded;
		try {
			decoded = Encoding.UTF8.GetString(
				Convert.FromBase64String(encoded)
			);
		} catch (FormatException) {
			return false;
		}

		var separatorIndex = decoded.IndexOf('|');
		if (separatorIndex < 0) {
			return false;
		}

		if (!DateTime.TryParse(decoded[..separatorIndex],
				CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal,
				out var parsed)) {
			return false;
		}

		if (!Guid.TryParse(decoded[(separatorIndex + 1)..], out var parsedId)) {
			return false;
		}

		utcInstant = parsed.ToUniversalTime();
		id = parsedId;
		return true;
	}

	private void AddAuditEntry(
		Guid userId,
		string action,
		Guid? targetId,
		object details
	) {
		var httpContext = _httpContextAccessor.HttpContext;

		var auditLog = AuditLog.CreateEntry(
			userId: userId,
			action: action,
			targetId: targetId,
			details: details,
			ipAddress: httpContext?.Connection.RemoteIpAddress?.ToString(),
			userAgent: httpContext?.Request.Headers.UserAgent.ToString()
		);

		_ = _dbContext.AuditLog.Add(auditLog);
	}
}
