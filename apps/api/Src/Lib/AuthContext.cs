using MainApi.Src.Features.Common.Account;

namespace MainApi.Src.Lib;

public interface IAuthContext {
	string? SessionToken { get; set; }
	Guid? UserId { get; set; }

	bool IsAuthenticated { get; }

	UserAccount? AccountStaff { get; set; }
}

public class AuthContext : IAuthContext {
	public string? SessionToken { get; set; }
	public Guid? UserId { get; set; }

	public bool IsAuthenticated {
		get {
			return !string.IsNullOrEmpty(SessionToken) && UserId.HasValue;
		}
	}

	public UserAccount? AccountStaff { get; set; }
}
