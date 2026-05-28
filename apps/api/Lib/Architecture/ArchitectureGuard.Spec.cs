
using System.Reflection;

using FluentAssertions;

using MainApi.Data.DbContext;
using MainApi.Lib.Testing.Helpers;
using MainApi.Modules.Auth.Entities;
using MainApi.Modules.Profiles.Entities;
using MainApi.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;

using Xunit;

namespace MainApi.Lib.Architecture {
	/// <summary>
	/// Architecture guards: executable enforcement of backend conventions that
	/// otherwise live only as prose in AGENTS.md / the guides. Each fact scans the
	/// compiled EF model or assembly (via reflection) and fails the build with the
	/// concrete offender when a convention regresses — cheaper and more reliable
	/// than catching it in review. This class covers data-model invariants
	/// (composite junction keys, no soft-delete columns on Session) and
	/// HTTP-contract hygiene (no PatchField&lt;T&gt; in wire DTOs). See
	/// docs/guides/test-conventions.md ("Architecture Tests") for the rationale and
	/// the architecture-test vs Roslyn-analyzer split (#357 / #350).
	/// </summary>
	public sealed class ArchitectureGuardSpec {
		static ArchitectureGuardSpec() {
			AppEnvironment.Initialize();
		}

		[Fact]
		public void
		ItShouldKeepSessionCredentialRowsWithoutSoftDeleteColumns() {
			var options = new DbContextOptionsBuilder<MainApiDbContext>()
				.UseNpgsql("Host=localhost;Database=architecture_guard")
				.Options;
			using var dbContext = new MainApiDbContext(options);

			var entityType = dbContext.Model.FindEntityType(typeof(Session));
			entityType.Should().NotBeNull();
			if (entityType is null) {
				throw new InvalidOperationException("Session entity type was not found.");
			}

			entityType.FindProperty("Id").Should().NotBeNull();
			entityType.FindProperty("CreatedAt").Should().NotBeNull();
			entityType.FindProperty("UpdatedAt").Should().NotBeNull();
			entityType.FindProperty("IsDeleted").Should().BeNull();
			entityType.FindProperty("DeletedAt").Should().BeNull();

			var idProperty = entityType.FindProperty("Id");
			idProperty.Should().NotBeNull();
			if (idProperty is null) {
				throw new InvalidOperationException("Session id property was not found.");
			}

			idProperty.GetDefaultValueSql().Should().Be("uuidv7()");
		}

		[Fact]
		public void
		ItShouldRejectPatchFieldInHttpDtos() {
			// Scan handler HTTP wire DTO records
			// (Body/Query/Result/Response/Item) via the shared discovery
			// helper so this guard tracks every contract type, not just an
			// ad-hoc namespace scan. Report the concrete Type.Property pair.
			IReadOnlyList<Type> dtoTypes =
				ArchitectureDiscoveryHelper.EnumerateWireDtoTypes();

			// Vacuity guard: an empty discovery would make the offender
			// check pass for the wrong reason.
			_ = dtoTypes.Should().NotBeEmpty(
				"handler wire DTO discovery must find Body/Query/"
				+ "Result/Response/Item records to scan."
			);

			List<string> offenders = dtoTypes
				.SelectMany(t =>
					t.GetProperties()
						.Select(p => (Type: t, Prop: p)))
				.Where(x =>
					ContainsPatchField(x.Prop.PropertyType))
				.Select(x =>
					$"{x.Type.Name}.{x.Prop.Name}")
				.OrderBy(name => name, StringComparer.Ordinal)
				.ToList();

			_ = offenders.Should().BeEmpty(
				"PatchField<T> must not appear in HTTP "
				+ "wire DTOs (Body/Query/Result/Response/Item records). "
				+ "Use it only in service args records."
			);
		}

		[Fact]
		public void ItShouldUseCompositeKeysForJunctionTables() {
			// This guard protects the junction-table convention from drifting back to
			// BaseAttributes, which would silently reintroduce id/soft-delete columns.
			var options = new DbContextOptionsBuilder<MainApiDbContext>()
				.UseNpgsql("Host=localhost;Database=architecture_guard")
				.Options;
			using var dbContext = new MainApiDbContext(options);

			AssertCompositeJunctionKey<UserAccountProfile>(
				dbContext,
				[nameof(UserAccountProfile.UserAccountId), nameof(UserAccountProfile.ProfileId)]
			);
			AssertCompositeJunctionKey<ProfilePermission>(
				dbContext,
				[nameof(ProfilePermission.ProfileId), nameof(ProfilePermission.PermissionKey)]
			);
		}

		private static void AssertCompositeJunctionKey<TEntity>(
			MainApiDbContext dbContext,
			string[] expectedKeyPropertyNames
		) {
			var entityType = dbContext.Model.FindEntityType(typeof(TEntity));
			entityType.Should().NotBeNull();

			var primaryKeyPropertyNames = entityType!.FindPrimaryKey()
				?.Properties
				.Select(property => property.Name)
				.ToArray();

			primaryKeyPropertyNames.Should().Equal(expectedKeyPropertyNames);
			// The absence checks matter as much as the key check: inactive membership rows
			// would change auth semantics by making revoked links queryable again.
			entityType.FindProperty("Id").Should().BeNull();
			entityType.FindProperty("IsDeleted").Should().BeNull();
			entityType.FindProperty("DeletedAt").Should().BeNull();
			entityType.FindProperty("CreatedAt").Should().NotBeNull();
			entityType.FindProperty("UpdatedAt").Should().NotBeNull();
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
			) is true;
		}
	}

}
