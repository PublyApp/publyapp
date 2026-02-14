#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace MainApi.Src.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	public static class AuditLogs {
		public static class ForStaff {
			public const string Root = "/audit-logs";
			public const string Find = "/";
			public const string GetById = "/{logId:guid}";
			public static string GetByIdFn(string logId) => $"/{logId}";
			public const string Actions = "/actions";
			public const string Export = "/export";
		}
	}
}
