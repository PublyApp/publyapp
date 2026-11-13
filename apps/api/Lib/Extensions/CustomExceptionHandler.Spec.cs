using System.Text.Json;

using FluentAssertions;

using Microsoft.AspNetCore.Http;

using PublyApp.Api.Localization;

using Xunit;

namespace PublyApp.Api.Lib.Extensions;

public sealed class CustomExceptionHandlerSpec {
	[Fact]
	public void ItShouldMapA413BadHttpRequestExceptionToPayloadTooLarge() {
		var exception = new BadHttpRequestException(
			"Request body too large.",
			StatusCodes.Status413PayloadTooLarge
		);

		var mapped = CustomExceptionHandler.MapException(exception);

		mapped.StatusCode.Should().Be(StatusCodes.Status413PayloadTooLarge);
		mapped.Title.Should().Be("Payload Too Large");
		mapped.Key.Should().Be(ResponseKeys.UploadFileTooLarge);
		mapped.Errors.Should().BeNull();
	}

	[Fact]
	public void ItShouldNameTheFileLimitOnAnUploadEndpointsTransport413() {
		var exception = new BadHttpRequestException(
			"Request body too large.",
			StatusCodes.Status413PayloadTooLarge
		);

		var mapped = CustomExceptionHandler.MapException(exception, 16_777_216);

		mapped.StatusCode.Should().Be(StatusCodes.Status413PayloadTooLarge);
		mapped.Key.Should().Be(ResponseKeys.UploadFileTooLarge);
		mapped.Detail.Should().Be("File exceeds the maximum size of 16.7 MB");
		mapped.Extensions.Required()["maxBytes"].Should().Be(16_777_216L);
	}

	[Fact]
	public void ItShouldResolveTheFileLimitOfAnUploadEndpoint() {
		var endpoint = new Endpoint(
			null,
			new EndpointMetadataCollection(
				new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(
					2_000_000 + PublyApp.Api.Modules.Uploads.UploadLimits.MultipartHeaderHeadroomBytes
				)
			),
			"upload"
		);

		CustomExceptionHandler.ResolveUploadFileLimit(endpoint, 2_000_000)
			.Should().Be(2_000_000);
	}

	[Fact]
	public void ItShouldNotResolveAFileLimitForAnotherEndpointOrNone() {
		var otherLimit = new Endpoint(
			null,
			new EndpointMetadataCollection(
				new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(1_000)
			),
			"other"
		);
		var noLimit = new Endpoint(null, new EndpointMetadataCollection(), "plain");

		CustomExceptionHandler.ResolveUploadFileLimit(otherLimit, 2_000_000).Should().BeNull();
		CustomExceptionHandler.ResolveUploadFileLimit(noLimit, 2_000_000).Should().BeNull();
		CustomExceptionHandler.ResolveUploadFileLimit(null, 2_000_000).Should().BeNull();
	}

	[Theory]
	[InlineData(16_777_216L, "16.7 MB")]
	[InlineData(2_000_000L, "2 MB")]
	[InlineData(1_500L, "1.5 KB")]
	[InlineData(999L, "999 B")]
	public void ItShouldFormatALimitFlooredToATenth(long bytes, string expected) {
		PublyApp.Api.Modules.Uploads.UploadLimits.FormatLimit(bytes).Should().Be(expected);
	}

	[Fact]
	public void ItShouldMapAMissingRequiredBodyParameterToRequestBodyMissing() {
		var exception = new BadHttpRequestException(
			"Required parameter \"CreateStaffUserBody body\" was not provided from body."
		);

		var mapped = CustomExceptionHandler.MapException(exception);

		mapped.StatusCode.Should().Be(StatusCodes.Status422UnprocessableEntity);
		mapped.Key.Should().Be(ResponseKeys.RequestBodyMissing);
		mapped.Errors.Should().NotBeNull();
		mapped.Errors.Required().Should().ContainKey("body");
	}

	[Fact]
	public void ItShouldMapAMissingRequiredQueryParameterAndExtractItsName() {
		var exception = new BadHttpRequestException(
			"Required parameter \"string userId\" was not provided from query string."
		);

		var mapped = CustomExceptionHandler.MapException(exception);

		mapped.StatusCode.Should().Be(StatusCodes.Status422UnprocessableEntity);
		mapped.Key.Should().Be(ResponseKeys.QueryParametersMissing);
		mapped.Errors.Should().NotBeNull();
		mapped.Errors.Required().Should().ContainKey("userId");
	}

	[Fact]
	public void ItShouldFallBackToUnknownWhenTheMissingQueryParameterNameCannotBeParsed() {
		var exception = new BadHttpRequestException(
			"Required parameter was not provided from query string."
		);

		var mapped = CustomExceptionHandler.MapException(exception);

		mapped.Errors.Should().NotBeNull();
		mapped.Errors.Required().Should().ContainKey("unknown");
	}

	[Fact]
	public void ItShouldMapAnUnrecognizedExceptionToInternalServerError() {
		var mapped = CustomExceptionHandler.MapException(new InvalidOperationException("boom"));

		mapped.StatusCode.Should().Be(StatusCodes.Status500InternalServerError);
		mapped.Key.Should().Be(ResponseKeys.InternalServerError);
		mapped.Errors.Should().BeNull();
	}

	[Fact]
	public void ItShouldMapAMissingRequiredBodyPropertyTo422NamingTheValidatorKey() {
		// System.Text.Json reports the camelCase wire member; FluentValidation keys
		// the CLR property, so the mapping must hand back "Body" — the key the front
		// already reads from the validator path (#2261).
		var exception = new BadHttpRequestException(
			"Failed to read parameter \"CreatePostBody body\" from the request body as JSON.",
			StatusCodes.Status400BadRequest,
			new JsonException(
				"JSON deserialization for type 'CreatePostBody' was missing "
				+ "required properties including: 'body'."
			)
		);

		var mapped = CustomExceptionHandler.MapException(exception);

		mapped.StatusCode.Should().Be(StatusCodes.Status422UnprocessableEntity);
		mapped.Title.Should().Be("Validation Failed");
		mapped.Detail.Should().Be("Request body validation failed");
		mapped.Key.Should().Be(ResponseKeys.RequestBodyValidationFailed);
		mapped.Errors.Should().NotBeNull();
		mapped.Errors.Required().Should().ContainKey("Body")
			.WhoseValue.Should().Equal("Body is required");
	}

	[Fact]
	public void ItShouldNameEveryMissingRequiredBodyProperty() {
		var exception = new BadHttpRequestException(
			"Failed to read parameter \"ResetPasswordBody body\" from the request body as JSON.",
			StatusCodes.Status400BadRequest,
			new JsonException(
				"JSON deserialization for type 'ResetPasswordBody' was missing "
				+ "required properties including: 'id', 'token', 'newPassword', 'confirmPassword'."
			)
		);

		var mapped = CustomExceptionHandler.MapException(exception);

		mapped.StatusCode.Should().Be(StatusCodes.Status422UnprocessableEntity);
		mapped.Errors.Required().Keys.Should().BeEquivalentTo(
			["Id", "Token", "NewPassword", "ConfirmPassword"]
		);
	}

	[Fact]
	public void ItShouldMapAMalformedJsonBodyToA400ProblemInsteadOfA500() {
		var exception = new BadHttpRequestException(
			"Failed to read parameter \"CreatePostBody body\" from the request body as JSON.",
			StatusCodes.Status400BadRequest,
			new JsonException("'t' is an invalid start of a property name.")
		);

		var mapped = CustomExceptionHandler.MapException(exception);

		mapped.StatusCode.Should().Be(StatusCodes.Status400BadRequest);
		mapped.Title.Should().Be("Bad Request");
		mapped.Detail.Should().Be("'t' is an invalid start of a property name.");
		mapped.Key.Should().Be(ResponseKeys.BadRequest);
		mapped.Errors.Should().BeNull();
	}

	[Fact]
	public void ItShouldMapAnUnsupportedContentTypeTo415() {
		var exception = new BadHttpRequestException(
			"Expected a supported JSON media type but got \"text/plain\".",
			StatusCodes.Status415UnsupportedMediaType
		);

		var mapped = CustomExceptionHandler.MapException(exception);

		mapped.StatusCode.Should().Be(StatusCodes.Status415UnsupportedMediaType);
		mapped.Title.Should().Be("Unsupported Media Type");
		mapped.Key.Should().Be(ResponseKeys.BadRequest);
		mapped.Errors.Should().BeNull();
	}

	[Fact]
	public void ItShouldMapANullExceptionToInternalServerError() {
		var mapped = CustomExceptionHandler.MapException(null);

		mapped.StatusCode.Should().Be(StatusCodes.Status500InternalServerError);
		mapped.Key.Should().Be(ResponseKeys.InternalServerError);
	}
}
