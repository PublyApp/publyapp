using System.Net;
using System.Text;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;

public sealed class MastodonClientSpec {
	private static MastodonClient _Client(Func<HttpRequestMessage, HttpResponseMessage> responder, List<string>? seen = null) {
		var services = new ServiceCollection();
		services.AddHttpClient(MastodonHostGuard.HttpClientName)
			.ConfigurePrimaryHttpMessageHandler(() => new StubHandler(request => {
				seen?.Add($"{request.Method} {request.RequestUri}");
				return responder(request);
			}));
		return new MastodonClient(services.BuildServiceProvider().GetRequiredService<IHttpClientFactory>());
	}

	private static HttpResponseMessage _Json(int status, string json) {
		return new HttpResponseMessage((HttpStatusCode)status) {
			Content = new StringContent(json, Encoding.UTF8, "application/json"),
		};
	}

	[Fact]
	public async Task ItShouldReadLimitsFromTheV2InstanceDocument() {
		var client = MastodonClientSpec._Client(_ => MastodonClientSpec._Json(200, """
			{"configuration":{"statuses":{"max_characters":5000,"max_media_attachments":8,"characters_reserved_per_url":23},
			"media_attachments":{"supported_mime_types":["image/jpeg","image/png"],"image_size_limit":10485760}}}
			"""));

		var limits = await client.GetInstanceLimitsAsync("social.example", CancellationToken.None);

		limits.Should().BeEquivalentTo(new MastodonInstanceLimits(5000, 8, 23, 10_485_760, ["image/jpeg", "image/png"]));
	}

	[Fact]
	public async Task ItShouldFallBackToV1WhenV2IsMissing() {
		var seen = new List<string>();
		var client = MastodonClientSpec._Client(request => request.RequestUri?.AbsolutePath == "/api/v2/instance"
			? MastodonClientSpec._Json(404, """{"error":"not found"}""")
			: MastodonClientSpec._Json(200, """{"max_toot_chars":1000}"""), seen);

		var limits = await client.GetInstanceLimitsAsync("old.example", CancellationToken.None);

		limits?.MaxCharacters.Should().Be(1000);
		seen.Should().Equal("GET https://old.example/api/v2/instance", "GET https://old.example/api/v1/instance");
	}

	[Fact]
	public async Task ItShouldReturnNullWhenNeitherDocumentIsAvailable() {
		var client = MastodonClientSpec._Client(_ => throw new HttpRequestException("down"));

		(await client.GetInstanceLimitsAsync("down.example", CancellationToken.None)).Should().BeNull();
	}

	[Fact]
	public async Task ItShouldClassifyAppRegistrationOutcomes() {
		var ok = MastodonClientSpec._Client(_ => MastodonClientSpec._Json(200, """{"client_id":"cid","client_secret":"sec"}"""));
		var refused = MastodonClientSpec._Client(_ => MastodonClientSpec._Json(422, """{"error":"bad"}"""));
		var down = MastodonClientSpec._Client(_ => MastodonClientSpec._Json(503, "{}"));

		(await ok.RegisterAppAsync("a.example", "https://front/x", "read", CancellationToken.None))
			.Should().BeOfType<MastodonResult<MastodonApp>.Ok>().Which.Value.ClientId.Should().Be("cid");
		(await refused.RegisterAppAsync("a.example", "https://front/x", "read", CancellationToken.None))
			.Should().BeOfType<MastodonResult<MastodonApp>.Refused>();
		(await down.RegisterAppAsync("a.example", "https://front/x", "read", CancellationToken.None))
			.Should().BeOfType<MastodonResult<MastodonApp>.Unreachable>();
	}

	private sealed class StubHandler : HttpMessageHandler {
		private readonly Func<HttpRequestMessage, HttpResponseMessage> _Responder;

		public StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) {
			this._Responder = responder;
		}

		protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) {
			return Task.FromResult(this._Responder(request));
		}
	}
}
