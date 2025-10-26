using Resend;

namespace MainApi.Src.Lib.Email;

// Adapts Resend SDK to IEmailSender interface
public class ResendEmailAdapter : IEmailSender {
	private readonly IResend _resendClient;
	private readonly ILogger<ResendEmailAdapter> _logger;

	public ResendEmailAdapter(IResend resendClient, ILogger<ResendEmailAdapter> logger) {
		_resendClient = resendClient;
		_logger = logger;
	}

	public async Task<EmailResult> SendAsync(EmailRequest request) {
		// Translate from EmailRequest → Resend's model
		var resendMessage = new Resend.EmailMessage {
			From = request.From,
			To = request.To,
			Subject = request.Subject,
			HtmlBody = request.HtmlBody
		};

		var response = await _resendClient.EmailSendAsync(resendMessage);

		if (response.Exception is not null) {
			return new EmailResult {
				Success = false,
				ErrorMessage = response.Exception.Message,
			};
		}

		// Translate from Resend's response → EmailResult
		return new EmailResult {
			Success = true,
		};
	}
}
