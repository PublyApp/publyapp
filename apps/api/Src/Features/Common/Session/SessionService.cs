using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using UserNs = MainApi.Src.Features.Common.User;

namespace MainApi.Src.Features.Common.Session;

public abstract record CreateSessionResult {
	public sealed record Success(Session Session) : CreateSessionResult;
	public sealed record Failure(string Message, TranslationKey Key) : CreateSessionResult;
}

public interface ISessionService {
	Task<Session> CreateSessionForUser(UserNs.User user, CancellationToken cancellationToken = default);
	Task<Session?> GetSessionByToken(string token, CancellationToken cancellationToken = default);
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
			Token = CryptoUtils.NewToken(),
			ExpiresAt = DateTime.UtcNow.AddDays(_appSettings.Value.SESSION_EXPIRY_DAYS),
		};

		var result = await _dbContext.Session.AddAsync(session);
		await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

		return result.Entity;
	}

	public async Task<Session?> GetSessionByToken(string token, CancellationToken cancellationToken = default) {
		var query =
			from s in _dbContext.Session
			where s.Token == token && s.ExpiresAt > DateTime.UtcNow
			select s;

		return await query.FirstOrDefaultAsync(cancellationToken);
	}
}
