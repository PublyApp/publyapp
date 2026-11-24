using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Auth.Utils;
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
		string token
	);
}

/// <summary>
/// The transactional-email service every caller goes through (ports-and-adapters rule):
/// it renders the templates, holds the single <see cref="IEmailSender"/> port, and
/// forwards the provider failure contract unchanged. Callers — including the email job
/// handlers — never inject the port themselves. The job handlers render through
/// <see cref="RenderEmailVerification"/> and friends, freeze the envelope, then send it
/// through <see cref="SendAsync"/> with the job-stable idempotency key.
/// </summary>
public class EmailService : IEmailService {
	private readonly IEmailSender _EmailSender;

	private static string _CreateHtmlLink(string url, string text) {
		string linkStyle = "text-decoration: underline; color: #007bff;";
		return $"<a href=\"{url}\" style=\"{linkStyle}\">{text}</a>";
	}

	public EmailService(
		IEmailSender emailSender
	) {
		this._EmailSender = emailSender;
	}

	// The only send path: a prepared envelope plus the optional provider idempotency key.
	public Task<EmailSendReceipt> SendAsync(
		EmailRequest request,
		string? idempotencyKey = null,
		CancellationToken cancellationToken = default
	) {
		return this._EmailSender.SendAsync(request, idempotencyKey, cancellationToken);
	}

	public EmailRequest RenderEmailVerification(string email, string token, bool isWelcome) {
		return isWelcome
			? EmailTemplates.EmailVerificationWelcome(email, token)
			: EmailTemplates.EmailVerificationRequest(email, token);
	}

	public EmailRequest RenderPasswordReset(string email, string token) {
		return EmailTemplates.PasswordReset(email, token);
	}

	public EmailRequest RenderStaffInvitation(string email, string token) {
		return EmailTemplates.StaffInvitation(email, token);
	}

	public EmailRequest RenderTenantInvitation(string email, string tenantName, string token) {
		return EmailTemplates.TenantInvitation(email, tenantName, token);
	}

	public EmailRequest RenderStaffJoinedNotification(string email) {
		return EmailTemplates.StaffJoinedNotification(email);
	}

	// used when a staff member is created and user is new, hence needs to verify email
	public Task<EmailSendReceipt> SendStaffWelcomeEmailAsync(string email, string token) {
		return this.SendAsync(EmailTemplates.EmailVerificationWelcome(email, token));
	}

	// Used when a staff membership is added to an existing user, so verification is
	// unnecessary.
	public Task<EmailSendReceipt> SendJoinedStaffNotificationEmailAsync(string email) {
		return this.SendAsync(EmailTemplates.StaffJoinedNotification(email));
	}

	// used when a user is created and needs to verify email
	public Task<EmailSendReceipt> SendWelComeEmailAsync(string email, string token) {
		return this.SendAsync(EmailTemplates.EmailVerificationWelcome(email, token));
	}

	// used when a user requests to verify his/her email
	public Task<EmailSendReceipt> SendEmailVerificationRequestAsync(string email, string token) {
		return this.SendAsync(EmailTemplates.EmailVerificationRequest(email, token));
	}

	// used when a user's email is verified following the verification process
	public Task<EmailSendReceipt> SendEmailVerifiedNotificationAsync(string email) {
		var env = AppEnvironment.Instance;
		var loginLink = EmailService._CreateHtmlLink(AuthUtils.GetFrontendLoginPageUrl(), "logging in");
		return this.SendAsync(new EmailRequest {
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

	public Task<EmailSendReceipt> SendResetPasswordRequestEmailAsync(
		string email,
		string token
	) {
		return this.SendAsync(EmailTemplates.PasswordReset(email, token));
	}

	// used when a user's password is reset following the reset process
	public Task<EmailSendReceipt> SendPasswordResetNotificationEmailAsync(string email) {
		var env = AppEnvironment.Instance;
		var loginLink = EmailService._CreateHtmlLink(AuthUtils.GetFrontendLoginPageUrl(), "logging in");
		return this.SendAsync(new EmailRequest {
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
	public Task<EmailSendReceipt> SendInvitationToJoinStaffEmailAsync(
		string email,
		string token
	) {
		return this.SendAsync(EmailTemplates.StaffInvitation(email, token));
	}

	// used when a user is invited to join a tenant
	public Task<EmailSendReceipt> SendTenantInvitationEmailAsync(
		string email,
		string tenantName,
		string token
	) {
		return this.SendAsync(EmailTemplates.TenantInvitation(email, tenantName, token));
	}
}
