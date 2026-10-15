using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Text.RegularExpressions;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

/// <summary>
/// The SSRF guard for the instance host a user types in (#2174). Two layers:
/// <see cref="NormalizeHost"/> accepts only a plain public DNS name (https is the
/// only scheme the client ever builds), and <see cref="CreateHandler"/> re-checks
/// every resolved address at CONNECT time, so DNS rebinding and redirects cannot
/// reach a private address either (redirects are not followed at all).
/// </summary>
public static partial class MastodonHostGuard {
	public const string HttpClientName = "Mastodon";

	private static readonly string[] _ForbiddenSuffixes = [
		".localhost", ".local", ".internal", ".localdomain", ".lan", ".home.arpa", ".intranet",
	];

	/// <summary>
	/// The lowercase ASCII host of what the user typed, or null when it is not a
	/// public DNS name: http (not https), a port, user info, an IP literal, a single
	/// label, or a reserved suffix. A path, query or fragment after the host is dropped.
	/// </summary>
	public static string? NormalizeHost(string? input) {
		if (string.IsNullOrWhiteSpace(input)) {
			return null;
		}

		var text = input.Trim();
		if (text.StartsWith("http://", StringComparison.OrdinalIgnoreCase)) {
			return null;
		}

		if (text.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) {
			text = text["https://".Length..];
		}

		var end = text.IndexOfAny(['/', '?', '#']);
		var host = (end < 0 ? text : text[..end]).TrimEnd('.').ToLowerInvariant();
		if (host.Length == 0 || host.Contains('@') || host.Contains(':')) {
			return null;
		}

		string ascii;
		try {
			ascii = new IdnMapping().GetAscii(host);
		} catch (ArgumentException) {
			return null;
		}

		var labels = ascii.Split('.');
		if (ascii.Length > 253 || labels.Length < 2) {
			return null;
		}

		if (!labels.All(label => MastodonHostGuard._LabelPattern().IsMatch(label))) {
			return null;
		}

		// An all-numeric last label is an IPv4 literal (10.0.0.1), never a public TLD.
		if (labels[^1].All(char.IsAsciiDigit)) {
			return null;
		}

		var suffixed = ascii.StartsWith("localhost.", StringComparison.Ordinal)
			|| MastodonHostGuard._ForbiddenSuffixes.Any(
				suffix => ascii.EndsWith(suffix, StringComparison.Ordinal)
			);
		return suffixed ? null : ascii;
	}

	/// <summary>
	/// True for a globally routable address: loopback, unspecified, private,
	/// link-local, carrier-grade NAT, documentation, benchmarking, multicast and
	/// reserved ranges (and IPv4-mapped forms of them) are refused.
	/// </summary>
	public static bool IsPublicAddress(IPAddress address) {
		var candidate = address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address;
		var bytes = candidate.GetAddressBytes();
		if (candidate.AddressFamily == AddressFamily.InterNetwork) {
			return !(bytes[0] is 0 or 10 or 127
				|| bytes[0] >= 224
				|| (bytes[0] == 100 && bytes[1] is >= 64 and <= 127)
				|| (bytes[0] == 169 && bytes[1] == 254)
				|| (bytes[0] == 172 && bytes[1] is >= 16 and <= 31)
				|| (bytes[0] == 192 && bytes[1] == 168)
				|| (bytes[0] == 192 && bytes[1] == 0 && bytes[2] is 0 or 2)
				|| (bytes[0] == 198 && bytes[1] is 18 or 19)
				|| (bytes[0] == 198 && bytes[1] == 51 && bytes[2] == 100)
				|| (bytes[0] == 203 && bytes[1] == 0 && bytes[2] == 113));
		}

		if (candidate.AddressFamily != AddressFamily.InterNetworkV6) {
			return false;
		}

		return !(IPAddress.IsLoopback(candidate)
			|| candidate.Equals(IPAddress.IPv6None)
			|| candidate.IsIPv6LinkLocal
			|| candidate.IsIPv6SiteLocal
			|| candidate.IsIPv6Multicast
			|| (bytes[0] & 0xFE) == 0xFC
			|| (bytes[0] == 0x20 && bytes[1] == 0x01 && bytes[2] == 0x0D && bytes[3] == 0xB8)
			|| (bytes[0] == 0x00 && bytes[1] == 0x64 && bytes[2] == 0xFF && bytes[3] == 0x9B));
	}

	/// <summary>
	/// A handler that resolves the host itself and refuses to connect when ANY
	/// answer is non-public. No redirects, a bounded connect time and a short
	/// connection lifetime so DNS is re-resolved regularly.
	/// </summary>
	public static SocketsHttpHandler CreateHandler(
		Func<string, CancellationToken, Task<IPAddress[]>>? resolve = null
	) {
		var resolver = resolve ?? (async (host, token) => await Dns.GetHostAddressesAsync(host, token));
		return new SocketsHttpHandler {
			AllowAutoRedirect = false,
			ConnectTimeout = TimeSpan.FromSeconds(10),
			PooledConnectionLifetime = TimeSpan.FromMinutes(2),
			ConnectCallback = async (context, token) => {
				var addresses = await resolver(context.DnsEndPoint.Host, token);
				if (addresses.Length == 0 || addresses.Any(address => !MastodonHostGuard.IsPublicAddress(address))) {
					throw new HttpRequestException("the instance host does not resolve to a public address");
				}

				var socket = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
				try {
					await socket.ConnectAsync(
						new IPEndPoint(addresses[0], context.DnsEndPoint.Port), token
					);
					return new NetworkStream(socket, ownsSocket: true);
				} catch {
					socket.Dispose();
					throw;
				}
			},
		};
	}

	[GeneratedRegex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$", RegexOptions.CultureInvariant)]
	private static partial Regex _LabelPattern();
}
