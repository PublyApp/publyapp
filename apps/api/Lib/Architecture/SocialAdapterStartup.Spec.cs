using System.Collections.Frozen;

using FluentAssertions;

using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Http;
using Microsoft.Extensions.Options;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib.Testing.Fakes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Publishing.Providers;
using PublyApp.Api.Modules.SocialAccounts.Adapters;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Providers.Bluesky;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// #2509 review: the adapter table must be built by the REAL host at startup, not by
/// a line in <c>Program.Main</c> that the test host factory would skip. Registering a
/// second adapter that claims an already-served network therefore has to make the
/// host start fail, and the two Bluesky named clients have to stay registered.
/// </summary>
public sealed class SocialAdapterStartupSpec {
	static SocialAdapterStartupSpec() {
		AppEnvironment.Initialize();
	}

	[Fact]
	public void ItShouldFailStartupWhenTwoAdaptersServeTheSameNetwork() {
		using var factory = new DuplicateNetworkFactory();

		var act = () => factory.CreateClient();

		act.Should().Throw<Exception>()
			.Which.ToString().Should().Contain("Mastodon");
	}

	[Fact]
	public void ItShouldRegisterBothBlueskyNamedHttpClients() {
		using var factory = new MinimalHostFactory();
		factory.CreateClient().Dispose();

		var named = factory.Services
			.GetServices<IConfigureOptions<HttpClientFactoryOptions>>()
			.OfType<ConfigureNamedOptions<HttpClientFactoryOptions>>()
			.Select(options => options.Name)
			.ToList();

		named.Should().Contain(BlueskySocialAdapter.WellKnownClientName);
		named.Should().Contain(BlueskySocialAdapter.HttpClientName);

		var publish = factory.Services
			.GetRequiredService<IOptionsMonitor<HttpClientFactoryOptions>>()
			.Get(BlueskySocialAdapter.HttpClientName);
		using var client = new HttpClient();
		foreach (var configure in publish.HttpClientActions) {
			configure(client);
		}

		client.Timeout.Should().Be(TimeSpan.FromSeconds(100));
	}

	/// <summary>Real composition (Program.CreateWebHostBuilder) with no DB needed.</summary>
	private class MinimalHostFactory : WebApplicationFactory<Program> {
		protected override void ConfigureWebHost(IWebHostBuilder builder) {
			builder.UseEnvironment(EnvironmentNames.Testing);
			builder.ConfigureServices(services => {
				services.RemoveAll<DbContextOptions<AppDbContext>>();
				services.RemoveAll<AppDbContext>();
				services.AddDbContext<AppDbContext>(options => options.UseNpgsql(
					"Host=architecture-guard-stub;Database=stub;Username=stub;Password=stub"
				));
				services.RemoveAll<IEmailSender>();
				services.AddSingleton<MemoryEmailAdapter>();
				services.AddSingleton<IEmailSender>(provider =>
					provider.GetRequiredService<MemoryEmailAdapter>()
				);
				ApiFactory.RemoveWorkerHostedServices(services);
			});
		}
	}

	private sealed class DuplicateNetworkFactory : MinimalHostFactory {
		protected override void ConfigureWebHost(IWebHostBuilder builder) {
			base.ConfigureWebHost(builder);
			builder.ConfigureTestServices(services =>
				services.AddSocialAdapter<DuplicateMastodonPublisher>()
			);
		}
	}

	private sealed class DuplicateMastodonPublisher : ISocialPublisher {
		public IReadOnlySet<SocialProvider> Networks { get; } =
			new[] { SocialProvider.Mastodon }.ToFrozenSet();

		public Task<PublishResult> PublishAsync(
			PublishRequest request,
			CancellationToken cancellationToken
		) {
			return Task.FromResult<PublishResult>(new PublishResult.Published("id", "url"));
		}

		public Task<ReconcileResult> ReconcileAsync(
			ReconcileRequest request,
			CancellationToken cancellationToken
		) {
			return Task.FromResult<ReconcileResult>(new ReconcileResult.NeedsReview("stub"));
		}
	}
}
