using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

// The ONE sanitization boundary (F20, review finding 6): everything durable or
// logged that a handler (or exception) supplied passes through here.
public sealed class JobErrorSanitizerSpec {
	[Fact]
	public void ItShouldRedactEmailAddresses() {
		var sanitized = JobErrorSanitizer.Sanitize(
			"Delivery to jane.doe+test@example.co.uk failed"
		);

		sanitized.Should().Be("Delivery to [redacted-email] failed");
	}

	[Fact]
	public void ItShouldRedactLongTokenLikeRuns() {
		var sanitized = JobErrorSanitizer.Sanitize(
			"reset token dGhpcy1pcy1hLXZlcnktc2VjcmV0LXRva2Vu was rejected"
		);

		sanitized.Should().Be("reset token [redacted-token] was rejected");
	}

	[Fact]
	public void ItShouldCollapseControlCharacters() {
		var sanitized = JobErrorSanitizer.Sanitize("line one\r\n\tline two");

		sanitized.Should().Be("line one line two");
	}

	[Fact]
	public void ItShouldTruncateToTheDurableBound() {
		// Short words with spaces so nothing here is token-shaped — only the
		// length bound is under test.
		var raw = string.Join(" ", Enumerable.Repeat("word", 3000));

		var sanitized = JobErrorSanitizer.Sanitize(raw);

		sanitized.Should().NotBeNull();
		sanitized.Should().HaveLength(JobErrorSanitizer.MaxLength);
	}

	[Fact]
	public void ItShouldPassThroughNull() {
		JobErrorSanitizer.Sanitize(null).Should().BeNull();
	}

	[Fact]
	public void ItShouldDescribeAnExceptionAsTypeNamePlusSanitizedMessage() {
		var described = JobErrorSanitizer.Describe(
			new InvalidOperationException("could not email admin@example.com")
		);

		described.Should().Be(
			"InvalidOperationException: could not email [redacted-email]"
		);
	}
}
