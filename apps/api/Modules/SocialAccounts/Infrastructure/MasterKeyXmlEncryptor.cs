using System.Xml.Linq;

using Microsoft.AspNetCore.DataProtection.XmlEncryption;

using PublyApp.Api.Lib;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

public sealed class MasterKeyXmlEncryptor : IXmlEncryptor {
	private static readonly byte[] Magic = "PAPK"u8.ToArray(); // publyapp protection key

	public EncryptedXmlInfo Encrypt(XElement plaintextElement) {
		var key = AppEnvironment.Instance.SocialAccountsMasterKey;
		using var aes = new System.Security.Cryptography.AesGcm(key, System.Security.Cryptography.AesGcm.TagByteSizes.MaxSize);
		var nonce = new byte[System.Security.Cryptography.AesGcm.NonceByteSizes.MaxSize]; // 12 bytes
		System.Security.Cryptography.RandomNumberGenerator.Fill(nonce);
		var plaintext = System.Text.Encoding.UTF8.GetBytes(
			plaintextElement.ToString(SaveOptions.DisableFormatting)
		);
		// AES-GCM needs the ciphertext and the auth tag in SEPARATE buffers; concatenate
		// them (ciphertext || tag) so the blob is self-contained for decryption.
		var ciphertext = new byte[plaintext.Length];
		var tag = new byte[System.Security.Cryptography.AesGcm.TagByteSizes.MaxSize];
		aes.Encrypt(nonce, plaintext, ciphertext, tag);

		var blob = new byte[Magic.Length + 1 + nonce.Length + ciphertext.Length + tag.Length];
		var offset = 0;
		Array.Copy(Magic, 0, blob, offset, Magic.Length); offset += Magic.Length;
		blob[offset++] = 1; // version
		Array.Copy(nonce, 0, blob, offset, nonce.Length); offset += nonce.Length;
		Array.Copy(ciphertext, 0, blob, offset, ciphertext.Length); offset += ciphertext.Length;
		Array.Copy(tag, 0, blob, offset, tag.Length);

		return new EncryptedXmlInfo(
			new XElement("encryptedKey", Convert.ToBase64String(blob)),
			typeof(MasterKeyXmlDecryptor)
		);
	}
}
