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

	/// <summary>An account is missing, inactive, or invisible in the post's project.</summary>
	public sealed record InvalidAccounts(string Cause) : ScheduleResult;

	/// <summary>The schedule itself is invalid (past instant, bad zone).</summary>
	public sealed record InvalidSchedule(string Cause, string ErrorKey)
		: ScheduleResult;
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
/// Result union for the edit endpoint. <see cref="EditPostScheduleResult.InProgressConflict"/>
/// refuses the WHOLE edit while any publication is being published right now.
/// </summary>
public abstract record EditPostScheduleResult {
	public sealed record Success(
		Post Post,
		IReadOnlyList<Publication> Rescheduled
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

	Task<EditPostScheduleResult> EditScheduleAsync(
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
	// Infrastructure seam owning every Publication.Status write (architecture
	// guard) — an infrastructure dependency, NOT a service-to-service one.
	private readonly IPublicationStatusTransitionService _transitions;

	public PublicationService(
		AppDbContext dbContext,
		IHttpContextAccessor httpContextAccessor,
		IPublicationStatusTransitionService transitionService
	) {
		_dbContext = dbContext;
		_httpContextAccessor = httpContextAccessor;
		_transitions = transitionService;
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

	public async Task<EditPostScheduleResult> EditScheduleAsync(
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

		var rescheduled = new List<Publication>();
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

			foreach (var publication in targets) {
				var moved = await _transitions.RescheduleToFutureAsync(
					new ReschedulePublicationToFutureArgs(
						publication.GetRequiredId(),
						args.TenantId,
						schedule
					),
					cancellationToken
				);
				if (moved) {
					rescheduled.Add(publication);
				}
			}
		}

		AddAuditEntry(
			args.ActorUserId,
			AuditActions.PostUpdated,
			postId,
			new {
				args.TenantId,
				PostId = postId,
				RescheduledCount = rescheduled.Count,
			}
		);
		if (schedule is not null) {
			AddAuditEntry(
				args.ActorUserId,
				AuditActions.PublicationRescheduled,
				postId,
				new {
					args.TenantId,
					PostId = postId,
					Count = rescheduled.Count,
					ScheduledAtUtc = schedule.ScheduledAtUtc.ToString("o"),
					ScheduledTimeZone = schedule.ScheduledTimeZone,
				}
			);
		}
		await _dbContext.SaveChangesAsync(cancellationToken);

		return new EditPostScheduleResult.Success(post, rescheduled);
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
				$"Social account {accountId} was not found in this tenant."
			);
		}

		if (account.Status != SocialAccountStatus.Active) {
			return new ScheduleResult.InvalidAccounts(
				$"Social account {account.DisplayHandle} is not active. "
				+ "Reconnect it before scheduling."
			);
		}

		// A post bound to a project accepts only accounts visible in THAT project;
		// a project-less post is tenant-wide and accepts every active account.
		if (post.ProjectId is Guid projectId
			&& !VisibleIn.Visible(account, projectId)) {
			return new ScheduleResult.InvalidAccounts(
				"publication-schedule-account-not-in-project"
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
