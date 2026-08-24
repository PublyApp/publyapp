namespace PublyApp.Api.Modules.SocialAccounts.Entities;

// Active = 10, NeedsReconnect = 20, Revoked = 30 (Epic C §2).
public enum SocialAccountStatus {
	Active = 10,
	NeedsReconnect = 20,
	Revoked = 30,
}
