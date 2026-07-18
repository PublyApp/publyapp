using Resend;

namespace PublyApp.Api.Lib.Testing.Fakes;

/// <summary>
/// Minimal <see cref="IResend"/> test double: only the two <c>EmailSendAsync</c> overloads
/// are functional; every other member throws. Lets <c>ResendEmailAdapter</c> specs drive a
/// fabricated <see cref="ResendResponse{T}"/> (the F3 non-throwing unsuccessful-response
/// shape, design §5.4) and the 30 s provider-timeout classification (§5.4 step 4) without a
/// real network call.
/// </summary>
public sealed class FakeResendClient : IResend {
	/// <summary>
	/// What <c>EmailSendAsync</c> returns once <see cref="Delay"/> elapses. Defaults to a
	/// successful send carrying a random message id; set an exception-carrying response to
	/// exercise the F3 unsuccessful path (<c>Success = false</c>).
	/// </summary>
	public ResendResponse<Guid> EmailSendResponse { get; set; } =
		new(Guid.NewGuid(), new ResendRateLimit());

	/// <summary>
	/// Optional SDK exception thrown before a response is returned, matching the default
	/// <c>ResendClientOptions.ThrowExceptions = true</c> behavior.
	/// </summary>
	public ResendException? ExceptionToThrow { get; set; }

	/// <summary>
	/// Simulated provider latency, awaited honoring the caller's token so the adapter's
	/// linked 30 s bound can cancel it. Zero (default) completes immediately.
	/// </summary>
	public TimeSpan Delay { get; set; } = TimeSpan.Zero;

	public async Task<ResendResponse<Guid>> EmailSendAsync(
		EmailMessage email,
		CancellationToken cancellationToken = default
	) {
		if (Delay > TimeSpan.Zero) {
			await Task.Delay(Delay, cancellationToken);
		}

		if (ExceptionToThrow is not null) {
			throw ExceptionToThrow;
		}

		return EmailSendResponse;
	}

	public Task<ResendResponse<Guid>> EmailSendAsync(
		string idempotencyKey,
		EmailMessage email,
		CancellationToken cancellationToken = default
	) {
		return EmailSendAsync(email, cancellationToken);
	}

	// --- unused IResend surface: never called by the email send path ------------------

	public Task<ResendResponse<EmailReceipt>> EmailRetrieveAsync(
		Guid emailId, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<PaginatedResult<EmailReceipt>>> EmailListAsync(
		PaginatedQuery? query = null, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<List<Guid>>> EmailBatchAsync(
		IEnumerable<EmailMessage> emails, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<List<Guid>>> EmailBatchAsync(
		string idempotencyKey, IEnumerable<EmailMessage> emails, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<EmailBatchResponse>> EmailBatchAsync(
		IEnumerable<EmailMessage> emails, EmailBatchValidationMode validationMode,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<EmailBatchResponse>> EmailBatchAsync(
		string idempotencyKey, IEnumerable<EmailMessage> emails, EmailBatchValidationMode validationMode,
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse> EmailRescheduleAsync(
		Guid emailId, DateTimeOrHuman rescheduleFor, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse> EmailCancelAsync(
		Guid emailId, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<List<Domain>>> DomainListAsync(
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<Domain>> DomainAddAsync(
		string domainName, DeliveryRegion? region, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<Domain>> DomainAddAsync(
		DomainAddData data, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<Domain>> DomainRetrieveAsync(
		Guid domainId, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse> DomainUpdateAsync(
		Guid domainId, DomainUpdateData data, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse> DomainVerifyAsync(
		Guid domainId, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse> DomainDeleteAsync(
		Guid domainId, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<List<ApiKey>>> ApiKeyListAsync(
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<ApiKeyData>> ApiKeyCreateAsync(
		string keyName, Permission? permission, Guid? domainId, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse> ApiKeyDeleteAsync(
		Guid apiKeyId, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<Guid>> AudienceAddAsync(
		string name, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<Audience>> AudienceRetrieveAsync(
		Guid audienceId, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse> AudienceDeleteAsync(
		Guid audienceId, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<List<Audience>>> AudienceListAsync(
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<Guid>> ContactAddAsync(
		Guid audienceId, ContactData data, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<Contact>> ContactRetrieveAsync(
		Guid audienceId, Guid contactId, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<Contact>> ContactRetrieveByEmailAsync(
		Guid audienceId, string email, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse> ContactUpdateAsync(
		Guid audienceId, Guid contactId, ContactData data, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse> ContactUpdateByEmailAsync(
		Guid audienceId, string email, ContactData data, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse> ContactDeleteAsync(
		Guid audienceId, Guid contactId, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse> ContactDeleteByEmailAsync(
		Guid audienceId, string email, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<List<Contact>>> ContactListAsync(
		Guid audienceId, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<Guid>> BroadcastAddAsync(
		BroadcastData data, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<Broadcast>> BroadcastRetrieveAsync(
		Guid broadcastId, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse> BroadcastUpdateAsync(
		Guid broadcastId, BroadcastUpdateData data, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse> BroadcastSendAsync(
		Guid broadcastId, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse> BroadcastScheduleAsync(
		Guid broadcastId, DateTime scheduleFor, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse<List<Broadcast>>> BroadcastListAsync(
		CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}

	public Task<ResendResponse> BroadcastDeleteAsync(
		Guid broadcastId, CancellationToken cancellationToken = default
	) {
		throw new NotImplementedException();
	}
}
