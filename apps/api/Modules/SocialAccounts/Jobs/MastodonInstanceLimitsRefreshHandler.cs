using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

namespace PublyApp.Api.Modules.SocialAccounts.Jobs;

/// <summary>
/// Daily system job (#2186): re-reads the advertised limits (character count, media count,
/// URL weight, image size and types) of every server a Mastodon or Pixelfed account is
/// connected to, so a server that raised or lowered its limits is followed without the user
/// reconnecting. Before this job the limits were read only on connect and reconnect.
///
/// One request per (network, server), however many accounts share it. A server that cannot
/// be read, or advertises nothing usable, keeps each account's last known limits — a limit is
/// never silently reverted to the provider default (same rule as a reconnect). Disconnected
/// (revoked) accounts are skipped: nothing publishes through them.
///
/// Idempotency (F13): the job only ever overwrites the overrides with what the server says
/// now, so a re-run is harmless. Each server is saved on its own, so one failing server never
/// undoes the others and a crash mid-run loses at most the server in flight.
/// </summary>
public sealed class MastodonInstanceLimitsRefreshHandler : IJobHandler {
	// Stable dispatch key == the system_job_definitions.job_key the cron trigger enqueues.
	public const string JobKey = "mastodon-instance-limits-refresh";

	private readonly AppDbContext _Db;
	private readonly IMastodonClient _Client;
	private readonly ILogger<MastodonInstanceLimitsRefreshHandler> _Logger;

	public MastodonInstanceLimitsRefreshHandler(
		AppDbContext db,
		IMastodonClient client,
		ILogger<MastodonInstanceLimitsRefreshHandler> logger
	) {
		this._Db = db;
		this._Client = client;
		this._Logger = logger;
	}

	public string JobType {
		get { return MastodonInstanceLimitsRefreshHandler.JobKey; }
	}

	public async Task<JobOutcome> HandleAsync(
		JobContext context,
		CancellationToken cancellationToken
	) {
		var identities = await (
			from account in this._Db.SocialAccount.AsNoTracking()
			where (account.Provider == SocialProvider.Mastodon || account.Provider == SocialProvider.Pixelfed)
				&& account.Status != SocialAccountStatus.Revoked
				&& !account.IsDeleted
			select new { account.Provider, account.ExternalAccountId }
		).ToListAsync(cancellationToken);

		// The server is the part after the last '@' of "{numeric id}@{host}" (see
		// MastodonOAuthService), so no credential has to be decrypted to find it.
		var targets = identities
			.Select(identity => new {
				identity.Provider,
				Host = identity.ExternalAccountId[(identity.ExternalAccountId.LastIndexOf('@') + 1)..],
			})
			.Where(target => target.Host.Length > 0)
			.Distinct()
			.ToList();

		var refreshed = 0;
		var unchanged = 0;
		var failed = 0;
		foreach (var target in targets) {
			cancellationToken.ThrowIfCancellationRequested();

			string? overrides;
			try {
				var limits = await this._Client.GetInstanceLimitsAsync(target.Host, cancellationToken);
				overrides = limits?.ToCapabilityOverrides(target.Provider);
			} catch (Exception exception) when (exception is not OperationCanceledException) {
				// One misbehaving server must not stop the others from being refreshed.
				failed += 1;
				this._Logger.LogWarning(exception, "mastodon-instance-limits-refresh could not read one server");
				continue;
			}

			if (overrides is null) {
				unchanged += 1;
				continue;
			}

			var suffix = "@" + target.Host;
			var accounts = await this._Db.SocialAccount
				.Where(account => account.Provider == target.Provider
					&& account.Status != SocialAccountStatus.Revoked
					&& !account.IsDeleted
					&& account.ExternalAccountId.EndsWith(suffix))
				.ToListAsync(cancellationToken);
			var now = DateTime.UtcNow;
			foreach (var account in accounts) {
				account.CapabilityOverrides = overrides;
				account.CapabilityRefreshedAt = now;
			}

			await this._Db.SaveChangesAsync(cancellationToken);
			this._Db.ChangeTracker.Clear();
			refreshed += 1;
		}

		if (targets.Count > 0 && this._Logger.IsEnabled(LogLevel.Information)) {
			this._Logger.LogInformation(
				"mastodon-instance-limits-refresh refreshed {Refreshed} of {Servers} server(s); {Unchanged} advertised nothing usable or were unreachable",
				refreshed,
				targets.Count,
				unchanged
			);
		}

		// Every server failing is an outage, not a quiet day: surface it instead of a green run.
		return failed > 0 && failed == targets.Count
			? new JobOutcome.Retry(Error: "no server could be read")
			: JobOutcome.Succeeded;
	}
}
