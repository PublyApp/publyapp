using MainApi.Src.Lib.Utils;

namespace MainApi.Src.Lib;

#pragma warning disable IDE0002
public static class RoutePath {
	public static class Auth {
		public static readonly string Root = "/auth";
		public static readonly string Login = PathUtils.Join(RoutePath.Auth.Root, "/login");
		public static readonly string Register = PathUtils.Join(RoutePath.Auth.Root, "/register");
		public static readonly string GetUserAuthData = PathUtils.Join(RoutePath.Auth.Root, "/user-auth-data");
		public static readonly string GetTenantAuthData = PathUtils.Join(RoutePath.Auth.Root, "/tenant-auth-data");
		public static readonly string VerifyEmailRequest = PathUtils.Join(RoutePath.Auth.Root, "/verify-email-request");
		public static readonly string GetVerificationLink = PathUtils.Join(RoutePath.Auth.Root, "/verification-link");
		public static readonly string GetRedirectCode = PathUtils.Join(RoutePath.Auth.Root, "/redirect-code");
		public static readonly string CheckEmailVerificationToken = PathUtils.Join(RoutePath.Auth.Root, "/check-email-verification-token");
		public static readonly string CheckResetPasswordToken = PathUtils.Join(RoutePath.Auth.Root, "/check-reset-password-token");
		public static readonly string ResetPassword = PathUtils.Join(RoutePath.Auth.Root, "/reset-password");
		public static readonly string CheckInvitationToken = PathUtils.Join(RoutePath.Auth.Root, "/check-invitation-token");
	}
	public static class Invitations {
		public static readonly string Root = "/invitations";
		public static readonly string DetailsByToken = PathUtils.Join(RoutePath.Invitations.Root, "/{token}/details");
		public static string DetailsByTokenFn(string token) {
			return PathUtils.Join(RoutePath.Invitations.Root, $"/{token}/details");
		}
		public static readonly string AcceptByToken = PathUtils.Join(RoutePath.Invitations.Root, "/{token}/accept");
		public static string AcceptByTokenFn(string token) {
			return PathUtils.Join(RoutePath.Invitations.Root, $"/{token}/accept");
		}
	}
	public static class Staff {
		public static readonly string Root = "/staff";
		public static class Permissions {
			public static readonly string Root = PathUtils.Join(RoutePath.Staff.Root, "/permissions");
			public static readonly string Find = PathUtils.Join(RoutePath.Staff.Permissions.Root, "/");
		}
		public static class Profiles {
			public static readonly string Root = PathUtils.Join(RoutePath.Staff.Root, "/profiles");
			public static readonly string CreateForStaff = PathUtils.Join(RoutePath.Staff.Profiles.Root, "/");
			public static readonly string FindForStaff = PathUtils.Join(RoutePath.Staff.Profiles.Root, "/");
			public static readonly string FindForTenant = PathUtils.Join(RoutePath.Staff.Profiles.Root, "/tenant/{tenantId}");
			public static string FindForTenantFn(string tenantId) {
				return PathUtils.Join(RoutePath.Staff.Profiles.Root, $"/tenant/{tenantId}");
			}
		}
		public static class StaffMember {
			public static readonly string Root = PathUtils.Join(RoutePath.Staff.Root, "/staff-members");
			public static readonly string Create = PathUtils.Join(RoutePath.Staff.StaffMember.Root, "/");
			public static readonly string GetById = PathUtils.Join(RoutePath.Staff.StaffMember.Root, "/{userId}");
			public static string GetByIdFn(string userId) {
				return PathUtils.Join(RoutePath.Staff.StaffMember.Root, $"/{userId}");
			}
			public static readonly string Find = PathUtils.Join(RoutePath.Staff.StaffMember.Root, "/");
			public static readonly string Update = PathUtils.Join(RoutePath.Staff.StaffMember.Root, "/{userId}");
			public static string UpdateFn(string userId) {
				return PathUtils.Join(RoutePath.Staff.StaffMember.Root, $"/{userId}");
			}
		}
		public static class Tenants {
			public static readonly string Root = PathUtils.Join(RoutePath.Staff.Root, "/tenants");
			public static readonly string Create = PathUtils.Join(RoutePath.Staff.Tenants.Root, "/");
			public static readonly string Find = PathUtils.Join(RoutePath.Staff.Tenants.Root, "/");
			public static readonly string GetById = PathUtils.Join(RoutePath.Staff.Tenants.Root, "/{tenantId}");
			public static string GetByIdFn(string tenantId) {
				return PathUtils.Join(RoutePath.Staff.Tenants.Root, $"/{tenantId}");
			}
		}
		public static class Invitations {
			public static readonly string Root = PathUtils.Join(RoutePath.Staff.Root, "/invitations");
			public static readonly string Create = PathUtils.Join(RoutePath.Staff.Invitations.Root, "/");
			public static readonly string Find = PathUtils.Join(RoutePath.Staff.Invitations.Root, "/");
			public static readonly string RevokeById = PathUtils.Join(RoutePath.Staff.Invitations.Root, "/{invitationId}");
			public static readonly string BulkCreate = PathUtils.Join(RoutePath.Staff.Invitations.Root, "/bulk");
			public static string RevokeByIdFn(string invitationId) {
				return PathUtils.Join(RoutePath.Staff.Invitations.Root, $"/{invitationId}");
			}
		}
	};
	public static class Tenant {
		public static readonly string Root = "/tenant";
		public static class Users {
			public static readonly string Root = PathUtils.Join(RoutePath.Tenant.Root, "/users");
			public const string Create = "create";
		}
	}
}
#pragma warning restore IDE0002
