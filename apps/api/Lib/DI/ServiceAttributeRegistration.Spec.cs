
using System.Reflection;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Account.Services;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Auth.Services;
using PublyApp.Api.Modules.Impersonations.Services;
using PublyApp.Api.Modules.Invitations.Services;
using PublyApp.Api.Modules.Jobs.Services;
using PublyApp.Api.Modules.Messaging.Services;
using PublyApp.Api.Modules.Permissions.Services;
using PublyApp.Api.Modules.Posts.Services;
using PublyApp.Api.Modules.Profiles.Services;
using PublyApp.Api.Modules.Projects.Services;
using PublyApp.Api.Modules.Publishing.Services;
using PublyApp.Api.Modules.SocialAccounts.Services;
using PublyApp.Api.Modules.SystemNotices.Services;
using PublyApp.Api.Modules.Tenants.Services;
using PublyApp.Api.Modules.Uploads.Services;
using PublyApp.Api.Modules.Users.Services;

using Xunit;

namespace PublyApp.Api.Lib.DI;

public sealed class ServiceAttributeRegistrationSpec
	: IClassFixture<ApiFixture> {
	private sealed record QualifyingService(
		Type ServiceType,
		Type ImplementationType
	);

	private static readonly (
		Type ServiceType,
		Type ImplementationType
	)[] ExpectedServices = [
		(typeof(IAccountProfileService), typeof(AccountProfileService)),
		(typeof(IAccountService), typeof(AccountService)),
		(typeof(IAuditLogQueryService), typeof(AuditLogQueryService)),
		(typeof(IAuditLogService), typeof(AuditLogService)),
		(typeof(IAuthService), typeof(AuthService)),
		(typeof(IEmailLogWriter), typeof(EmailLogWriter)),
		(typeof(IJobDeadLetterService), typeof(JobDeadLetterService)),
		(typeof(ICreateStaffUserService), typeof(CreateStaffUserService)),
		(typeof(IInvitationAcceptanceService), typeof(InvitationAcceptanceService)),
		(typeof(IImpersonationService), typeof(ImpersonationService)),
		(typeof(IInvitationQueryService), typeof(InvitationQueryService)),
		(typeof(IInvitationRevokeService), typeof(InvitationRevokeService)),
		(typeof(IVerifyEmailRequestService), typeof(VerifyEmailRequestService)),
		(typeof(IInvitationService), typeof(InvitationService)),
		(typeof(IPermissionAsStaffService), typeof(PermissionAsStaffService)),
		(typeof(IPermissionService), typeof(PermissionService)),
		(typeof(IPasswordResetService), typeof(PasswordResetService)),
		(typeof(IStaffProfileAsStaffService), typeof(StaffProfileAsStaffService)),
		(typeof(IStaffProfileQueryAsStaffService), typeof(StaffProfileQueryAsStaffService)),
		(typeof(IProfileService), typeof(ProfileService)),
		(typeof(IStaffProfileUserAssignmentAsStaffService), typeof(StaffProfileUserAssignmentAsStaffService)),
		(typeof(ITenantProfileAsStaffService), typeof(TenantProfileAsStaffService)),
		(typeof(ITenantProfileQueryAsStaffService), typeof(TenantProfileQueryAsStaffService)),
		(typeof(IProjectService), typeof(ProjectService)),
		(typeof(IPostMediaAssetService), typeof(PostMediaAssetService)),
		(typeof(IPostService), typeof(PostService)),
		(typeof(IPublicationQueueService), typeof(PublicationQueueService)),
		(typeof(IPublicationStatusTransitionService), typeof(PublicationStatusTransitionService)),
		(typeof(ISessionService), typeof(SessionService)),
		(typeof(IStaffUserCoreService), typeof(StaffUserCoreService)),
		(typeof(IStaffUserLifecycleService), typeof(StaffUserLifecycleService)),
		(typeof(IStaffUserProfileAssignmentService), typeof(StaffUserProfileAssignmentService)),
		(typeof(IStaffUserQueryService), typeof(StaffUserQueryService)),
		(typeof(ISystemNoticeService), typeof(SystemNoticeService)),
		(typeof(ITenantAsStaffService), typeof(TenantAsStaffService)),
		(typeof(ITenantService), typeof(TenantService)),
		(typeof(ITenantUserIdentityService), typeof(TenantUserIdentityService)),
		(typeof(ITenantUserMembershipService), typeof(TenantUserMembershipService)),
		(typeof(ITenantUserCompanyMembershipService), typeof(TenantUserCompanyMembershipService)),
		(typeof(ITenantUserCompanyQueryService), typeof(TenantUserCompanyQueryService)),
		(typeof(ITenantUserQueryService), typeof(TenantUserQueryService)),
		(typeof(IUploadAssetReferenceService), typeof(UploadAssetReferenceService)),
		(typeof(IUserService), typeof(UserService)),
		(typeof(ICredentialProtector), typeof(CredentialProtector))
	];

	// Services registered BY HAND in Lib/DI/ServiceRegistration.cs instead of via
	// [Service] auto-discovery. The credential protector is deliberately not attributed
	// (its IDataProtectionProvider wiring is explicit); the scanner therefore never sees
	// it, so the scanner-vs-convention comparison below excludes it here.
	private static readonly (
		Type ServiceType,
		Type ImplementationType
	)[] ExplicitlyRegisteredServices = [
		(typeof(ICredentialProtector), typeof(CredentialProtector)),
	];

	private static bool IsExplicitlyRegistered(QualifyingService service) {
		return ExplicitlyRegisteredServices.Any(candidate =>
			candidate.ServiceType == service.ServiceType
		);
	}

	private readonly ApiFixture _fixture;

	public ServiceAttributeRegistrationSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
	}

	[Fact]
	public void
	ItShouldDiscoverAllQualifyingModuleServicesForAttributeRegistration() {
		var qualifyingServices =
			GetQualifyingModuleServices();

		qualifyingServices.Should().BeEquivalentTo(
			ExpectedServices
				.Select(x => new QualifyingService(
					x.ServiceType,
					x.ImplementationType
				))
				.ToArray()
		);

		var discoveredServices =
			ServiceScanner.ScanAssembly<Program>();

		ServiceValidator.Validate(discoveredServices);

		var actualServices = discoveredServices
			.Where(x => x.ServiceInterface is not null)
			.Select(x => new {
				ServiceType = x.ServiceInterface,
				x.ImplementationType,
				x.Lifetime,
				x.Key
			})
			.ToList();

		actualServices.Should().BeEquivalentTo(
			qualifyingServices
				.Where(x => !IsExplicitlyRegistered(x))
				.Select(x => new {
					x.ServiceType,
					x.ImplementationType,
					Lifetime = ServiceLifetime.Scoped,
					Key = (string?)null
				})
		);
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

	private static QualifyingService[] GetQualifyingModuleServices() {
		Assembly assembly = typeof(Program).Assembly;

		return assembly
			.GetTypes()
			.Where(type =>
				type is {
					IsClass: true,
					IsAbstract: false,
					IsGenericTypeDefinition: false,
					ContainsGenericParameters: false
				})
			.Where(type =>
				type.Namespace is not null
				&& type.Namespace.StartsWith(
					"PublyApp.Api.Modules.",
					StringComparison.Ordinal
				)
				&& type.Namespace.Contains(
					".Services",
					StringComparison.Ordinal
				))
			.Select(type => new {
				ImplementationType = type,
				ServiceType = type
					.GetInterfaces()
					.SingleOrDefault(@interface =>
						@interface.Name == $"I{type.Name}"
					)
			})
			.Where(x => x.ServiceType is not null)
			.Select(x => {
				if (x.ServiceType is null) {
					throw new InvalidOperationException(
						$"Service '{x.ImplementationType.FullName}' has no matching interface."
					);
				}

				return new QualifyingService(
					x.ServiceType,
					x.ImplementationType
				);
			})
			.ToArray();
	}
}
