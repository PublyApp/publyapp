using System.Text.Json;

using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Lib.Extensions;

public sealed class JsonElementExtensionsSpec {
	// ==================== GetValueAsGuidOrNull (JsonElement) ====================

	[Fact]
	public void ItShouldReturnNullWhenUndefined() {
		var element = default(JsonElement);
		var result = element.GetValueAsGuidOrNull();
		_ = result.Should().BeNull();
	}

	[Fact]
	public void ItShouldReturnNullWhenJsonNull() {
		var element = JsonDocument.Parse("null").RootElement;
		var result = element.GetValueAsGuidOrNull();
		_ = result.Should().BeNull();
	}

	[Fact]
	public void ItShouldReturnGuidWhenValid() {
		var guid = Guid.NewGuid();
		var element = JsonSerializer.SerializeToElement(guid.ToString());
		var result = element.GetValueAsGuidOrNull();
		_ = result.Should().Be(guid);
	}

	[Fact]
	public void ItShouldReturnEmptyGuidWhenEmptyGuidString() {
		var empty = Guid.Empty.ToString();
		var element = JsonSerializer.SerializeToElement(empty);
		var result = element.GetValueAsGuidOrNull();
		_ = result.Should().Be(Guid.Empty);
	}

	[Fact]
	public void ItShouldThrowWhenGarbageString() {
		var element = JsonSerializer.SerializeToElement("not-a-guid");
		Action act = () => { _ = element.GetValueAsGuidOrNull(); };
		_ = act.Should().Throw<InvalidOperationException>();
	}

	[Fact]
	public void ItShouldThrowWhenEmptyString() {
		var element = JsonSerializer.SerializeToElement(string.Empty);
		Action act = () => { _ = element.GetValueAsGuidOrNull(); };
		_ = act.Should().Throw<InvalidOperationException>();
	}

	[Fact]
	public void ItShouldThrowWhenNumber() {
		var element = JsonDocument.Parse("42").RootElement;
		Action act = () => { _ = element.GetValueAsGuidOrNull(); };
		_ = act.Should().Throw<InvalidOperationException>();
	}

	[Fact]
	public void ItShouldThrowWhenObject() {
		var element = JsonDocument.Parse("{\"a\":1}").RootElement;
		Action act = () => { _ = element.GetValueAsGuidOrNull(); };
		_ = act.Should().Throw<InvalidOperationException>();
	}

	[Fact]
	public void ItShouldThrowWhenArray() {
		var element = JsonDocument.Parse("[1,2]").RootElement;
		Action act = () => { _ = element.GetValueAsGuidOrNull(); };
		_ = act.Should().Throw<InvalidOperationException>();
	}

	[Fact]
	public void ItShouldThrowWhenBoolean() {
		var element = JsonDocument.Parse("true").RootElement;
		Action act = () => { _ = element.GetValueAsGuidOrNull(); };
		_ = act.Should().Throw<InvalidOperationException>();
	}

	// ==================== GetValueAsGuidOrNull (JsonElement?) ====================

	[Fact]
	public void ItShouldReturnNullWhenWrapperNull() {
		JsonElement? element = null;
		var result = element.GetValueAsGuidOrNull();
		_ = result.Should().BeNull();
	}

	[Fact]
	public void ItShouldReturnNullWhenNullableUndefined() {
		JsonElement? element = default(JsonElement);
		var result = element.GetValueAsGuidOrNull();
		_ = result.Should().BeNull();
	}

	[Fact]
	public void ItShouldReturnNullWhenNullableJsonNull() {
		JsonElement? element = JsonDocument.Parse("null").RootElement;
		var result = element.GetValueAsGuidOrNull();
		_ = result.Should().BeNull();
	}

	[Fact]
	public void ItShouldReturnGuidWhenNullableValid() {
		var guid = Guid.NewGuid();
		JsonElement? element = JsonSerializer.SerializeToElement(guid.ToString());
		var result = element.GetValueAsGuidOrNull();
		_ = result.Should().Be(guid);
	}

	[Fact]
	public void ItShouldReturnEmptyGuidWhenNullableEmptyGuidString() {
		JsonElement? element = JsonSerializer.SerializeToElement(Guid.Empty.ToString());
		var result = element.GetValueAsGuidOrNull();
		_ = result.Should().Be(Guid.Empty);
	}

	[Fact]
	public void ItShouldThrowWhenNullableGarbageString() {
		JsonElement? element = JsonSerializer.SerializeToElement("not-a-guid");
		Action act = () => { _ = element.GetValueAsGuidOrNull(); };
		_ = act.Should().Throw<InvalidOperationException>();
	}

	[Fact]
	public void ItShouldThrowWhenNullableNumber() {
		JsonElement? element = JsonDocument.Parse("42").RootElement;
		Action act = () => { _ = element.GetValueAsGuidOrNull(); };
		_ = act.Should().Throw<InvalidOperationException>();
	}

	[Fact]
	public void ItShouldThrowWhenNullableObject() {
		JsonElement? element = JsonDocument.Parse("{\"a\":1}").RootElement;
		Action act = () => { _ = element.GetValueAsGuidOrNull(); };
		_ = act.Should().Throw<InvalidOperationException>();
	}
}
