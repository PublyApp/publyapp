using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

using PublyApp.Api.Lib;
using PublyApp.Api.Modules.SocialAccounts.Services;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// #2511 review (minor): <see cref="UnimplementedSocialSessionAdapter"/> now lives in its
/// own file. The contract that mattered when it was declared inside the DI file is still
/// the one proven here against the real worker composition: the placeholder is RESOLVABLE
/// (startup handler validation must not brick) but throws on first USE, so a publish job
/// can never silently run against a fake session.
/// </summary>
public sealed class UnimplementedSocialSessionAdapterSpec {
	static UnimplementedSocialSessionAdapterSpec() {
		AppEnvironment.Initialize();
	}

	[Fact]
	public void ItShouldStayResolvableInTheRealWorkerComposition() {
		using var provider = UnimplementedSocialSessionAdapterSpec._BuildWorkerServices();
		using var scope = provider.CreateScope();

		var resolved = scope.ServiceProvider.GetRequiredService<ISocialSessionProvider>();

		resolved.Should().BeOfType<UnimplementedSocialSessionAdapter>();
	}

	[Fact]
	public async Task ItShouldThrowLoudlyOnFirstUseInsteadOfOpeningAFakeSession() {
		using var provider = UnimplementedSocialSessionAdapterSpec._BuildWorkerServices();
		using var scope = provider.CreateScope();
		var placeholder = scope.ServiceProvider.GetRequiredService<ISocialSessionProvider>();

		var act = () => placeholder.OpenSessionAsync(Guid.NewGuid(), CancellationToken.None);

		(await act.Should().ThrowAsync<InvalidOperationException>())
			.Which.Message.Should().Contain("ISocialSessionProvider has no implementation registered");
	}

	private static ServiceProvider _BuildWorkerServices() {
		var builder = Host.CreateApplicationBuilder();
		builder.AddWorkerServices();
		return builder.Services.BuildServiceProvider();
	}
}
