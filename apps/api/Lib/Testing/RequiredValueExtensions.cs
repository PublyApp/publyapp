namespace PublyApp.Api.Lib.Testing;

public static class RequiredValueExtensions {
	public static T Required<T>(this T? value) where T : class {
		if (value is null) {
			throw new InvalidOperationException("Expected a non-null test value.");
		}

		return value;
	}

	public static T Required<T>(this T? value) where T : struct {
		if (value is null) {
			throw new InvalidOperationException("Expected a non-null test value.");
		}

		return value.Value;
	}
}
