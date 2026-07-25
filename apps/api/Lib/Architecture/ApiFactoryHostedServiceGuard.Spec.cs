using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

public sealed class ApiFactoryHostedServiceGuardSpec {
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
