using System.Xml.Linq;

using Microsoft.AspNetCore.DataProtection.XmlEncryption;

using PublyApp.Api.Lib;

namespace PublyApp.Api.Modules.SocialAccounts.Infrastructure;

public sealed class MasterKeyXmlDecryptor : IXmlDecryptor {
	public XElement Decrypt(XElement encryptedElement) {
		var b64 = encryptedElement.Value;
		if (b64 is null) {
			throw new InvalidOperationException("Missing encryptedKey element.");
		}
		var blob = Convert.FromBase64String(b64);
		var tagSize = System.Security.Cryptography.AesGcm.TagByteSizes.MaxSize;
		// magic(4) + version(1) + nonce(12) + ciphertext(>=0) + tag(16)
		if (blob.Length < 4 + 1 + 12 + tagSize) {
			throw new InvalidOperationException("Malformed master-key blob.");
		}
		if (!blob.AsSpan(0, 4).SequenceEqual("PAPK"u8)) {
			throw new InvalidOperationException("Unknown master-key blob magic.");
		}
		var version = blob[4];
		if (version != 1) {
			throw new InvalidOperationException($"Unsupported master-key version {version}.");
		}
		var nonce = blob.AsSpan(5, 12).ToArray();
		var ciphertextEnd = blob.Length - tagSize;
		var ciphertext = blob.AsSpan(5 + 12, ciphertextEnd - (5 + 12)).ToArray();
		var tag = blob.AsSpan(ciphertextEnd, tagSize).ToArray();
		var key = AppEnvironment.Instance.SocialAccountsMasterKey;
		using var aes = new System.Security.Cryptography.AesGcm(key, tagSize);
		var plaintext = new byte[ciphertext.Length];
		aes.Decrypt(nonce, ciphertext, tag, plaintext);

		return XElement.Parse(System.Text.Encoding.UTF8.GetString(plaintext));
	}
}
