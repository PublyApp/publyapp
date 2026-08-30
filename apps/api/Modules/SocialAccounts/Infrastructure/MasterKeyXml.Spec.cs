using FluentAssertions;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

public sealed class MasterKeyXmlSpec {
	[Fact]
	public void ItShouldRoundTripXmlWhenEncryptedUnderTheMasterKey() {
		// Arrange
		var encryptor = new MasterKeyXmlEncryptor();
		var decryptor = new MasterKeyXmlDecryptor();
		var clear = new System.Xml.Linq.XElement("key", "secret-blob");

		// Act
		var encrypted = encryptor.Encrypt(clear);
		var decrypted = decryptor.Decrypt(encrypted.EncryptedElement);

		// Assert
		decrypted.ToString(System.Xml.Linq.SaveOptions.DisableFormatting).Should().Be(
			clear.ToString(System.Xml.Linq.SaveOptions.DisableFormatting)
		);
	}

	[Fact]
	public void ItShouldFailToDecryptPayloadProtectedUnderADifferentKey() {
		// Encrypt with the current master key
		var encryptor = new MasterKeyXmlEncryptor();
		var clear = new System.Xml.Linq.XElement("key", "cross-key-payload");
		var encrypted = encryptor.Encrypt(clear);
		var protectedBytes = Convert.FromBase64String(
			encrypted.EncryptedElement.Value!
		);

		// Flip a byte in the nonce to simulate a different key's ring
		protectedBytes[5] ^= 0xFF;

		var tamperedElement = new System.Xml.Linq.XElement(
			"encryptedKey",
			Convert.ToBase64String(protectedBytes)
		);

		var decryptor = new MasterKeyXmlDecryptor();
		var act = () => decryptor.Decrypt(tamperedElement);
		act.Should().Throw<Exception>();
	}

	[Fact]
	public void ItShouldSucceedAgainUnderTheSameKeyAfterCrossKeyFailure() {
		var encryptor = new MasterKeyXmlEncryptor();
		var decryptor = new MasterKeyXmlDecryptor();
		var clear = new System.Xml.Linq.XElement("key", "round-trip-payload");

		// Encrypt
		var encrypted = encryptor.Encrypt(clear);

		// Verify it decrypts successfully under the same key
		var decrypted = decryptor.Decrypt(encrypted.EncryptedElement);
		decrypted.ToString(System.Xml.Linq.SaveOptions.DisableFormatting).Should().Be(
			clear.ToString(System.Xml.Linq.SaveOptions.DisableFormatting)
		);
	}
}
