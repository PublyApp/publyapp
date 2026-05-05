using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Impersonations.Services;
using MainApi.Src.Modules.Invitations.Services;
using MainApi.Src.Modules.Profiles.Services;
using MainApi.Src.Modules.SystemNotices.Services;

using Xunit;

namespace MainApi.Src.Lib.Architecture;

public sealed class ServiceArgsRecordConventionSpec {
	[Fact]
	public void ItShouldUseArgsRecordsForIssue218ServiceMethods() {
		AssertMethodParameterTypeNames<IAuditLogService>(
			"LogAsync",
			"CreateAuditLogArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IImpersonationService>(
			"CreateImpersonationSessionAsync",
			"CreateImpersonationSessionArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationService>(
			"CreateStaffInvitationAsync",
			"CreateStaffInvitationArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationService>(
			"CreateTenantInvitationAsync",
			"CreateTenantInvitationArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationService>(
			"FindStaffInvitationsAsync",
			"FindStaffInvitationsArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationService>(
			"AcceptStaffInvitationAsync",
			"AcceptStaffInvitationArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationService>(
			"AcceptTenantInvitationAsync",
			"AcceptTenantInvitationArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IInvitationService>(
			"BulkCreateStaffInvitationsAsync",
			"BulkCreateStaffInvitationsArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<IProfileAsStaffService>(
			"CreateStaffProfileAsync",
			"CreateStaffProfileArgs",
			nameof(CancellationToken)
		);
		AssertMethodParameterTypeNames<ISystemNoticeService>(
			"FindAsync",
			"FindSystemNoticesArgs",
			nameof(CancellationToken)
		);
	}

	private static void AssertMethodParameterTypeNames<TService>(
		string methodName,
		params string[] expectedParameterTypeNames
	) {
		var method = typeof(TService)
			.GetMethods()
			.Single(methodInfo => methodInfo.Name == methodName);
		var actualParameterTypeNames = method
			.GetParameters()
			.Select(parameter => parameter.ParameterType.Name)
			.ToArray();

		Assert.Equal(expectedParameterTypeNames, actualParameterTypeNames);
	}
}
