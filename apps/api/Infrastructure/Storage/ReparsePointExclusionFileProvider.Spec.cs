using FluentAssertions;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;
using Xunit;

namespace PublyApp.Api.Infrastructure.Storage;

/// <summary>
/// Minimal capturing <see cref="ILogger"/> for the reparse-point guard specs —
/// asserts that the server-side log is emitted when the guard masks an entry,
/// without adding a logging-test package to the test project.
/// </summary>
public sealed class CapturingLogger : ILogger<ReparsePointExclusionFileProvider> {
	public sealed record LogRecord(LogLevel Level, string Message, Dictionary<string, object?> Structured);

	public List<LogRecord> Records { get; } = new();

	public IDisposable? BeginScope<TState>(TState state) where TState : notnull {
		return null;
	}

	public bool IsEnabled(LogLevel logLevel) {
		return true;
	}

	public void Log<TState>(
		LogLevel logLevel,
		EventId eventId,
		TState state,
		Exception? exception,
		Func<TState, Exception?, string> formatter
	) {
		var structured = state is IEnumerable<KeyValuePair<string, object?>> pairs
			? new Dictionary<string, object?>(pairs)
			: new Dictionary<string, object?>();
		Records.Add(new LogRecord(logLevel, formatter(state, exception), structured));
	}
}

public sealed class ReparsePointExclusionFileProviderSpec {
	/// <summary>
	/// #1669 — a symbolic link inside the served tree is masked.
	///
	/// Practical note: a bind mount does NOT carry
	/// <see cref="FileAttributes.ReparsePoint"/> on Linux — only symbolic links
	/// do. The guard keys on the attribute, which is set exclusively for
	/// symlinks. Bind mounts inside the served tree are NOT detected by this
	/// guard and are therefore NOT masked — see the type-level XML doc for the
	/// platform-scope caveat. This test uses a symlink to exercise the decision
	/// path that the attribute-based guard implements.
	/// </summary>
	[Fact]
	public void ItShouldMaskALinkInsideTheServedTree() {
		var tempRoot = Path.Combine(Path.GetTempPath(), $"publy-guard-{Guid.NewGuid()}");
		var uploadsDir = Path.Combine(tempRoot, "uploads");
		Directory.CreateDirectory(uploadsDir);

		try {
			// A regular file inside uploads/ — must remain visible.
			var regularFile = Path.Combine(uploadsDir, "regular.txt");
			File.WriteAllText(regularFile, "visible");

			// A symbolic link inside uploads/ pointing at a target outside —
			// must be masked. The link's own attributes carry ReparsePoint.
			var symlinkPath = Path.Combine(uploadsDir, "symlink.txt");
			var outsideTarget = Path.Combine(tempRoot, "outside.txt");
			File.WriteAllText(outsideTarget, "secret");
			File.CreateSymbolicLink(symlinkPath, outsideTarget);

			var capturingLogger = new CapturingLogger();
			var provider = new ReparsePointExclusionFileProvider(
				new PhysicalFileProvider(uploadsDir),
				capturingLogger
			);

			var regularInfo = provider.GetFileInfo("regular.txt");
			regularInfo.Exists.Should().BeTrue("a regular file is not a reparse point");

			var symlinkInfo = provider.GetFileInfo("symlink.txt");
			symlinkInfo.Exists.Should().BeFalse(
				"a symlink inside the served tree must be masked by the reparse-point guard"
			);
		} finally {
			// Best-effort cleanup; ignore if the OS has not released handles yet.
			try { Directory.Delete(tempRoot, true); } catch { }
		}
	}

	/// <summary>
	/// #1669 — an intermediate directory that is itself a symlink masks the
	/// file beneath it, because the walk checks every component, not just the
	/// leaf.
	/// </summary>
	[Fact]
	public void ItShouldMaskAFileBeneathASymlinkedDirectory() {
		var tempRoot = Path.Combine(Path.GetTempPath(), $"publy-guard-{Guid.NewGuid()}");
		var uploadsDir = Path.Combine(tempRoot, "uploads");
		Directory.CreateDirectory(uploadsDir);

		try {
			// uploads/symlinked-dir -> <tempRoot>/real-dir (a directory symlink)
			var realDir = Path.Combine(tempRoot, "real-dir");
			Directory.CreateDirectory(realDir);
			var fileUnderRealDir = Path.Combine(realDir, "nested.txt");
			File.WriteAllText(fileUnderRealDir, "nested content");

			var symlinkedDir = Path.Combine(uploadsDir, "symlinked-dir");
			Directory.CreateSymbolicLink(symlinkedDir, realDir);

			var capturingLogger = new CapturingLogger();
			var provider = new ReparsePointExclusionFileProvider(
				new PhysicalFileProvider(uploadsDir),
				capturingLogger
			);

			var info = provider.GetFileInfo("symlinked-dir/nested.txt");
			info.Exists.Should().BeFalse(
				"a file under a symlinked directory must be masked — the directory component carries ReparsePoint"
			);
		} finally {
			try { Directory.Delete(tempRoot, true); } catch { }
		}
	}

	/// <summary>
	/// #1670 — when an entry is masked, the server logs the subpath and the
	/// offending component, AND the returned file info remains non-existent
	/// (the HTTP surface stays a bare 404 — the client learns nothing).
	/// </summary>
	[Fact]
	public void ItShouldLogWhenMaskingAnEntryAndReturnNotFound() {
		var tempRoot = Path.Combine(Path.GetTempPath(), $"publy-guard-{Guid.NewGuid()}");
		var uploadsDir = Path.Combine(tempRoot, "uploads");
		Directory.CreateDirectory(uploadsDir);

		try {
			var symlinkPath = Path.Combine(uploadsDir, "link.txt");
			var outsideTarget = Path.Combine(tempRoot, "outside.txt");
			File.WriteAllText(outsideTarget, "secret");
			File.CreateSymbolicLink(symlinkPath, outsideTarget);

			var capturingLogger = new CapturingLogger();
			var provider = new ReparsePointExclusionFileProvider(
				new PhysicalFileProvider(uploadsDir),
				capturingLogger
			);

			var info = provider.GetFileInfo("link.txt");

			// 404 stays bare on the HTTP surface.
			info.Exists.Should().BeFalse("the masked entry must report Exists == false");

			// Server-side, the guard names what happened.
			capturingLogger.Records.Should().ContainSingle(
				"exactly one warning should be emitted per masked entry"
			).Which.Level.Should().Be(LogLevel.Warning);

			var record = capturingLogger.Records[0];
			record.Structured.Should().ContainKey("Subpath");
			record.Structured["Subpath"]!.Should().Be("link.txt");
			record.Structured.Should().ContainKey("Component");
			record.Structured["Component"]!.Should().Be(symlinkPath);
		} finally {
			try { Directory.Delete(tempRoot, true); } catch { }
		}
	}

	/// <summary>
	/// #1670 — proof paired with the negative case: a regular file does not
	/// trigger the warning log, so the absence of the log is meaningful.
	/// </summary>
	[Fact]
	public void ItShouldNotLogWhenServingARegularFile() {
		var tempRoot = Path.Combine(Path.GetTempPath(), $"publy-guard-{Guid.NewGuid()}");
		var uploadsDir = Path.Combine(tempRoot, "uploads");
		Directory.CreateDirectory(uploadsDir);

		try {
			var regularFile = Path.Combine(uploadsDir, "ok.txt");
			File.WriteAllText(regularFile, "ok");

			var capturingLogger = new CapturingLogger();
			var provider = new ReparsePointExclusionFileProvider(
				new PhysicalFileProvider(uploadsDir),
				capturingLogger
			);

			var info = provider.GetFileInfo("ok.txt");
			info.Exists.Should().BeTrue();

			capturingLogger.Records.Should().BeEmpty(
				"a non-reparse entry must not emit a masking log"
			);
		} finally {
			try { Directory.Delete(tempRoot, true); } catch { }
		}
	}

	/// <summary>
	/// #1670 — logging fires when an INTERMEDIATE directory is the reparse
	/// point, not just when the leaf is. Guards against a mutation that logs
	/// only the leaf case yet still masks both.
	/// </summary>
	[Fact]
	public void ItShouldLogTheOffendingIntermediateDirectory() {
		var tempRoot = Path.Combine(Path.GetTempPath(), $"publy-guard-{Guid.NewGuid()}");
		var uploadsDir = Path.Combine(tempRoot, "uploads");
		Directory.CreateDirectory(uploadsDir);

		try {
			var realDir = Path.Combine(tempRoot, "real-dir");
			Directory.CreateDirectory(realDir);
			File.WriteAllText(Path.Combine(realDir, "nested.txt"), "content");

			var symlinkedDir = Path.Combine(uploadsDir, "symlink-dir");
			Directory.CreateSymbolicLink(symlinkedDir, realDir);

			var capturingLogger = new CapturingLogger();
			var provider = new ReparsePointExclusionFileProvider(
				new PhysicalFileProvider(uploadsDir),
				capturingLogger
			);

			var info = provider.GetFileInfo("symlink-dir/nested.txt");
			info.Exists.Should().BeFalse();

			capturingLogger.Records.Should().ContainSingle().Which
				.Structured["Component"]!.Should().Be(symlinkedDir,
					"log must name the offending intermediate directory, not the leaf"
				);
		} finally {
			try { Directory.Delete(tempRoot, true); } catch { }
		}
	}

	/// <summary>
	/// #1669 / #1671 — a non-existent path stays non-existent and the guard
	/// does not log a masking event (nothing was masked — it was never there).
	/// </summary>
	[Fact]
	public void ItShouldReturnNotFoundForAMissingFileWithoutLogging() {
		var tempRoot = Path.Combine(Path.GetTempPath(), $"publy-guard-{Guid.NewGuid()}");
		var uploadsDir = Path.Combine(tempRoot, "uploads");
		Directory.CreateDirectory(uploadsDir);

		try {
			var capturingLogger = new CapturingLogger();
			var provider = new ReparsePointExclusionFileProvider(
				new PhysicalFileProvider(uploadsDir),
				capturingLogger
			);

			var info = provider.GetFileInfo("does-not-exist.txt");
			info.Exists.Should().BeFalse();

			capturingLogger.Records.Should().BeEmpty(
				"a missing path must not emit a masking log — there was no reparse point to trigger it"
			);
		} finally {
			try { Directory.Delete(tempRoot, true); } catch { }
		}
	}

	/// <summary>
	/// #1669 — directory enumeration masks symlinked directories so their
	/// (possibly external) contents do not surface in listings.
	/// </summary>
	[Fact]
	public void ItShouldMaskSymlinkedDirectoriesInEnumeration() {
		var tempRoot = Path.Combine(Path.GetTempPath(), $"publy-guard-{Guid.NewGuid()}");
		var uploadsDir = Path.Combine(tempRoot, "uploads");
		Directory.CreateDirectory(uploadsDir);

		try {
			// A real directory with a real entry.
			var realDir = Path.Combine(uploadsDir, "real-dir");
			Directory.CreateDirectory(realDir);
			File.WriteAllText(Path.Combine(realDir, "a.txt"), "a");

			// A symlinked directory pointing outside.
			var symlinkedDir = Path.Combine(uploadsDir, "sym-dir");
			Directory.CreateSymbolicLink(symlinkedDir, tempRoot);

			var capturingLogger = new CapturingLogger();
			var provider = new ReparsePointExclusionFileProvider(
				new PhysicalFileProvider(uploadsDir),
				capturingLogger
			);

			var contents = provider.GetDirectoryContents("");
			contents.Exists.Should().BeTrue();

			var names = contents.Select(e => e.Name).ToList();
			names.Should().Contain("real-dir", "the real directory is not a reparse point");
			names.Should().NotContain("sym-dir", "a symlinked directory must be masked in listings");
		} finally {
			try { Directory.Delete(tempRoot, true); } catch { }
		}
	}
}
