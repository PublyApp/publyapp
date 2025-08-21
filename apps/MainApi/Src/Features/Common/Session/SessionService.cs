using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using Microsoft.Extensions.Options;
using UserNs = MainApi.Src.Features.Common.User;

namespace MainApi.Src.Features.Common.Session;

public interface ISessionService
{
	Task<(bool success, string message, string key, Session? session)> CreateSessionForUser(UserNs.User user);
}

public class SessionService : ISessionService
{
	private readonly MainApiDbContext _dbContext;
	private readonly IOptions<AppSettings> _config;

	private readonly ILogger<SessionService> _logger;

	public SessionService(MainApiDbContext dbContext, IOptions<AppSettings> config, ILogger<SessionService> logger)
	{
		_dbContext = dbContext;
		_config = config;
		_logger = logger;
	}

	public async Task<(bool success, string message, string key, Session? session)> CreateSessionForUser(UserNs.User user)
	{
		if (string.IsNullOrEmpty(user.Id))
		{
			return (success: false, message: "User ID is required", key: "user-id-required", session: null);
		}

		_logger.LogDebug("🎯🎯🎯 SESSION EXPIRY DAYS: {expiryDays}", _config.Value.SESSION_EXPIRY_DAYS);

		var session = new Session
		{
			UserId = user.Id,
			Token = Utils.NewToken(),
			ExpiresAt = DateTime.UtcNow.AddDays(_config.Value.SESSION_EXPIRY_DAYS),
		};

		var result = await _dbContext.Session.AddAsync(session);
		await _dbContext.SaveChangesAsync();

		return (success: true, message: "Session created successfully", key: "session-created-successfully", session: result.Entity);
	}
}
