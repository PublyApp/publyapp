#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace MainApi.Src.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	/// <summary>
	/// Permission routes
	/// </summary>
	public static class Permissions {
		/// <summary>Staff permission routes</summary>
		public static class ForStaff {
			public const string Root = "/staff/permissions";
			public const string Find = $"{Root}/";
		}
	}
}
