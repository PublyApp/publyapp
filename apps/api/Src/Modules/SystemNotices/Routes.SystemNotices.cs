#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace MainApi.Src.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// System notice routes
	/// </summary>
	public static class SystemNotices {
		/// <summary>Staff system notice routes</summary>
		public static class ForStaff {
			public const string Root = "/notices";
			public const string Create = "/";
			public const string Find = "/";
			public const string GetById = "/{noticeId}";
			public static string GetByIdFn(string noticeId) => $"/{noticeId}";
			public const string Update = "/{noticeId}";
			public static string UpdateFn(string noticeId) => $"/{noticeId}";
			public const string Delete = "/{noticeId}";
			public static string DeleteFn(string noticeId) => $"/{noticeId}";
		}

		/// <summary>Anonymous system notice routes (public)</summary>
		public static class Anonymous {
			public const string Root = "/notices";
			public const string GetActive = $"{Root}/active";
		}
	}
}
