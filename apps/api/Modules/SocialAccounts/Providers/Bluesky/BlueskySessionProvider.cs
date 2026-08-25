using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Bluesky;

/// <summary>
/// Epic-D publish seam (spec §1 decision 3): resolves a stored social account's
/// credential, opens a live Bluesky session through <see cref="IBlueskyClient"/>,
/// and hands back the live session values. The app password itself never leaves
/// this class — callers see only the typed outcome with the short-lived access
/// token, never the stored secret.
///
/// Failure mapping (Epic C §4/§5): account-caused refusals surface as
/// <see cref="SocialSessionResult.AccountFailure"/> (store a plain-words cause),
/// network/5xx as <see cref="SocialSessionResult.Transient"/> (jobs retry later).
/// A missing/tampered stored credential is an account problem: NeedsReconnect
/// territory, not a crash.
///
/// Registered manually in ServiceRegistration next to the other SocialAccounts
/// adapters: the [Service] scanner only accepts classes under *.Services with an
/// I{ClassName} interface, and this adapter's contract is the cross-epic seam
/// ISocialSessionProvider by name.
/// </summary>
public sealed class BlueskySessionProvider : ISocialSessionProvider {
	private readonly AppDbContext _db;
	private readonly ICredentialProtector _protector;
	private readonly IBlueskyClient _bluesky;
	private readonly ILogger<BlueskySessionProvider> _logger;

	public BlueskySessionProvider(
		AppDbContext db,
		ICredentialProtector protector,
		IBlueskyClient bluesky,
		ILogger<BlueskySessionProvider> logger
	) {
		_db = db;
		_protector = protector;
		_bluesky = bluesky;
		_logger = logger;
	}

	public async Task<SocialSessionResult> OpenSessionAsync(
		Guid socialAccountId,
		CancellationToken cancellationToken
	) {
		var account = await (
			from a in _db.SocialAccount.AsNoTracking()
			where a.Id == socialAccountId
				&& a.Provider == SocialProvider.Bluesky
				&& !a.IsDeleted
			select new { a.DisplayHandle, a.ProtectedCredentials }
		).FirstOrDefaultAsync(cancellationToken);

		if (account is null) {
			return new SocialSessionResult.AccountFailure("social account not found");
		}

		var unprotect = _protector.Unprotect(
			account.ProtectedCredentials,
			SocialProvider.Bluesky
		);
		if (unprotect.Outcome != UnprotectOutcome.Ok || unprotect.Plaintext is null) {
			// Absent or tampered blob both mean "we cannot authenticate this
			// account" — an account-caused failure the caller records as a cause.
			return new SocialSessionResult.AccountFailure("no usable stored credential");
		}

		// The stored handle identifies the account; the decrypted app password exists
		// only for the duration of this call and is never logged or returned (Epic C §4).
		var result = await _bluesky.CreateSessionAsync(
			new BlueskyCredentials(
				Identifier: account.DisplayHandle,
				AppPassword: unprotect.Plaintext
			),
			cancellationToken
		);

		if (result is BlueskySessionResult.Success success) {
			return new SocialSessionResult.Opened(new SocialSession(
				Did: success.Identity.Did,
				Handle: success.Identity.Handle,
				AccessJwt: success.AccessJwt,
				PdsHost: success.PdsHost
			));
		}

		if (result is BlueskySessionResult.AccountFailure refused) {
			// Transparent failure causes (owner product rule): a refused session open
			// is the account's own problem — flip it to needs-reconnect and persist a
			// sanitised plain-words cause for the operator surface. Never a raw
			// provider payload, never the app password. The tracked read entity above
			// is AsNoTracking, so this targeted set-update cannot collide with it.
			await (
				from a in _db.SocialAccount
				where a.Id == socialAccountId && !a.IsDeleted
				select a
			).ExecuteUpdateAsync(setters => setters
				.SetProperty(a => a.Status, SocialAccountStatus.NeedsReconnect)
				.SetProperty(a => a.LastError, refused.Reason)
				.SetProperty(a => a.UpdatedAt, DateTime.UtcNow),
				cancellationToken
			);
			return new SocialSessionResult.AccountFailure(refused.Reason);
		}

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"Bluesky session open for account {SocialAccountId} hit a transient failure",
				socialAccountId
			);
		}
		return new SocialSessionResult.Transient("bluesky unreachable");
	}
}
