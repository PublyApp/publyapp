namespace MainApi.Src.Features.Common.Email;

public interface IEmailService
{
	Task SendEmail(string email, string subject, string body);
}

public class EmailService : IEmailService
{
	private readonly ILogger<EmailService> _logger;

	public EmailService(ILogger<EmailService> logger)
	{
		_logger = logger;
	}

	public async Task SendEmail(string email, string subject, string body)
	{
		// TODO: Implement email sending
		await Task.Delay(1000);
		_logger.LogWarning("Simulate sending email {@EmailData}", new { email, subject, body });
	}
}
