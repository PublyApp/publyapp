using System.Text.RegularExpressions;

namespace MainApi.Src.Lib.Utils;

public static class PathUtils {
#pragma warning disable SYSLIB1045 // Convert to 'GeneratedRegexAttribute'.
	private static readonly Regex CollapseSlashesRegex = new("/+", RegexOptions.Compiled);
#pragma warning restore SYSLIB1045 // Convert to 'GeneratedRegexAttribute'.

	public static string Join(params string[] paths) {
		return CollapseSlashesRegex.Replace("/" + string.Join("/", paths), "/");
	}

	public static string GetLastSegment(string path, int n = 1) {
		return "/" + string.Join("/", path.Split('/').TakeLast(n));
	}
}
