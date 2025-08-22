namespace MainApi.Src.Lib;

public interface IAuthContext
{
	string? SessionToken { get; set; }
	string? UserId { get; set; }

	bool IsAuthenticated { get; }
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
}
