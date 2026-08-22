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
}
