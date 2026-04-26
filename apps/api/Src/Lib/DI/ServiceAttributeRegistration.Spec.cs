namespace MainApi.Src.Lib.DI;

using FluentAssertions;

using MainApi.Src.Lib;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Auth.Services;
using MainApi.Src.Modules.Impersonations.Services;
using MainApi.Src.Modules.Invitations.Services;
using MainApi.Src.Modules.Permissions.Services;
using MainApi.Src.Modules.Profiles.Services;
using MainApi.Src.Modules.Projects.Services;
using MainApi.Src.Modules.SystemNotices.Services;
using MainApi.Src.Modules.Tenants.Services;
using MainApi.Src.Modules.Users.Services;

using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class ServiceAttributeRegistrationSpec
	: IClassFixture<ApiFixture> {
	private static readonly (
		Type ServiceType,
		Type ImplementationType
	)[] ExpectedServices = [
		(typeof(IAccountService), typeof(AccountService)),
		(typeof(IAuditLogQueryService), typeof(AuditLogQueryService)),
		(typeof(IAuditLogService), typeof(AuditLogService)),
		(typeof(IAuthService), typeof(AuthService)),
		(typeof(IImpersonationService), typeof(ImpersonationService)),
		(typeof(IInvitationService), typeof(InvitationService)),
		(typeof(IPermissionAsStaffService), typeof(PermissionAsStaffService)),
		(typeof(IPermissionService), typeof(PermissionService)),
		(typeof(IProfileAsStaffService), typeof(ProfileAsStaffService)),
		(typeof(IProfileService), typeof(ProfileService)),
		(typeof(IProjectService), typeof(ProjectService)),
		(typeof(ISessionService), typeof(SessionService)),
		(typeof(ISystemNoticeService), typeof(SystemNoticeService)),
		(typeof(ITenantAsStaffService), typeof(TenantAsStaffService)),
		(typeof(ITenantService), typeof(TenantService)),
		(typeof(IUserService), typeof(UserService))
	];

	private readonly ApiFixture _fixture;

	public ServiceAttributeRegistrationSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
	}

	[Fact]
	public void
	ItShouldDiscoverAllQualifyingModuleServicesForAttributeRegistration() {
		var discoveredServices =
			ServiceScanner.ScanAssembly<Program>();

		ServiceValidator.Validate(discoveredServices);

		var actualServices = discoveredServices
			.Where(x => x.ServiceInterface is not null)
			.Select(x => new {
				ServiceType = x.ServiceInterface!,
				x.ImplementationType,
				x.Lifetime,
				x.Key
			})
			.ToList();

		actualServices.Should().HaveCount(
			ExpectedServices.Length
		);

		foreach (var (
			serviceType,
			implementationType
		) in ExpectedServices) {
			actualServices.Should().Contain(x =>
				x.ServiceType == serviceType
				&& x.ImplementationType
					== implementationType
				&& x.Lifetime
					== ServiceLifetime.Scoped
				&& x.Key == null
			);
		}
	}

	[Fact]
	public async Task
	ItShouldResolveAllAttributeRegisteredModuleServicesFromTheApplicationContainer() {
		await using var scope =
			_fixture.Factory.Services
				.CreateAsyncScope();

		foreach (var (
			serviceType,
			implementationType
		) in ExpectedServices) {
			var resolved = scope.ServiceProvider
				.GetRequiredService(serviceType);

			resolved.Should().NotBeNull();
			resolved.GetType().Should()
				.Be(implementationType);
		}

		var requestAuthContext = scope
			.ServiceProvider
			.GetRequiredService<
				IRequestAuthContext
			>();

		requestAuthContext.Should()
			.BeOfType<RequestAuthContext>();
	}
}
