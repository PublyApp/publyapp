#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace PublyApp.Api.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Authentication routes (anonymous)
	/// </summary>
	public static class Auth {
		public const string Root = "/auth";
		public const string Login = $"{Routes.Auth.Root}/login";
		public const string Register = $"{Routes.Auth.Root}/register";
		public const string GetUserAuthData = $"{Routes.Auth.Root}/user-auth-data";
		public const string GetScopeAuthData = $"{Routes.Auth.Root}/scope-auth-data";
		public const string GetUserTenants = $"{Routes.Auth.Root}/user-tenants";
		public const string VerifyEmailRequest = $"{Routes.Auth.Root}/verify-email-request";
		public const string GetVerificationLink = $"{Routes.Auth.Root}/verification-link";
		public const string GetRedirectCode = $"{Routes.Auth.Root}/redirect-code";
		public const string CheckEmailVerificationToken = $"{Routes.Auth.Root}/check-email-verification-token";
		public const string CheckResetPasswordToken = $"{Routes.Auth.Root}/check-reset-password-token";
		public const string RequestPasswordReset = $"{Routes.Auth.Root}/request-password-reset";
		public const string ResetPassword = $"{Routes.Auth.Root}/reset-password";
		public const string GetUserTenantsForPicker = $"{Routes.Auth.Root}/tenants-for-picker";
		public const string RevokeSession = $"{Routes.Auth.Root}/revoke-session";
	}
}
