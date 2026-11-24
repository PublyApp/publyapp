using PublyApp.Api.Modules.Aggregators.Ports;

namespace PublyApp.Api.Modules.Aggregators.Adapters.Zernio;

/// <summary>
/// The only place that knows Zernio's URLs and answers. The base URL is fixed in code (no
/// user-supplied host), and the key is sent as a bearer header only, never logged or echoed.
/// </summary>
public sealed class ZernioAggregatorAdapter : IAggregatorAdapter {
	public const string HttpClientName = "Aggregator-zernio";
	public const string BaseUrl = "https://zernio.com/api/v1/";
	private const string _Name = "Zernio";

	private readonly IHttpClientFactory _HttpClientFactory;

	public ZernioAggregatorAdapter(IHttpClientFactory httpClientFactory) {
		this._HttpClientFactory = httpClientFactory;
	}

	public AggregatorKind Kind {
		get { return AggregatorKind.Zernio; }
	}

	public AggregatorMetadata Describe() {
		return new AggregatorMetadata(
			ZernioAggregatorAdapter._Name,
			"https://docs.zernio.com/quickstart",
			["facebook", "instagram"]
		);
	}

	public async Task<KeyCheck> CheckKeyAsync(string apiKey, CancellationToken cancellationToken) {
		var client = this._HttpClientFactory.CreateClient(ZernioAggregatorAdapter.HttpClientName);
		using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(new Uri(ZernioAggregatorAdapter.BaseUrl), "accounts"));
		request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
		try {
			using var response = await client.SendAsync(request, cancellationToken);
			return ZernioAggregatorAdapter._Classify((int)response.StatusCode);
		} catch (HttpRequestException) {
			return ZernioAggregatorAdapter._Unreachable();
		} catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) {
			return ZernioAggregatorAdapter._Unreachable();
		}
	}

	private static KeyCheck _Classify(int status) {
		if (status is >= 200 and < 300) {
			return new KeyCheck.Valid();
		}

		if (status is 401 or 403) {
			return new KeyCheck.Rejected($"{ZernioAggregatorAdapter._Name} refused this key. Check it and paste it again.");
		}

		return ZernioAggregatorAdapter._Unreachable();
	}

	private static KeyCheck.Unreachable _Unreachable() {
		return new KeyCheck.Unreachable(
			$"{ZernioAggregatorAdapter._Name} could not be reached. Nothing was stored; try again shortly."
		);
	}
}
