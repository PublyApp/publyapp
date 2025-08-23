using MainApi.Src.Features.Common.Account;

namespace MainApi.Src.Lib;

public interface IAuthContext
{
	string? SessionToken { get; set; }
	string? UserId { get; set; }

	bool IsAuthenticated { get; }

	UserAccountStaff? AccountStaff { get; set; }
}

public class AuthContext : IAuthContext
{
	public string? SessionToken { get; set; }
	public string? UserId { get; set; }

	public bool IsAuthenticated
	{
		get
		{
			return !string.IsNullOrEmpty(SessionToken) && !string.IsNullOrEmpty(UserId);
		}
	}

	public UserAccountStaff? AccountStaff { get; set; }
}
