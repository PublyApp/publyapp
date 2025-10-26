using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using UserNs = MainApi.Src.Features.Common.User;

namespace MainApi.Src.Features.Common.Session;

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
	private readonly IOptions<AppSettings> _appSettings;

	public SessionService(MainApiDbContext dbContext, IOptions<AppSettings> appSettings) {
		_dbContext = dbContext;
		_appSettings = appSettings;
	}

	public async Task<Session> CreateSessionForUser(UserNs.User user, CancellationToken cancellationToken = default) {
		var session = new Session {
			UserId = user.Id,
			Token = CryptoUtils.RandomString(32),
			ExpiresAt = DateTime.UtcNow.AddDays(_appSettings.Value.SESSION_EXPIRY_DAYS),
		};

		var result = await _dbContext.Session.AddAsync(session, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

		return result.Entity;
	}

	public async Task<SessionData?> GetSessionByToken(string token, CancellationToken cancellationToken = default) {
		var query =
			from s in _dbContext.Session
			join u in _dbContext.User on s.UserId equals u.Id
			where s.Token == token && s.ExpiresAt > DateTime.UtcNow
			select new { Session = s, User = u };

		var result = await query.FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);

		if (result is null) return null;

		// Runtime filtering
		if (result.User.IsDeleted || result.User.IsSuspended || !result.User.IsVerified) {
			return null;
		}

		return new SessionData {
			Session = result.Session,
			User = result.User,
		};
	}
}
