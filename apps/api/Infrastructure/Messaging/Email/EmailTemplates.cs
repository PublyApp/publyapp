using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Users.Entities;
namespace PublyApp.Api.Infrastructure.Messaging.Email;

/// <summary>
/// Renders the transactional-email <see cref="EmailRequest"/> for each kind, in ONE
/// place. Shared by <see cref="EmailService"/> (inline sends) and the email job
/// handlers (which freeze the rendered request into <c>email_prepared_sends</c> and
/// resend the stored bytes byte-identically — design §4.5, F7). Extracting the
/// rendering here keeps the on-the-wire output identical to the shipped
/// <see cref="EmailService"/> methods, so the old dispatcher's output never drifts.
/// </summary>
public static class EmailTemplates {
	private static string CreateHtmlLink(string url, string text) {
		string linkStyle = "text-decoration: underline; color: #007bff;";
		return $"<a href=\"{url}\" style=\"{linkStyle}\">{text}</a>";
	}

	private static string SenderFrom(AppEnvironment env) {
		return $"{env.DEFAULT_EMAIL_SENDER_NAME} <{env.DEFAULT_EMAIL_SENDER_EMAIL}>";
	}

	public static EmailRequest TenantInvitation(
		string email,
		string tenantName,
		string token,
		AccountLevel level
	) {
		var env = AppEnvironment.Instance;
		var invitationUrl = AuthUtils.CreateAcceptInvitationUrl(token, email);
		var accountLevelText = level == AccountLevel.Admin ? "admin" : "user";

		return new EmailRequest {
			To = email,
			From = SenderFrom(env),
			Subject = $"You have been invited to join {tenantName} on {env.APP_NAME}",
			HtmlBody = $"""
				You have been invited to join {tenantName} on {env.APP_NAME} as a {accountLevelText}.
				<br />
				Please accept the invitation by clicking the link below:
				<br />
				{CreateHtmlLink(invitationUrl, "Accept the invitation")}
				"""
		};
	}

	public static EmailRequest StaffInvitation(string email, string token) {
		var env = AppEnvironment.Instance;
		var invitationUrl = AuthUtils.CreateAcceptInvitationUrl(token, email);

		return new EmailRequest {
			To = email,
			From = SenderFrom(env),
			Subject = $"You have been invited to join the staff of {env.APP_NAME}",
			HtmlBody = $"""
				You have been invited to join {env.APP_NAME} as a staff member.
				<br />
				Please accept the invitation to join the staff by clicking the link below:
				<br />
				{CreateHtmlLink(invitationUrl, "Accept the invitation")}
				"""
		};
	}

	public static EmailRequest PasswordReset(string email, string token) {
		var env = AppEnvironment.Instance;
		var resetPasswordUrl = AuthUtils.CreateResetPasswordUrl(token, email);

		return new EmailRequest {
			To = email,
			From = SenderFrom(env),
			Subject = $"Your password reset request",
			HtmlBody = $"""
				You have requested to reset your password.
				<br />
				Please reset your password by clicking the link below:
				<br />
				{CreateHtmlLink(resetPasswordUrl, "Reset your password")}
				"""
		};
	}

	public static EmailRequest EmailVerificationWelcome(string email, string token) {
		var env = AppEnvironment.Instance;
		var verificationUrl = AuthUtils.CreateVerificationUrl(token, email);

		return new EmailRequest {
			To = email,
			From = SenderFrom(env),
			Subject = $"Welcome to {env.APP_NAME}",
			HtmlBody = $"""
				Welcome to {env.APP_NAME}.
				<br />
				Please verify your email by clicking the link below:
				<br />
				{CreateHtmlLink(verificationUrl, "Verify your email")}
				"""
		};
	}

	public static EmailRequest EmailVerificationRequest(string email, string token) {
		var env = AppEnvironment.Instance;
		var verificationUrl = AuthUtils.CreateVerificationUrl(token, email);

		return new EmailRequest {
			To = email,
			From = SenderFrom(env),
			Subject = $"Your email verification request",
			HtmlBody = $"""
				You have requested to verify your email address.
				<br />
				Please verify your email by clicking the link below:
				<br />
				{CreateHtmlLink(verificationUrl, "Verify your email")}
				"""
		};
	}

	// #291: rendered for `email.staff-joined-notification.v1`. Byte-identical to the
	// shipped `EmailService.SendJoinedStaffNotificationEmailAsync` body so the legacy
	// in-process send and the job-queue send produce the same on-the-wire message —
	// no drift between the two paths while both were live, and no drift between the
	// historical send and the durable job it replaces.
	public static EmailRequest StaffJoinedNotification(string email) {
		var env = AppEnvironment.Instance;
		var loginLink = CreateHtmlLink(AuthUtils.GetFrontendLoginPageUrl(), "logging in");

		return new EmailRequest {
			To = email,
			From = SenderFrom(env),
			Subject = $"You have been added as a staff member",
			HtmlBody = $"""
				You have been added as a staff member to {env.APP_NAME}.
				<br />
				You can continue to use {env.APP_NAME} by {loginLink}
				"""
		};
	}
}
