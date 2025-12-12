using MainApi.Src.Lib;
using MainApi.Src.Modules.Shared.Auth;
using MainApi.Src.Modules.Shared.Users;

using Microsoft.Extensions.Options;

namespace MainApi.Src.Infrastructure.Messaging.Email;

public interface IEmailService {
	Task SendWelComeEmailAsync(string email, string token);
	Task SendEmailVerificationRequestAsync(string email, string token);
	Task SendEmailVerifiedNotificationAsync(string email);
	Task SendStaffWelcomeEmailAsync(string email, string token);
	Task SendJoinedStaffNotificationEmailAsync(string email);
	Task SendResetPasswordRequestEmailAsync(string email, string token);
	Task SendPasswordResetNotificationEmailAsync(string email);
	Task SendInvitationToJoinStaffEmailAsync(string email, string token);
	Task SendTenantInvitationEmailAsync(string email, string tenantName, string token, AccountLevel level);
}

public class EmailService : IEmailService {
	private readonly IEmailSender _emailSender;
	private readonly IOptions<AppSettings> _appSettings;
	private readonly ILogger<EmailService> _logger;

	private static string CreateHtmlLink(string url, string text) {
		string linkStyle = "text-decoration: underline; color: #007bff;";
		return $"<a href=\"{url}\" style=\"{linkStyle}\">{text}</a>";
	}

	public EmailService(
		IEmailSender emailSender,
		ILogger<EmailService> logger,
		IOptions<AppSettings> appSettings
	) {
		_emailSender = emailSender;
		_logger = logger;
		_appSettings = appSettings;
	}

	// used when a staff member is created and user is new, hence needs to verify email
	public async Task SendStaffWelcomeEmailAsync(string email, string token) {
		var verificationUrl = AuthUtils.CreateVerificationUrl(token, email);
		await _emailSender.SendAsync(new EmailRequest {
			To = email,
			From = $"{_appSettings.Value.DEFAULT_EMAIL_SENDER_NAME} <{_appSettings.Value.DEFAULT_EMAIL_SENDER_EMAIL}>",
			Subject = $"Welcome to {_appSettings.Value.APP_NAME}",
			HtmlBody = $"""
				You have been added as a staff member to {_appSettings.Value.APP_NAME}.
				<br />
				Please verify your email by clicking the link below:
				<br />
				{CreateHtmlLink(verificationUrl, "Verify your email")}
				"""
		});
	}

	// used when a staff membership is added to an existing user: user already existed, hence no need to verify email
	public async Task SendJoinedStaffNotificationEmailAsync(string email) {
		await _emailSender.SendAsync(new EmailRequest {
			To = email,
			From = $"{_appSettings.Value.DEFAULT_EMAIL_SENDER_NAME} <{_appSettings.Value.DEFAULT_EMAIL_SENDER_EMAIL}>",
			Subject = $"You have been added as a staff member",
			HtmlBody = $"""
				You have been added as a staff member to {_appSettings.Value.APP_NAME}.
				<br />
				You can continue to use {_appSettings.Value.APP_NAME} by {CreateHtmlLink(AuthUtils.GetFrontendLoginPageUrl(), "logging in")}
				"""
		});
	}

	// used when a user is created and needs to verify email
	public async Task SendWelComeEmailAsync(string email, string token) {
		var verificationUrl = AuthUtils.CreateVerificationUrl(token, email);
		await _emailSender.SendAsync(new EmailRequest {
			To = email,
			From = $"{_appSettings.Value.DEFAULT_EMAIL_SENDER_NAME} <{_appSettings.Value.DEFAULT_EMAIL_SENDER_EMAIL}>",
			Subject = $"Welcome to {_appSettings.Value.APP_NAME}",
			HtmlBody = $"""
				Welcome to {_appSettings.Value.APP_NAME}!
				<br />
				Please verify your email by clicking the link below:
				<br />
				{CreateHtmlLink(verificationUrl, "Verify your email")}
				"""
		});
	}

	// used when a user requests to verify his/her email
	public async Task SendEmailVerificationRequestAsync(string email, string token) {
		var verificationUrl = AuthUtils.CreateVerificationUrl(token, email);
		await _emailSender.SendAsync(new EmailRequest {
			To = email,
			From = $"{_appSettings.Value.DEFAULT_EMAIL_SENDER_NAME} <{_appSettings.Value.DEFAULT_EMAIL_SENDER_EMAIL}>",
			Subject = $"Your email verification request",
			HtmlBody = $"""
				You have requested to verify your email address.
				<br />
				Please verify your email by clicking the link below:
				<br />
				{CreateHtmlLink(verificationUrl, "Verify your email")}
				"""
		});
	}

	// used when a user's email is verified following the verification process
	public async Task SendEmailVerifiedNotificationAsync(string email) {
		await _emailSender.SendAsync(new EmailRequest {
			To = email,
			From = $"{_appSettings.Value.DEFAULT_EMAIL_SENDER_NAME} <{_appSettings.Value.DEFAULT_EMAIL_SENDER_EMAIL}>",
			Subject = $"Your email has been verified",
			HtmlBody = $"""
				Your email has been successfully verified.
				<br />
				You can continue to use {_appSettings.Value.APP_NAME} by {CreateHtmlLink(AuthUtils.GetFrontendLoginPageUrl(), "logging in")}
				"""
		});
	}

	public async Task SendResetPasswordRequestEmailAsync(string email, string token) {
		var resetPasswordUrl = AuthUtils.CreateResetPasswordUrl(token, email);
		await _emailSender.SendAsync(new EmailRequest {
			To = email,
			From = $"{_appSettings.Value.DEFAULT_EMAIL_SENDER_NAME} <{_appSettings.Value.DEFAULT_EMAIL_SENDER_EMAIL}>",
			Subject = $"Your password reset request",
			HtmlBody = $"""
				You have requested to reset your password.
				<br />
				Please reset your password by clicking the link below:
				<br />
				{CreateHtmlLink(resetPasswordUrl, "Reset your password")}
				"""
		});
	}

	// used when a user's password is reset following the reset process
	public async Task SendPasswordResetNotificationEmailAsync(string email) {
		await _emailSender.SendAsync(new EmailRequest {
			To = email,
			From = $"{_appSettings.Value.DEFAULT_EMAIL_SENDER_NAME} <{_appSettings.Value.DEFAULT_EMAIL_SENDER_EMAIL}>",
			Subject = $"Your password has been reset",
			HtmlBody = $"""
				Your password has been successfully reset.
				<br />
				You can continue to use {_appSettings.Value.APP_NAME} by {CreateHtmlLink(AuthUtils.GetFrontendLoginPageUrl(), "logging in")}
			"""
		});
	}

	// used when a user is invited to join the staff of our app
	public async Task SendInvitationToJoinStaffEmailAsync(string email, string token) {
		var invitationUrl = AuthUtils.CreateAcceptInvitationUrl(token, email);

		await _emailSender.SendAsync(new EmailRequest {
			To = email,
			From = $"{_appSettings.Value.DEFAULT_EMAIL_SENDER_NAME} <{_appSettings.Value.DEFAULT_EMAIL_SENDER_EMAIL}>",
			Subject = $"You have been invited to join the staff of {_appSettings.Value.APP_NAME}",
			HtmlBody = $"""
				You have been invited to join {_appSettings.Value.APP_NAME} as a staff member.
				<br />
				Please accept the invitation to join the staff by clicking the link below:
				<br />
				{CreateHtmlLink(invitationUrl, "Accept the invitation")}
				"""
		});
	}

	// used when a user is invited to join a tenant
	public async Task SendTenantInvitationEmailAsync(
		string email,
		string tenantName,
		string token,
		AccountLevel level
	) {
		var invitationUrl = AuthUtils.CreateAcceptInvitationUrl(token, email);
		var accountLevelText = level == AccountLevel.Admin ? "admin" : "user";

		await _emailSender.SendAsync(new EmailRequest {
			To = email,
			From = $"{_appSettings.Value.DEFAULT_EMAIL_SENDER_NAME} <{_appSettings.Value.DEFAULT_EMAIL_SENDER_EMAIL}>",
			Subject = $"You have been invited to join {tenantName} on {_appSettings.Value.APP_NAME}",
			HtmlBody = $"""
				You have been invited to join {tenantName} on {_appSettings.Value.APP_NAME} as a {accountLevelText}.
				<br />
				Please accept the invitation by clicking the link below:
				<br />
				{CreateHtmlLink(invitationUrl, "Accept the invitation")}
				"""
		});
	}
}
