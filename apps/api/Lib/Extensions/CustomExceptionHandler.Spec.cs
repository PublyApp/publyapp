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
	public void ItShouldMapAMissingRequiredBodyParameterToRequestBodyMissing() {
		var exception = new BadHttpRequestException(
			"Required parameter \"CreateStaffUserBody body\" was not provided from body."
		);

		var mapped = CustomExceptionHandler.MapException(exception);

		mapped.StatusCode.Should().Be(StatusCodes.Status422UnprocessableEntity);
		mapped.Key.Should().Be(ResponseKeys.RequestBodyMissing);
		mapped.Errors.Should().NotBeNull();
		mapped.Errors!.Should().ContainKey("body");
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
		mapped.Errors!.Should().ContainKey("userId");
	}

	[Fact]
	public void ItShouldFallBackToUnknownWhenTheMissingQueryParameterNameCannotBeParsed() {
		var exception = new BadHttpRequestException(
			"Required parameter was not provided from query string."
		);

		var mapped = CustomExceptionHandler.MapException(exception);

		mapped.Errors.Should().NotBeNull();
		mapped.Errors!.Should().ContainKey("unknown");
	}

	[Fact]
	public void ItShouldMapAnUnrecognizedExceptionToInternalServerError() {
		var mapped = CustomExceptionHandler.MapException(new InvalidOperationException("boom"));

		mapped.StatusCode.Should().Be(StatusCodes.Status500InternalServerError);
		mapped.Key.Should().Be(ResponseKeys.InternalServerError);
		mapped.Errors.Should().BeNull();
	}

	[Fact]
	public void ItShouldMapANullExceptionToInternalServerError() {
		var mapped = CustomExceptionHandler.MapException(null);

		mapped.StatusCode.Should().Be(StatusCodes.Status500InternalServerError);
		mapped.Key.Should().Be(ResponseKeys.InternalServerError);
	}
}
