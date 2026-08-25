using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.AuditLogs.Entities;
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

public interface IPublicationService {
	Task<ScheduleResult> ScheduleAsync(
		SchedulePublicationArgs args,
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
		var httpContext = _httpContextAccessor.HttpContext;

		var auditLog = AuditLog.CreateEntry(
			userId: args.ActorUserId,
			action: AuditActions.PublicationScheduled,
			targetId: args.PostId,
			details: new {
				args.TenantId,
				args.PostId,
				Count = count,
				ScheduledAtUtc = args.ScheduledAtLocal.ToString("o"),
				ScheduledTimeZone = timeZoneId,
			},
			ipAddress: httpContext?.Connection.RemoteIpAddress?.ToString(),
			userAgent: httpContext?.Request.Headers.UserAgent.ToString()
		);

		_ = _dbContext.AuditLog.Add(auditLog);
	}
}
