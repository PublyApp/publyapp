
using System.Text;

using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Infrastructure.Storage;

public sealed class LocalDiskFileStorageSpec : IDisposable {
	private readonly string _root;
	private readonly LocalDiskFileStorage _storage;

	public LocalDiskFileStorageSpec() {
		_root = Path.Combine(Path.GetTempPath(), $"publyapp-storage-test-{Guid.NewGuid():N}");
		_storage = new LocalDiskFileStorage(_root);
	}

	public void Dispose() {
		if (Directory.Exists(_root)) {
			Directory.Delete(_root, recursive: true);
		}
	}

	[Fact]
	public async Task ItShouldReturnAServerGeneratedPathContainingNoClientInput() {
		using var content = new MemoryStream("hello"u8.ToArray());

		var relativePath = await _storage.SaveAsync(content, ".png");

		var now = DateTime.UtcNow;
		relativePath.Should().StartWith(
			$"uploads/{now:yyyy}/{now:MM}/"
		);
		relativePath.Should().EndWith(".png");

		var fileName = Path.GetFileNameWithoutExtension(relativePath);
		Guid.TryParse(fileName, out _).Should().BeTrue(
			"the generated file name must be a UUID, not derived from any caller-supplied value"
		);
	}

	[Fact]
	public async Task ItShouldReturnDistinctPathsForRepeatedSaves() {
		using var contentA = new MemoryStream("a"u8.ToArray());
		using var contentB = new MemoryStream("b"u8.ToArray());

		var pathA = await _storage.SaveAsync(contentA, ".png");
		var pathB = await _storage.SaveAsync(contentB, ".png");

		pathA.Should().NotBe(pathB);
	}

	[Fact]
	public async Task ItShouldMakeSavedContentReadableViaExistsAndOpenRead() {
		var bytes = "roundtrip"u8.ToArray();
		using var content = new MemoryStream(bytes);

		var relativePath = await _storage.SaveAsync(content, ".png");

		(await _storage.ExistsAsync(relativePath)).Should().BeTrue();

		await using var readStream = await _storage.OpenReadAsync(relativePath);
		readStream.Should().NotBeNull();
		using var reader = new StreamReader(readStream!, Encoding.UTF8);
		var readBack = await reader.ReadToEndAsync();
		readBack.Should().Be("roundtrip");
	}

	[Fact]
	public async Task ItShouldReturnNullForOpenReadWhenPathDoesNotExist() {
		(await _storage.OpenReadAsync("uploads/2026/01/does-not-exist.png"))
			.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldReturnFalseForExistsWhenPathDoesNotExist() {
		(await _storage.ExistsAsync("uploads/2026/01/does-not-exist.png"))
			.Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldDeleteASavedFile() {
		using var content = new MemoryStream("delete-me"u8.ToArray());
		var relativePath = await _storage.SaveAsync(content, ".png");

		await _storage.DeleteAsync(relativePath);

		(await _storage.ExistsAsync(relativePath)).Should().BeFalse();
	}

	[Theory]
	[InlineData("../../etc/passwd")]
	[InlineData("uploads/../../../etc/passwd")]
	public async Task ItShouldRejectTraversalAttemptsForRead(string maliciousRelativePath) {
		var act = async () => await _storage.OpenReadAsync(maliciousRelativePath);

		await act.Should().ThrowAsync<InvalidOperationException>();
	}

	[Fact]
	public async Task ItShouldRejectAnExtensionThatDoesNotStartWithADot() {
		using var content = new MemoryStream("bytes"u8.ToArray());

		var act = async () => await _storage.SaveAsync(content, "png");

		await act.Should().ThrowAsync<ArgumentException>();
	}
}
