#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace PublyApp.Api.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>Aggregator (unified social API) key routes, tenant-scoped, root scope.</summary>
	public static class Aggregators {
		public static class ForTenant {
			public const string Root = "/aggregators";
			public const string Find = "/";
			public const string Connection = "/{kind}/connection";
			public const string TestConnection = "/{kind}/connection/check";
		}
	}
}
