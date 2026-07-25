using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

using PublyApp.Api.Infrastructure.Messaging.Email;

using Xunit;

namespace PublyApp.Api.Lib.Testing.Fixtures;

public sealed class ApiFactorySpec {
	[Fact]
	public void ItShouldRemoveInvitationEmailDispatcherFromIntegrationHost() {
		ServiceCollection services = [];
		services.AddHostedService<InvitationEmailOutboxDispatcher>();

		ApiFactory.RemoveWorkerHostedServices(services);

		services.Should().NotContain(descriptor =>
			descriptor.ServiceType == typeof(IHostedService)
			&& descriptor.ImplementationType == typeof(InvitationEmailOutboxDispatcher)
		);
	}
}
