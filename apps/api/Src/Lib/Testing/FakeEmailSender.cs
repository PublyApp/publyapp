namespace MainApi.Src.Lib.Testing;

using System.Collections.Concurrent;

using MainApi.Src.Infrastructure.Messaging.Email;

/// <summary>
/// Fake email sender for tests. Captures emails instead
/// of sending.
/// Thread-safe: uses ConcurrentBag for parallel safety.
///
/// IMPORTANT: Registered as a singleton per ApiFixture
/// (per test class). Emails persist across tests within
/// the same class unless you call Clear() or DrainAll().
/// Always call Clear() at the start of tests that assert
/// on email state.
/// </summary>
public sealed class FakeEmailSender : IEmailSender {
	private readonly ConcurrentBag<EmailRequest>
		_sentEmails = [];

	public IReadOnlyCollection<EmailRequest> SentEmails =>
		_sentEmails;

	public Task<EmailResult> SendAsync(
		EmailRequest request
	) {
		_sentEmails.Add(request);
		return Task.FromResult(new EmailResult {
			Success = true,
			MessageId = Guid.NewGuid().ToString()
		});
	}

	/// <summary>
	/// Clears captured emails.
	/// Call at the start of tests that assert on emails.
	/// </summary>
	public void Clear() => _sentEmails.Clear();

	/// <summary>
	/// Returns all captured emails and clears the bag.
	/// Safe for sequential tests (xUnit runs tests within
	/// a class sequentially).
	/// </summary>
	public IReadOnlyList<EmailRequest> DrainAll() {
		var snapshot = _sentEmails.ToArray();
		_sentEmails.Clear();
		return snapshot;
	}
}
