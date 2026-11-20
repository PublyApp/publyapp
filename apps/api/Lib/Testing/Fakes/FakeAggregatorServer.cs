using System.Net;

namespace PublyApp.Api.Lib.Testing.Fakes;

/// <summary>
/// In-process stand-in for the aggregator's HTTP API (the Zernio subset slice 1 uses):
/// specs never touch the real network. Answers <c>GET /accounts</c> 200 for a key in
/// <see cref="ValidKeys"/>, 401 otherwise, and records every request's path and key.
/// </summary>
public sealed class FakeAggregatorServer : HttpMessageHandler {
	public System.Collections.Concurrent.ConcurrentBag<string> ValidKeys { get; } = [];

	public System.Collections.Concurrent.ConcurrentQueue<(string Path, string? Key)> Requests { get; } = new();

	// When set, every call answers this status instead (503 = down, 429 = limited).
	public HttpStatusCode? ForcedStatus { get; set; }

	protected override Task<HttpResponseMessage> SendAsync(
		HttpRequestMessage request,
		CancellationToken cancellationToken
	) {
		var key = request.Headers.Authorization?.Parameter;
		this.Requests.Enqueue((request.RequestUri?.AbsolutePath ?? string.Empty, key));
		var status = this.ForcedStatus
			?? (key is not null && this.ValidKeys.Contains(key) ? HttpStatusCode.OK : HttpStatusCode.Unauthorized);
		// Never echoes the key; a real aggregator may quote it, which the sanitiser covers.
		return Task.FromResult(new HttpResponseMessage(status) {
			Content = new StringContent("{\"accounts\":[]}", System.Text.Encoding.UTF8, "application/json"),
		});
	}
}
