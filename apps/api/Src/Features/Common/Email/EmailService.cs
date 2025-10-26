using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Email;
using Microsoft.Extensions.Options;

namespace MainApi.Src.Features.Common.Email;

public interface IEmailService {
	Task SendWelComeEmail(string email, string token);
	Task SendEmailVerificationRequest(string email, string token);
	Task SendEmailVerifiedNotification(string email);
	Task SendStaffWelcomeEmail(string email, string token);
	Task SendJoinedStaffNotificationEmail(string email);
	Task SendResetPasswordRequestEmail(string email, string token);
	Task SendPasswordResetNotificationEmail(string email);
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
	public async Task SendStaffWelcomeEmail(string email, string token) {
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
	public async Task SendJoinedStaffNotificationEmail(string email) {
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
	public async Task SendWelComeEmail(string email, string token) {
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
	public async Task SendEmailVerificationRequest(string email, string token) {
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
	public async Task SendEmailVerifiedNotification(string email) {
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

	public async Task SendResetPasswordRequestEmail(string email, string token) {
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

	public async Task SendPasswordResetNotificationEmail(string email) {
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
}
