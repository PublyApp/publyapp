namespace MainApi.Src.Lib.Utils;
using System.Text.RegularExpressions;

public static partial class PathUtils {
	[GeneratedRegex("/+")]
	private static partial Regex CollapseSlashesRegex();

	public static string Join(params string[] paths) {
		return CollapseSlashesRegex().Replace("/" + string.Join("/", paths), "/");
	}

	public static string GetLastSegment(string path, int n = 1) {
		return "/" + string.Join("/", path.Split('/').TakeLast(n));
	}

}
