using System.Collections.Concurrent;

using PublyApp.Api.Infrastructure.Messaging.Email;

namespace PublyApp.Api.Lib.Testing.Fakes {
	/// <summary>
	/// Fake email sender for tests, on the corrected F3 contract: SendAsync RETURNS an
	/// <see cref="EmailSendReceipt"/> and can THROW a classified
	/// <see cref="EmailProviderException"/> (via <see cref="FailWith"/>) so email-job
	/// handler specs can drive the transient/permanent outcome mapping. It records each
	/// send (request + job-stable idempotency key), letting specs prove byte-identical
	/// idempotent resends (§4.5).
	///
	/// IMPORTANT: registered as a singleton per ApiFixture. Emails persist across every
	/// test method that shares the same ApiFixture instance. Email-observing specs should
	/// not share an ApiFixture across test methods (see ApiFixture.GetFakeEmailSender) —
	/// own it exclusively per test method instead of resetting a shared one with Clear().
	/// </summary>
	public sealed class FakeEmailSender : IEmailSender {
		public sealed record SentEmail(EmailRequest Request, string? IdempotencyKey, string MessageId);

		private readonly ConcurrentQueue<SentEmail> _sent = new();

		public IReadOnlyCollection<EmailRequest> SentEmails {
			get { return _sent.Select(s => s.Request).ToList(); }
		}

		/// <summary>The full send records (request + idempotency key + returned message id).</summary>
		public IReadOnlyCollection<SentEmail> Sends {
			get { return _sent.ToList(); }
		}

		/// <summary>
		/// When set and it returns a non-null exception for a request, SendAsync throws
		/// it instead of recording the send — used to exercise the classified
		/// transient/permanent failure paths (F3). Null (default) always succeeds.
		/// </summary>
		public Func<EmailRequest, EmailProviderException?>? FailWith { get; set; }

		// Completes synchronously after recording; suppress CS1998 instead of an
		// artificial await.
#pragma warning disable CS1998
		public async Task<EmailSendReceipt> SendAsync(
			EmailRequest request,
			string? idempotencyKey = null,
			CancellationToken cancellationToken = default
		) {
			if (FailWith?.Invoke(request) is { } failure) {
				throw failure;
			}

			var messageId = Guid.NewGuid().ToString();
			_sent.Enqueue(new SentEmail(request, idempotencyKey, messageId));

			return new EmailSendReceipt(messageId);
		}
#pragma warning restore CS1998

		/// <summary>
		/// Clears captured emails. NOT an isolation mechanism between test methods that
		/// share this instance — a spec that needs isolation should own an exclusive
		/// ApiFixture instead (see the class remarks). This exists for a single test that
		/// wants to discard an earlier phase of its own multi-step scenario.
		/// </summary>
		public void Clear() {
			_sent.Clear();
		}

		/// <summary>Returns all captured emails and clears the queue.</summary>
		public IReadOnlyList<EmailRequest> DrainAll() {
			var snapshot = _sent.Select(s => s.Request).ToList();
			_sent.Clear();
			return snapshot;
		}
	}
}
