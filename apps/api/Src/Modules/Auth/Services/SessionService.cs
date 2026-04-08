using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Auth.Entities;

using Microsoft.EntityFrameworkCore;

using UserNs = MainApi.Src.Modules.Users.Entities;

namespace MainApi.Src.Modules.Auth.Services;

public class SessionData {
	public required Session Session { get; set; }
	public required UserNs.User User { get; set; }
}

public interface ISessionService {
	Task<Session> CreateSessionForUser(UserNs.User user, CancellationToken cancellationToken = default);
	Task<SessionData?> GetSessionByToken(string token, CancellationToken cancellationToken = default);
}

public class SessionService : ISessionService {
	private readonly MainApiDbContext _dbContext;

	public SessionService(MainApiDbContext dbContext) {
		_dbContext = dbContext;
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

		var result = await _dbContext.Session.AddAsync(session, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);

		return result.Entity;
	}

	public async Task<SessionData?> GetSessionByToken(string token, CancellationToken cancellationToken = default) {
		var query =
			from s in _dbContext.Session
			join u in _dbContext.User on s.UserId equals u.Id
			where s.Token == token && s.ExpiresAt > DateTime.UtcNow
			select new { Session = s, User = u };

		var result = await query.FirstOrDefaultAsync(cancellationToken);

		if (result is null) return null;

		// Runtime filtering
		if (result.User.IsDeleted || result.User.IsSuspended() || !result.User.IsVerified) {
			return null;
		}

		return new SessionData {
			Session = result.Session,
			User = result.User,
		};
	}
}
