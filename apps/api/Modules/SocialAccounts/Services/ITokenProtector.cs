namespace PublyApp.Api.Modules.SocialAccounts.Services;

/// <summary>
/// Protects provider tokens/credentials at rest. Implementations must provide
/// authenticated encryption so a tampered payload FAILS to unprotect rather than
/// returning garbage.
/// </summary>
/// <remarks>
/// C1 seam (#640): the abstraction lives in the SocialAccounts module because its
/// consumers are social-account rows; the shipped implementation is ASP.NET Data
/// Protection with a persisted key ring. Purposes isolate domains: a payload protected
/// for one purpose string cannot be unprotected with another. Never log plaintext or
/// protected payloads.
/// </remarks>
public interface ITokenProtector {
	/// <summary>
	/// Protects <paramref name="plaintext"/> for <paramref name="purpose"/>.
	/// Returns an opaque, ASCII-safe protected payload suitable for a database column.
	/// </summary>
	string Protect(string purpose, string plaintext);

	/// <summary>
	/// Reverses <see cref="Protect"/>. Throws
	/// <see cref="System.Security.Cryptography.CryptographicException"/> when the payload
	/// was tampered with, was created for a different purpose, or the key ring cannot
	/// decrypt it (e.g. after key-ring loss).
	/// </summary>
	string Unprotect(string purpose, string protectedPayload);
}
