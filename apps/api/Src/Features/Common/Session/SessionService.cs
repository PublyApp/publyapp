using MainApi.Localization;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;
using Microsoft.Extensions.Options;
using UserNs = MainApi.Src.Features.Common.User;

namespace MainApi.Src.Features.Common.Session;

public abstract record CreateSessionResult {
	public sealed record Success(Session Session) : CreateSessionResult;
	public sealed record Failure(string Message, TranslationKey Key) : CreateSessionResult;
}

public interface ISessionService {
	Task<CreateSessionResult> CreateSessionForUser(UserNs.User user);
}

public class SessionService : ISessionService {
	private readonly MainApiDbContext _dbContext;
	private readonly IOptions<AppSettings> _appSettings;

	public SessionService(MainApiDbContext dbContext, IOptions<AppSettings> appSettings) {
		_dbContext = dbContext;
		_appSettings = appSettings;
	}

	public async Task<CreateSessionResult> CreateSessionForUser(UserNs.User user) {
		if (user.Id == Guid.Empty) {
			return new CreateSessionResult.Failure("User ID is required", ResponseKeys.UserIdRequired);
		}

		var session = new Session {
			UserId = user.Id,
			Token = CryptoUtils.NewToken(),
			ExpiresAt = DateTime.UtcNow.AddDays(_appSettings.Value.SESSION_EXPIRY_DAYS),
		};

		var result = await _dbContext.Session.AddAsync(session);
		await _dbContext.SaveChangesAsync();

		return new CreateSessionResult.Success(result.Entity);
	}
}
