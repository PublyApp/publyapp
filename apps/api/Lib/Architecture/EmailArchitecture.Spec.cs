using System.Reflection;

using FluentAssertions;

using PublyApp.Api.Infrastructure.Messaging.Email;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// #2514 owner guardrail for the ports-and-adapters rule: business code (controllers,
/// jobs, handlers) calls <see cref="EmailService"/>, never the <see cref="IEmailSender"/>
/// port; and the production assembly has exactly ONE provider adapter. The Roslyn
/// analyzer is not available yet, so this reflection scan is the executable check.
/// </summary>
public sealed class EmailArchitectureSpec {
	private static readonly Type[] _AllowedSenderConsumers = [typeof(EmailService)];

	[Fact]
	public void ItShouldOnlyLetEmailServiceTakeTheEmailSenderPort() {
		var offenders = typeof(Program).Assembly
			.GetTypes()
			.Where(type => !EmailArchitectureSpec._AllowedSenderConsumers.Contains(type))
			.SelectMany(type => type
				.GetConstructors(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)
				.Where(constructor => constructor
					.GetParameters()
					.Any(parameter => parameter.ParameterType == typeof(IEmailSender)))
				.Select(constructor => $"{type.FullName}({string.Join(", ", constructor
					.GetParameters()
					.Select(parameter => parameter.ParameterType.Name))})"))
			.ToList();

		offenders.Should().BeEmpty(
			"only EmailService may take IEmailSender; business code must call the service"
		);
	}

	[Fact]
	public void ItShouldHaveExactlyOneProductionEmailSenderAdapter() {
		var adapters = typeof(Program).Assembly
			.GetTypes()
			.Where(type => type is { IsClass: true, IsAbstract: false })
			.Where(type => typeof(IEmailSender).IsAssignableFrom(type))
			.ToList();

		adapters.Should().ContainSingle()
			.Which.Should().Be(typeof(ResendEmailAdapter));
	}
}
