
using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Infrastructure.Storage;

public sealed class LocalDiskFileStorageSpec : IDisposable {
	private readonly string _Root;
	private readonly LocalDiskFileStorage _Storage;

	public LocalDiskFileStorageSpec() {
		_Root = Path.Combine(Path.GetTempPath(), $"publyapp-storage-test-{Guid.NewGuid():N}");
		_Storage = new LocalDiskFileStorage(_Root);
	}

	public void Dispose() {
		if (Directory.Exists(_Root)) {
			Directory.Delete(_Root, recursive: true);
		}
	}

	[Fact]
	public async Task ItShouldReturnAServerGeneratedPathContainingNoClientInput() {
		using var content = new MemoryStream("hello"u8.ToArray());

		var relativePath = await _Storage.SaveAsync(content, ".png");

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

		var pathA = await _Storage.SaveAsync(contentA, ".png");
		var pathB = await _Storage.SaveAsync(contentB, ".png");

		pathA.Should().NotBe(pathB);
	}

	[Fact]
	public async Task ItShouldDeleteASavedFile() {
		using var content = new MemoryStream("delete-me"u8.ToArray());
		var relativePath = await _Storage.SaveAsync(content, ".png");
		var fullPath = Path.Combine(_Root, relativePath.Replace('/', Path.DirectorySeparatorChar));
		File.Exists(fullPath).Should().BeTrue();

		await _Storage.DeleteAsync(relativePath);

		File.Exists(fullPath).Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldNoOpWhenDeletingAPathThatDoesNotExist() {
		var act = async () => await _Storage.DeleteAsync("uploads/2026/01/does-not-exist.png");

		await act.Should().NotThrowAsync();
	}

	[Theory]
	[InlineData("../../etc/passwd")]
	[InlineData("uploads/../../../etc/passwd")]
	public async Task ItShouldRejectTraversalAttemptsForDelete(string maliciousRelativePath) {
		var act = async () => await _Storage.DeleteAsync(maliciousRelativePath);

		await act.Should().ThrowAsync<InvalidOperationException>();
	}

	[Fact]
	public async Task ItShouldRejectAnExtensionThatDoesNotStartWithADot() {
		using var content = new MemoryStream("bytes"u8.ToArray());

		var act = async () => await _Storage.SaveAsync(content, "png");

		await act.Should().ThrowAsync<ArgumentException>();
	}

	[Theory]
	[InlineData("./../../x.html")]
	[InlineData(".png/../evil.html")]
	[InlineData(".p\0ng")]
	[InlineData(".PNG")]
	[InlineData(".this-is-way-too-long-for-an-extension")]
	public async Task ItShouldRejectAnExtensionContainingPathSeparators(string extension) {
		using var content = new MemoryStream("bytes"u8.ToArray());

		var act = async () => await _Storage.SaveAsync(content, extension);

		await act.Should().ThrowAsync<ArgumentException>();
	}

	[Fact]
	public async Task ItShouldNotLeaveAPartialFileWhenTheSourceStreamThrows() {
		using var content = new ThrowingStream();

		var exception = await Assert.ThrowsAsync<StorageWriteException>(
			() => _Storage.SaveAsync(content, ".png")
		);
		exception.CleanupConfirmed.Should().BeTrue();

		_GetSavedFilePaths().Should().BeEmpty(
			"a failed save must not leave a partial blob on disk"
		);
	}

	[Fact]
	public async Task ItShouldReportConfirmedCleanupForAFailedWrite() {
		using var content = new ThrowingStream();

		var exception = await Assert.ThrowsAsync<StorageWriteException>(
			() => _Storage.SaveAsync(content, ".png")
		);

		exception.CleanupConfirmed.Should().BeTrue();
		exception.RelativePath.Should().StartWith("uploads/");
	}

	[Fact]
	public async Task ItShouldNotLeaveAPartialFileWhenCancelled() {
		using var content = new MemoryStream(new byte[1024 * 1024]);
		using var cts = new CancellationTokenSource();
		cts.Cancel();

		var exception = await Assert.ThrowsAsync<StorageWriteException>(
			() => _Storage.SaveAsync(content, ".png", cts.Token)
		);
		exception.CleanupConfirmed.Should().BeTrue();
		exception.InnerException.Should().BeOfType<TaskCanceledException>();

		_GetSavedFilePaths().Should().BeEmpty(
			"a cancelled save must not leave a partial blob on disk"
		);
	}

	private IEnumerable<string> _GetSavedFilePaths() {
		var uploadsRoot = Path.Combine(_Root, "uploads");
		return Directory.Exists(uploadsRoot)
			? Directory.EnumerateFiles(uploadsRoot, "*", SearchOption.AllDirectories)
			: [];
	}

	private sealed class ThrowingStream : MemoryStream {
		public override Task<int> ReadAsync(
			byte[] buffer, int offset, int count, CancellationToken cancellationToken
		) {
			throw new InvalidOperationException("Simulated read failure");
		}

		public override ValueTask<int> ReadAsync(
			Memory<byte> buffer, CancellationToken cancellationToken = default
		) {
			throw new InvalidOperationException("Simulated read failure");
		}

		public override int Read(byte[] buffer, int offset, int count) {
			throw new InvalidOperationException("Simulated read failure");
		}
	}
}
