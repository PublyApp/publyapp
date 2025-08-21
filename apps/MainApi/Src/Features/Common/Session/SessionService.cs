using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using Microsoft.Extensions.Options;
using UserNs = MainApi.Src.Features.Common.User;

namespace MainApi.Src.Features.Common.Session;

public abstract record CreateSessionResult
{
    public sealed record Success(Session Session) : CreateSessionResult;
    public sealed record Failure(string Message, string Key) : CreateSessionResult;
}

public interface ISessionService
{
	Task<CreateSessionResult> CreateSessionForUser(UserNs.User user);
}

public class SessionService : ISessionService
{
	private readonly MainApiDbContext _dbContext;
	private readonly IOptions<AppSettings> _config;

	public SessionService(MainApiDbContext dbContext, IOptions<AppSettings> config)
	{
		_dbContext = dbContext;
		_config = config;
	}

	public async Task<CreateSessionResult> CreateSessionForUser(UserNs.User user)
	{
		if (string.IsNullOrEmpty(user.Id))
		{
			return new CreateSessionResult.Failure("User ID is required", "user-id-required");
		}

		var session = new Session
		{
			UserId = user.Id,
			Token = Utils.NewToken(),
			ExpiresAt = DateTime.UtcNow.AddDays(_config.Value.SESSION_EXPIRY_DAYS),
		};

		var result = await _dbContext.Session.AddAsync(session);
		await _dbContext.SaveChangesAsync();

		return new CreateSessionResult.Success(result.Entity);
	}
}
