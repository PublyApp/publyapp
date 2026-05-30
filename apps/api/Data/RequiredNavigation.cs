namespace PublyApp.Api.Data;

internal static class RequiredNavigation {
	public static T Get<T>(T? value, string ownerName, string propertyName) where T : class {
		if (value is null) {
			throw new InvalidOperationException($"{ownerName}.{propertyName} must not be null");
		}

		return value;
	}
}
