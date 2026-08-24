using System.Security.Cryptography;

using FluentAssertions;

using PublyApp.Api.Lib;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

/// <summary>
/// In-memory fake of the canary seam for unit-level witness specs that need to inject a
/// foreign-key canary without going through reflection.
/// </summary>
public sealed class ScriptedCanaryStore : IKeyRingCanaryStore {
	public string? Read() {
		return Blob;
	}

	public void Write(string blob) {
		Blob = blob;
	}

	public string? Blob { get; set; }
}

public sealed class SocialAccountsMasterKeyWitnessSpec {
	[Fact]
	public void ItShouldPassWhenTheMasterKeyIsValid() {
		var key = AppEnvironment.Instance.SocialAccountsMasterKey;
		var act = () => SocialAccountsMasterKeyWitness
			.EnsureMasterKeyUsable(key);
		act.Should().NotThrow();
	}

	[Fact]
	public void ItShouldThrowWhenTheMasterKeyIsEmpty() {
		var act = () => SocialAccountsMasterKeyWitness
			.EnsureMasterKeyUsable([]);
		act.Should().Throw<InvalidOperationException>()
			.WithMessage("*missing*");
	}

	[Fact]
	public void ItShouldThrowWhenKeyIsWrongSize() {
		// 15 bytes is not a valid AES key size (valid: 16, 24, 32)
		var shortKey = new byte[15];
		var act = () => SocialAccountsMasterKeyWitness
			.EnsureMasterKeyUsable(shortKey);
		act.Should().Throw<InvalidOperationException>()
			.WithMessage("*wrong size*");
	}

	// ---- Review r3 MAJOR: wrong-VALUE keys must refuse to boot --------------------

	private static byte[] KeyA() {
		var key = new byte[32];
		RandomNumberGenerator.Fill(key);
		return key;
	}

	private static byte[] KeyB() {
		var key = new byte[32];
		RandomNumberGenerator.Fill(key);
		return key;
	}

	[Fact]
	public void ItShouldMintTheCanaryOnFirstBootUnderTheCurrentKey() {
		var store = new ScriptedCanaryStore();
		var keyA = KeyA();

		SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(keyA, store);

		store.Blob.Should().NotBeNullOrEmpty("first boot must persist a canary");
	}

	[Fact]
	public void ItShouldBootCleanlyTwiceUnderTheSameKey() {
		var store = new ScriptedCanaryStore();
		var keyA = KeyA();
		SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(keyA, store);

		var secondBoot = () => SocialAccountsMasterKeyWitness
			.EnsureMasterKeyUsable(keyA, store);
		secondBoot.Should().NotThrow("same key value must keep booting");
	}

	[Fact]
	public void ItShouldRefuseToBootWhenTheKeyValueDiffersButSizeMatches() {
		var store = new ScriptedCanaryStore();
		var keyA = KeyA();
		SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(keyA, store); // boot 1: mints canary

		var keyB = KeyB(); // right SIZE, different VALUE
		var act = () => SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(keyB, store);
		act.Should().Throw<InvalidOperationException>()
			.WithMessage("*does not match the master-key canary*")
			.And.InnerException.Should().BeAssignableTo<CryptographicException>(
				"AES-GCM authentication failure surfaces as AuthenticationTagMismatchException, "
					+ "a CryptographicException subclass"
			);
	}

	[Fact]
	public void ItShouldBootAgainOnceTheOriginalKeyIsRestored() {
		var store = new ScriptedCanaryStore();
		var keyA = KeyA();
		SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(keyA, store); // A: mint

		Assert.Throws<InvalidOperationException>(
			() => SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(KeyB(), store)); // B: refused

		// back to A → OK, against the SAME persisted canary
		var restored = () => SocialAccountsMasterKeyWitness
			.EnsureMasterKeyUsable(keyA, store);
		restored.Should().NotThrow();
	}

	[Fact]
	public void ItShouldRefuseACorruptedCanaryBlob() {
		var store = new ScriptedCanaryStore();
		var keyA = KeyA();
		SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(keyA, store);

		store.Blob = "not-a-canary-blob";

		var act = () => SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(keyA, store);
		act.Should().Throw<InvalidOperationException>()
			.WithMessage("*does not match the master-key canary*");
	}

	// ---- Issue #1294: publicly known placeholder + degenerate values refuse REAL boots

	private static byte[] DocumentedPlaceholder() {
		return Convert.FromBase64String("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
	}

	[Fact]
	public void ItShouldAcceptTheCommittedPlaceholderOnTheDocGenPath() {
		// The doc-gen process (Program passes canaryStore: null while building the OpenAPI
		// document) legitimately boots under the committed build placeholder. Tightening
		// THAT path would break `just build-api`; the rejection must live behind the
		// canaryStore-null early return.
		var act = () => SocialAccountsMasterKeyWitness
			.EnsureMasterKeyUsable(DocumentedPlaceholder(), canaryStore: null);
		act.Should().NotThrow(
			"the db-less doc-gen path must keep accepting the committed placeholder");
	}

	[Fact]
	public void ItShouldRefuseTheDocumentedPlaceholderAtRealBoot() {
		var act = () => SocialAccountsMasterKeyWitness.EnsureMasterKeyUsable(
			DocumentedPlaceholder(),
			new ScriptedCanaryStore()
		);
		act.Should().Throw<InvalidOperationException>()
			.WithMessage(
				"*publicly documented build placeholder*openssl rand -base64 32*");
	}

	[Fact]
	public void ItShouldRefuseAnAllSameByteKeyOtherThanZeroesAtRealBoot() {
		var key = new byte[32];
		key.AsSpan().Fill(0x5A);

		var act = () => SocialAccountsMasterKeyWitness
			.EnsureMasterKeyUsable(key, new ScriptedCanaryStore());
		act.Should().Throw<InvalidOperationException>()
			.WithMessage("*bytes are the same value*");
	}

	[Fact]
	public void ItShouldRefuseARepeatedPatternKeyBelowTheDistinctByteFloor() {
		// Right SIZE (parses fine), but only 8 distinct byte values across the 32:
		// exactly the hand-copied-pattern class the entropy floor exists for.
		var key = new byte[32];
		for (var i = 0; i < key.Length; i++) {
			key[i] = (byte)((i % 8) + 1);
		}

		var act = () => SocialAccountsMasterKeyWitness
			.EnsureMasterKeyUsable(key, new ScriptedCanaryStore());
		act.Should().Throw<InvalidOperationException>()
			.WithMessage("*8 distinct byte values*fewer than 16*");
	}

	[Fact]
	public void ItShouldAcceptAHonestlyGeneratedKeyAtRealBoot() {
		// Random keys hold ~8 bits/byte; the probability of landing below the 16-distinct
		// floor is < 10^-15, so this must never flake.
		var key = KeyA();

		var act = () => SocialAccountsMasterKeyWitness
			.EnsureMasterKeyUsable(key, new ScriptedCanaryStore());
		act.Should().NotThrow();
	}

	[Fact]
	public void ItShouldKeepTheRealBootPlaceholderGateWiredBetweenDocGenAndCanary() {
		// Paired proof / mutation guard: deleting the RejectKnownNonSecretOrDegenerateValue
		// call would silently turn every behavioural refusal above green again. Pin the
		// REAL artifact instead — the witness source must invoke the rejection AFTER the
		// canaryStore-null early return (doc-gen keeps the placeholder) and BEFORE the
		// canary round-trip, with exactly one call site.
		var source = Normalize(File.ReadAllText(FindWitnessSourcePath()));

		var ensureStart = source.IndexOf(
			"public static void EnsureMasterKeyUsable", StringComparison.Ordinal);
		var earlyReturn = source.IndexOf("if (canaryStore is null)", StringComparison.Ordinal);
		var rejection = source.IndexOf(
			"RejectKnownNonSecretOrDegenerateValue(key);", StringComparison.Ordinal);
		var canaryRead = source.IndexOf(
			"var stored = canaryStore.Read();", StringComparison.Ordinal);

		ensureStart.Should().BeGreaterThanOrEqualTo(0, "witness entry point moved?");
		earlyReturn.Should().BeGreaterThan(ensureStart);
		rejection.Should().BeGreaterThan(earlyReturn,
			"the rejection must stay behind the doc-gen early return so the "
				+ "committed placeholder keeps booting document generation");
		canaryRead.Should().BeGreaterThan(rejection,
			"degenerate values are refused BEFORE any canary round-trip");

		CountOccurrences(source, "RejectKnownNonSecretOrDegenerateValue(key);")
			.Should().Be(1,
				"exactly one invocation: removing it must fail this guard, not pass silently");
	}

	private static string FindWitnessSourcePath() {
		var dir = new DirectoryInfo(AppContext.BaseDirectory);
		while (dir is not null) {
			var candidate = Path.Combine(
				dir.FullName,
				"apps",
				"api",
				"Modules",
				"SocialAccounts",
				"Infrastructure",
				"SocialAccountsMasterKeyWitness.cs"
			);
			if (File.Exists(candidate)) {
				return candidate;
			}

			dir = dir.Parent;
		}

		throw new InvalidOperationException(
			"SocialAccountsMasterKeyWitness.cs not found above the test output directory; "
				+ "if the witness moved, update this guard."
			);
	}

	/// <summary>
	/// Collapses all whitespace runs to single spaces so multi-line call sites still
	/// match the pinned fragments. Hand-rolled instead of Regex: SYSLIB1045 (as error)
	/// requires compile-time generated regexes, which are overkill here.
	/// </summary>
	private static string Normalize(string source) {
		var sb = new System.Text.StringBuilder(source.Length);
		var previousWasSpace = false;
		foreach (var ch in source) {
			if (char.IsWhiteSpace(ch)) {
				if (!previousWasSpace) {
					sb.Append(' ');
					previousWasSpace = true;
				}
			} else {
				sb.Append(ch);
				previousWasSpace = false;
			}
		}

		return sb.ToString();
	}

	private static int CountOccurrences(string haystack, string needle) {
		var count = 0;
		var offset = 0;
		while ((offset = haystack.IndexOf(needle, offset, StringComparison.Ordinal)) >= 0) {
			count++;
			offset += needle.Length;
		}

		return count;
	}
}
