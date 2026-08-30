using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Users.Entities;
namespace PublyApp.Api.Infrastructure.Messaging.Email;

public interface IEmailService {
	Task<EmailSendReceipt> SendWelComeEmailAsync(string email, string token);
	Task<EmailSendReceipt> SendEmailVerificationRequestAsync(string email, string token);
	Task<EmailSendReceipt> SendEmailVerifiedNotificationAsync(string email);
	Task<EmailSendReceipt> SendStaffWelcomeEmailAsync(string email, string token);
	Task<EmailSendReceipt> SendJoinedStaffNotificationEmailAsync(string email);
	Task<EmailSendReceipt> SendResetPasswordRequestEmailAsync(string email, string token);
	Task<EmailSendReceipt> SendPasswordResetNotificationEmailAsync(string email);
	Task<EmailSendReceipt> SendInvitationToJoinStaffEmailAsync(string email, string token);
	Task<EmailSendReceipt> SendTenantInvitationEmailAsync(
		string email,
		string tenantName,
		string token,
		AccountLevel level
	);
}

/// <summary>
/// High-level transactional-email API. Corrected F3 contract (design §5.4): every method
/// now RETURNS an <see cref="EmailSendReceipt"/> (provider message id) and a provider
/// failure THROWS a classified <see cref="EmailProviderException"/> — the shipped
/// result-swallowing bug (a rejected send indistinguishable from a delivered one) is
/// gone. Callers that still send inline (verification, welcome, notifications) get the
/// same fail-loud contract; the invitation/password-reset kinds now ride the job queue
/// via their handlers (§5.4), which render through <see cref="EmailTemplates"/> and send
/// via <see cref="IEmailSender"/> directly with an idempotency key.
/// </summary>
public class EmailService : IEmailService {
	private readonly IEmailSender _emailSender;

	private static string CreateHtmlLink(string url, string text) {
		string linkStyle = "text-decoration: underline; color: #007bff;";
		return $"<a href=\"{url}\" style=\"{linkStyle}\">{text}</a>";
	}

	public EmailService(
		IEmailSender emailSender
	) {
		_emailSender = emailSender;
	}

	// used when a staff member is created and user is new, hence needs to verify email
	public async Task<EmailSendReceipt> SendStaffWelcomeEmailAsync(string email, string token) {
		return await _emailSender.SendAsync(EmailTemplates.EmailVerificationWelcome(email, token));
	}

	// Used when a staff membership is added to an existing user, so verification is
	// unnecessary.
	public async Task<EmailSendReceipt> SendJoinedStaffNotificationEmailAsync(string email) {
		var env = AppEnvironment.Instance;
		var loginLink = CreateHtmlLink(AuthUtils.GetFrontendLoginPageUrl(), "logging in");
		return await _emailSender.SendAsync(new EmailRequest {
			To = email,
			From = $"{env.DEFAULT_EMAIL_SENDER_NAME} <{env.DEFAULT_EMAIL_SENDER_EMAIL}>",
			Subject = $"You have been added as a staff member",
			HtmlBody = $"""
				You have been added as a staff member to {env.APP_NAME}.
				<br />
				You can continue to use {env.APP_NAME} by {loginLink}
				"""
		});
	}

	// used when a user is created and needs to verify email
	public async Task<EmailSendReceipt> SendWelComeEmailAsync(string email, string token) {
		return await _emailSender.SendAsync(EmailTemplates.EmailVerificationWelcome(email, token));
	}

	// used when a user requests to verify his/her email
	public async Task<EmailSendReceipt> SendEmailVerificationRequestAsync(string email, string token) {
		return await _emailSender.SendAsync(EmailTemplates.EmailVerificationRequest(email, token));
	}

	// used when a user's email is verified following the verification process
	public async Task<EmailSendReceipt> SendEmailVerifiedNotificationAsync(string email) {
		var env = AppEnvironment.Instance;
		var loginLink = CreateHtmlLink(AuthUtils.GetFrontendLoginPageUrl(), "logging in");
		return await _emailSender.SendAsync(new EmailRequest {
			To = email,
			From = $"{env.DEFAULT_EMAIL_SENDER_NAME} <{env.DEFAULT_EMAIL_SENDER_EMAIL}>",
			Subject = $"Your email has been verified",
			HtmlBody = $"""
				Your email has been successfully verified.
				<br />
				You can continue to use {env.APP_NAME} by {loginLink}
				"""
		});
	}

	public async Task<EmailSendReceipt> SendResetPasswordRequestEmailAsync(
		string email,
		string token
	) {
		return await _emailSender.SendAsync(EmailTemplates.PasswordReset(email, token));
	}

	// used when a user's password is reset following the reset process
	public async Task<EmailSendReceipt> SendPasswordResetNotificationEmailAsync(string email) {
		var env = AppEnvironment.Instance;
		var loginLink = CreateHtmlLink(AuthUtils.GetFrontendLoginPageUrl(), "logging in");
		return await _emailSender.SendAsync(new EmailRequest {
			To = email,
			From = $"{env.DEFAULT_EMAIL_SENDER_NAME} <{env.DEFAULT_EMAIL_SENDER_EMAIL}>",
			Subject = $"Your password has been reset",
			HtmlBody = $"""
				Your password has been successfully reset.
				<br />
				You can continue to use {env.APP_NAME} by {loginLink}
			"""
		});
	}

	// used when a user is invited to join the staff of our app
	public async Task<EmailSendReceipt> SendInvitationToJoinStaffEmailAsync(
		string email,
		string token
	) {
		return await _emailSender.SendAsync(EmailTemplates.StaffInvitation(email, token));
	}

	// used when a user is invited to join a tenant
	public async Task<EmailSendReceipt> SendTenantInvitationEmailAsync(
		string email,
		string tenantName,
		string token,
		AccountLevel level
	) {
		return await _emailSender.SendAsync(
			EmailTemplates.TenantInvitation(email, tenantName, token, level)
		);
	}
}
