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
}
