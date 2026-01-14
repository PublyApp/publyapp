namespace MainApi.Src.Lib.Routes;

/// <summary>
/// Central route constants. Each domain module contributes via partial class.
/// </summary>
public static partial class Routes {
	/// <summary>Staff scope root (/staff/*)</summary>
	public static class Staff {
		public const string Root = "/staff";
	}

	/// <summary>Tenant scope root (/tenant/*)</summary>
	public static class Tenant {
		public const string Root = "/tenant";
	}
}
