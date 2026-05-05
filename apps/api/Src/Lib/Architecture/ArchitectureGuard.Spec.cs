
using System.Reflection;

using FluentAssertions;

using Xunit;

namespace MainApi.Src.Lib.Architecture {
	public sealed class ArchitectureGuardSpec {
		[Fact]
		public void
		ItShouldRejectPatchFieldInHttpDtos() {
			Assembly apiAssembly = typeof(Program).Assembly;

			IEnumerable<Type> dtoTypes = apiAssembly
				.GetTypes()
				.Where(t =>
					t.Namespace?.Contains(".Handlers.")
						== true)
				.Where(t =>
					!t.Name.EndsWith("Validator")
					&& !t.Name.Contains('<'));

			List<string> offenders = dtoTypes
				.SelectMany(t =>
					t.GetProperties()
						.Select(p => (Type: t, Prop: p)))
				.Where(x =>
					ContainsPatchField(x.Prop.PropertyType))
				.Select(x =>
					$"{x.Type.Name}.{x.Prop.Name}")
				.ToList();

			_ = offenders.Should().BeEmpty(
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
				Type? elementType = type.GetElementType();
				return elementType is not null && ContainsPatchField(
					elementType, visited
				);
			}

			if (type.IsArray) {
				Type? elementType = type.GetElementType();
				return elementType is not null && ContainsPatchField(
					elementType, visited
				);
			}

			return (type.IsGenericType
				&& type.GetGenericArguments()
					.Any(arg =>
						ContainsPatchField(
							arg, visited
						))) || (!IsTerminalType(type) && visited.Add(type) && type.GetProperties(
				BindingFlags.Public
				| BindingFlags.Instance
			).Any(prop =>
				ContainsPatchField(
					prop.PropertyType, visited
				)));
		}

		private static bool IsTerminalType(Type type) {
			return type.IsPrimitive || type.IsEnum || type == typeof(string)
				|| type == typeof(decimal)
				|| type == typeof(DateTime)
				|| type == typeof(DateTimeOffset)
				|| type == typeof(Guid)
				|| type == typeof(TimeSpan) || type.Namespace?.StartsWith(
				"System",
				StringComparison.Ordinal
			) == true;
		}
	}

}
