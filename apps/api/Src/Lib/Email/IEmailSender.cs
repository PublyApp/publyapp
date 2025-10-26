namespace MainApi.Src.Lib.Email;

// Simpler version for basic use cases
public class EmailRequest {
	public required string To { get; set; }
	public required string From { get; set; }
	public required string Subject { get; set; }
	public required string HtmlBody { get; set; }
}

public class EmailResult {
	public bool Success { get; set; }
	public string? MessageId { get; set; }
	public string? ErrorMessage { get; set; }
}

public interface IEmailSender {
	Task<EmailResult> SendAsync(EmailRequest request);
}
