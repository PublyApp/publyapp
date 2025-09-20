using MainApi.Src.Lib.Utils;

namespace MainApi.Src.Lib;

#pragma warning disable IDE0002
public static class RoutePath {
	public static class Staff {
		public static readonly string Root = "/staff";
		public static class Tenants {
			public static readonly string Root = PathUtils.Join(RoutePath.Staff.Root, "/tenants");
			public static readonly string Create = PathUtils.Join(RoutePath.Staff.Tenants.Root, "/");
		}
	};
	public static class Tenant {
		public static readonly string Root = "/tenant";
		public static class Users {
			public static readonly string Root = PathUtils.Join(Tenant.Root, "/users");
			public const string Create = "create";
		}
	}
}
#pragma warning restore IDE0002
