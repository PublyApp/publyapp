namespace MainApi.Src.Lib;

using System.Reflection;

using FluentAssertions;

using Xunit;

public sealed class ArchitectureGuardSpec {
	[Fact]
	public void
	ItShouldRejectPatchFieldInHttpDtos() {
		var apiAssembly = typeof(Program).Assembly;

		var dtoTypes = apiAssembly
			.GetTypes()
			.Where(t =>
				t.Namespace?.Contains(".Handlers.")
					== true)
			.Where(t =>
				!t.Name.EndsWith("Validator")
				&& !t.Name.Contains("<"));

		var offenders = dtoTypes
			.SelectMany(t =>
				t.GetProperties()
					.Select(p => (Type: t, Prop: p)))
			.Where(x =>
				ContainsPatchField(x.Prop.PropertyType))
			.Select(x =>
				$"{x.Type.Name}.{x.Prop.Name}")
			.ToList();

		offenders.Should().BeEmpty(
			"PatchField<T> must not appear in HTTP "
			+ "wire DTOs (Body/Query/Response records). "
			+ "Use it only in service args records."
		);
	}

	private static bool ContainsPatchField(Type type) {
		return ContainsPatchField(
			type,
			new HashSet<Type>()
		);
	}

	private static bool ContainsPatchField(
		Type type,
		HashSet<Type> visited
	) {
		if (type.IsGenericType
			&& type.GetGenericTypeDefinition()
				== typeof(PatchField<>)) {
			return true;
		}

		if (type.IsByRef || type.IsPointer) {
			var elementType = type.GetElementType();
			if (elementType is null) {
				return false;
			}
			return ContainsPatchField(
				elementType, visited
			);
		}

		if (type.IsArray) {
			var elementType = type.GetElementType();
			if (elementType is null) {
				return false;
			}
			return ContainsPatchField(
				elementType, visited
			);
		}

		if (type.IsGenericType
			&& type.GetGenericArguments()
				.Any(arg =>
					ContainsPatchField(
						arg, visited
					))) {
			return true;
		}

		if (IsTerminalType(type)) {
			return false;
		}

		if (!visited.Add(type)) {
			return false;
		}

		return type.GetProperties(
			BindingFlags.Public
			| BindingFlags.Instance
		).Any(prop =>
			ContainsPatchField(
				prop.PropertyType, visited
			));
	}

	private static bool IsTerminalType(Type type) {
		if (type.IsPrimitive || type.IsEnum) {
			return true;
		}

		if (type == typeof(string)
			|| type == typeof(decimal)
			|| type == typeof(DateTime)
			|| type == typeof(DateTimeOffset)
			|| type == typeof(Guid)
			|| type == typeof(TimeSpan)) {
			return true;
		}

		return type.Namespace?.StartsWith(
			"System",
			StringComparison.Ordinal
		) == true;
	}
}
