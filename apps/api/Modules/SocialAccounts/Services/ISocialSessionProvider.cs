namespace PublyApp.Api.Modules.SocialAccounts.Services;

// Exact contract pinned by the D1 brief (lane wt-641 builds the real provider;
// the two lanes converge at rebase). Do not reshape here.
public interface ISocialSessionProvider {
	Task<SocialSessionResult> OpenSessionAsync(Guid socialAccountId, CancellationToken cancellationToken);
}

public sealed record SocialSession(string Did, string Handle, string AccessJwt, string PdsHost);

public abstract record SocialSessionResult {
	public sealed record Opened(SocialSession Session) : SocialSessionResult;
	public sealed record AccountFailure(string Cause) : SocialSessionResult;
	public sealed record Transient(string Cause) : SocialSessionResult;
}
