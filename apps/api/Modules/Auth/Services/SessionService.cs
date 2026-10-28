using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Entities;

using UserNs = PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Auth.Services;

public class SessionData {
	public required Session Session { get; set; }
	public required UserNs.User User { get; set; }
}

public interface ISessionService {
	Task<Session> CreateSessionForUser(UserNs.User user, CancellationToken cancellationToken = default);
	Task<SessionData?> GetSessionByToken(string token, CancellationToken cancellationToken = default);

	/// <summary>
	/// Physically deletes the ordinary (non-impersonation) session row
	/// matching the given token. Returns <c>true</c> when a row was deleted,
	/// <c>false</c> when no ordinary session matched (the token may be an
	/// impersonation session, or the session was already consumed).
	///
	/// The delete is constrained by token AND <c>IsImpersonation == false</c>
	/// in a single atomic statement — no SELECT+DELETE race and never touches
	/// impersonation sessions.
	/// </summary>
	Task<bool> RevokeRegularSessionForTokenAsync(string token, CancellationToken cancellationToken = default);

	/// <summary>
	/// Physically deletes every session row belonging to the user, ordinary and
	/// impersonation alike, in a single statement. Used after a credential
	/// change (a completed password reset) so that a token copied before the
	/// change stops authenticating instead of surviving until its natural
	/// expiry. Returns the number of deleted rows.
	/// </summary>
	Task<int> RevokeAllSessionsForUserAsync(Guid userId, CancellationToken cancellationToken = default);
}

[Service(ServiceLifetime.Scoped)]
public class SessionService : ISessionService {
	private readonly AppDbContext _DbContext;

	public SessionService(AppDbContext dbContext) {
		this._DbContext = dbContext;
	}

	public async Task<Session> CreateSessionForUser(UserNs.User user, CancellationToken cancellationToken = default) {
		if (user.Id is null) {
			throw new InvalidOperationException("Cannot create session for user without persisted identifier.");
		}

		var session = new Session {
			UserId = user.Id.Value,
			Token = CryptoUtils.RandomString(32),
			ExpiresAt = DateTime.UtcNow.AddDays(AppEnvironment.Instance.SESSION_EXPIRY_DAYS),
		};

		var result = await this._DbContext.Session.AddAsync(session, cancellationToken);
		await this._DbContext.SaveChangesAsync(cancellationToken);

		return result.Entity;
	}

	public async Task<SessionData?> GetSessionByToken(string token, CancellationToken cancellationToken = default) {
		var utcNow = DateTime.UtcNow;

		var query =
			from s in this._DbContext.Session
			join u in this._DbContext.User on s.UserId equals u.Id
			where s.Token == token
			select new { Session = s, User = u };

		var result = await query.FirstOrDefaultAsync(cancellationToken);

		if (result is null) {
			return null;
		}

		if (result.Session.ExpiresAt <= utcNow) {
			await this._DbContext.Session
				.Where(s => s.Token == token && s.ExpiresAt <= utcNow)
				.ExecuteDeleteAsync(cancellationToken);

			return null;
		}

		// Runtime filtering
		if (result.User.IsDeleted || result.User.IsSuspended() || !result.User.IsVerified) {
			return null;
		}

		return new SessionData {
			Session = result.Session,
			User = result.User,
		};
	}

	/// <inheritdoc />
	public async Task<bool> RevokeRegularSessionForTokenAsync(
		string token,
		CancellationToken cancellationToken = default
	) {
		// Single atomic delete constrained by token AND ordinary-session
		// type. This is free of the SELECT+DELETE race (two concurrent
		// revocations can't collide on a tracked entity) and never touches
		// impersonation sessions — a valid impersonation token remains usable
		// after this operation and no `impersonation.ended` audit action is
		// emitted (that is handled elsewhere, not here).
		var affectedRows = await this._DbContext.Session
			.Where(s => s.Token == token && !s.IsImpersonation)
			.ExecuteDeleteAsync(cancellationToken);

		return affectedRows > 0;
	}

	/// <inheritdoc />
	public async Task<int> RevokeAllSessionsForUserAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// One statement, so a session created concurrently with the credential
		// change either lands before the delete and dies with it, or lands after
		// and is issued under the new password — there is no window where a
		// pre-change token survives in a row this delete already scanned.
		return await this._DbContext.Session
			.Where(s => s.UserId == userId)
			.ExecuteDeleteAsync(cancellationToken);
	}
}
