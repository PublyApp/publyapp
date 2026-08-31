#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace PublyApp.Api.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Authentication routes (anonymous)
	/// </summary>
	public static class Auth {
		public const string Root = "/auth";
		public const string Login = $"{Root}/login";
		public const string Register = $"{Root}/register";
		public const string GetUserAuthData = $"{Root}/user-auth-data";
		public const string GetScopeAuthData = $"{Root}/scope-auth-data";
		public const string GetUserTenants = $"{Root}/user-tenants";
		public const string VerifyEmailRequest = $"{Root}/verify-email-request";
		public const string GetVerificationLink = $"{Root}/verification-link";
		public const string GetRedirectCode = $"{Root}/redirect-code";
		public const string CheckEmailVerificationToken = $"{Root}/check-email-verification-token";
		public const string CheckResetPasswordToken = $"{Root}/check-reset-password-token";
		public const string RequestPasswordReset = $"{Root}/request-password-reset";
		public const string ResetPassword = $"{Root}/reset-password";
		public const string GetUserTenantsForPicker = $"{Root}/tenants-for-picker";
		public const string RevokeSession = $"{Root}/revoke-session";
	}
}
