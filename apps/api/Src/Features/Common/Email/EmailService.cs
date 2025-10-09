using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;

namespace MainApi.Src.Features.Common.Email;

public interface IEmailService {
	Task SendEmail(string email, string subject, string body);
	Task SendVerificationMail(string email, string token);
}

public class EmailService : IEmailService {
	private readonly ILogger<EmailService> _logger;

	public EmailService(ILogger<EmailService> logger) {
		_logger = logger;
	}

	public async Task SendEmail(string email, string subject, string body) {
		// TODO: Implement email sending
		await Task.Delay(1000);
		_logger.LogWarning("Simulate sending email {@EmailData}", new { email, subject, body });
	}

	public static string CreateVerificationLink(string token, string email) {
		return $"{AppEnvironment.FRONT_URL}/verify-email?token={token}&id={CryptoUtils.EncryptString(email)}";
	}

	public static string CreateResetPasswordLink(string token, string email) {
		return $"{AppEnvironment.FRONT_URL}/reset-password?token={token}&id={CryptoUtils.EncryptString(email)}";
	}

	public async Task SendVerificationMail(string email, string token) {
		await SendEmail(
				email,
				"Email Verification",
				"Please verify your email by clicking the link below:\n\t👉" + CreateVerificationLink(token, email)
			);
	}
}
