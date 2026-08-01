using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Reflection;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Auth.Entities;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Messaging.Entities;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Projects.Entities;
using PublyApp.Api.Modules.SystemNotices.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

/// <summary>
/// Guards the assembly-discovered <c>IEntityTypeConfiguration&lt;T&gt;</c> convention.
/// <c>ApplyConfigurationsFromAssembly</c> only instantiates types that are non-abstract,
/// not open generic, and that expose an instance parameterless constructor — every other
/// configuration type is skipped silently, no error, no warning, and its entity quietly
/// falls back to convention defaults. That is the failure mode this guard exists for.
/// </summary>
public sealed class EntityConfigurationConventionSpec {
	static EntityConfigurationConventionSpec() {
		AppEnvironment.Initialize();
	}

	private static readonly Type EntityConfigurationInterface = typeof(IEntityTypeConfiguration<>);

	/// <summary>
	/// Entities whose mapping is declared entirely by data annotations on the entity class
	/// (table, columns, indexes) and by the shared <c>BaseAttributes</c>/tenant-filter
	/// loops in <see cref="AppDbContext.OnModelCreating"/>. They legitimately have no
	/// <c>IEntityTypeConfiguration&lt;T&gt;</c> class, so the coverage guard in
	/// <see cref="ItShouldCoverEveryDbSetEntityExactlyOnce"/> exempts them. Each entry is a
	/// typed reference, not a string, and is self-checked to carry mapping annotations.
	/// </summary>
	private static readonly HashSet<Type> AnnotationMappedEntities = new() {
		typeof(AuditLog),
		typeof(InvitationEmailOutbox),
		typeof(SystemNotice)
	};

	[Fact]
	public void ItShouldRejectConfigurationTypesThatAssemblyDiscoveryCannotInstantiate() {
		// ApplyConfigurationsFromAssembly silently skips any IEntityTypeConfiguration<T>
		// it cannot instantiate (abstract, open generic, or missing an instance
		// parameterless constructor) — no error, no warning. Reflection is the only place
		// that condition can be asserted up front, so scan the same assembly the discovery
		// call scans (typeof(AppDbContext).Assembly) with the same filters EF Core uses.
		var configurationTypes = typeof(AppDbContext).Assembly
			.DefinedTypes
			.Where(type => type.GetInterfaces().Any(IsEntityConfigurationInterface))
			.ToList();

		_ = configurationTypes.Should().NotBeEmpty(
			"the API assembly must contain IEntityTypeConfiguration<T> types to scan; "
			+ "an empty scan would make this guard vacuous."
		);

		var offenders = configurationTypes
			.Where(type => !CanBeInstantiatedByAssemblyDiscovery(type))
			.Select(DescribeSkipReason)
			.ToList();

		_ = offenders.Should().BeEmpty(
			"every IEntityTypeConfiguration<T> in the API assembly must be instantiable by "
			+ "ApplyConfigurationsFromAssembly, otherwise its entity silently reverts to "
			+ "convention defaults:\n" + string.Join("\n", offenders)
		);
	}

	[Fact]
	public void ItShouldCoverEveryDbSetEntityExactlyOnce() {
		var configurationTypes = typeof(AppDbContext).Assembly
			.DefinedTypes
			.Where(type => type.GetInterfaces().Any(IsEntityConfigurationInterface))
			.ToList();

		var configuredEntityTypes = configurationTypes
			.SelectMany(type => type.GetInterfaces()
				.Where(IsEntityConfigurationInterface)
				.Select(configurationInterface => configurationInterface.GenericTypeArguments[0]))
			.ToHashSet();

		var dbSetEntityTypes = typeof(AppDbContext)
			.GetProperties(BindingFlags.Public | BindingFlags.Instance)
			.Where(property => property.PropertyType.IsGenericType)
			.Where(property => property.PropertyType.GetGenericTypeDefinition() == typeof(DbSet<>))
			.Select(property => property.PropertyType.GetGenericArguments()[0])
			.ToHashSet();

		_ = dbSetEntityTypes.Should().NotBeEmpty(
			"the DbSet scan must find entities; an empty scan would make this guard vacuous."
		);

		// The annotation-mapped exemption must only ever cover entities that genuinely
		// declare their mapping via data annotations, never a convention-only entity.
		var notAnnotated = AnnotationMappedEntities
			.Where(entityType => !HasMappingAnnotations(entityType))
			.Select(entityType => entityType.Name)
			.OrderBy(name => name, StringComparer.Ordinal)
			.ToList();
		_ = notAnnotated.Should().BeEmpty(
			"entities exempt from needing an IEntityTypeConfiguration<T> must carry their "
			+ "mapping as data annotations (Table/Index/Column/Key/ForeignKey): "
			+ string.Join(", ", notAnnotated)
		);

		// No orphaned configuration: every configured entity type must be a DbSet entity.
		var orphanedConfigurations = configuredEntityTypes
			.Except(dbSetEntityTypes)
			.Select(entityType => entityType.Name)
			.OrderBy(name => name, StringComparer.Ordinal)
			.ToList();
		_ = orphanedConfigurations.Should().BeEmpty(
			"no IEntityTypeConfiguration<T> may target an entity that is not a DbSet on "
			+ "AppDbContext (orphaned configuration): " + string.Join(", ", orphanedConfigurations)
		);

		// No missing configuration: every DbSet entity must be covered by a configuration
		// class or be one of the explicitly annotation-mapped entities. The set of
		// uncovered entities must be a subset of that exemption set — a superset would
		// mean an entity with no configuration and no justification for the exception.
		var uncoveredDbSetEntities = dbSetEntityTypes
			.Except(configuredEntityTypes)
			.ToHashSet();
		_ = uncoveredDbSetEntities.Should().BeSubsetOf(
			AnnotationMappedEntities,
			"every DbSet entity on AppDbContext must be covered by an "
			+ "IEntityTypeConfiguration<T>, or be one of the explicitly annotation-mapped "
			+ "entities that need none. Uncovered entities: "
			+ string.Join(", ", uncoveredDbSetEntities.Select(entityType => entityType.Name))
		);
	}

	[Fact]
	public void ItShouldApplyDistinctiveConfigurationMetadataToEveryEntity() {
		// Read the built EF model rather than source text. Each entity is expected to carry
		// one piece of metadata whose only possible origin is its configuration (check
		// constraint, explicit primary-key name, composite junction key, or column default)
		// or, for the annotation-mapped entities, its data annotations (table name).
		// This proves Configure actually ran with its real content, not just that a class
		// exists. All expectations below are already reflected in the committed
		// AppDbContextModelSnapshot, so the model cannot drift from it while this passes.
		//
		// The design-time model is the full model that migrations and the model snapshot
		// are generated from; the read-optimized model the runtime hands out via
		// DbContext.Model omits relational metadata such as check constraints.
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=entity_configuration_guard")
			.Options;

		using var dbContext = new AppDbContext(options);
		var model = dbContext.GetService<IDesignTimeModel>().Model;

		var failures = new List<string>();
		AssertCheckConstraint(model, typeof(Tenant), "CK_Tenant_Status", failures);
		AssertCheckConstraint(model, typeof(User), "CK_User_Status", failures);
		AssertCheckConstraint(model, typeof(UserAccount), "CK_UserAccount_Status", failures);
		AssertCheckConstraint(model, typeof(Project), "CK_Project_Status", failures);
		AssertCheckConstraint(model, typeof(Profile), "CK_Profile_Tenant_Constraints", failures);
		AssertCheckConstraint(model, typeof(Permission), "CK_Permission_Staff_Key_Prefix", failures);
		AssertCheckConstraint(model, typeof(Invitation), "CK_Invitation_Status", failures);

		AssertPrimaryKeyName(model, typeof(JobQueueItem), "pk_job_queue", failures);
		AssertPrimaryKeyName(model, typeof(JobDeadLetter), "pk_job_dead_letter", failures);
		AssertPrimaryKeyName(model, typeof(SystemJobDefinition), "pk_system_job_definitions", failures);
		AssertPrimaryKeyName(model, typeof(EmailLog), "pk_email_log", failures);
		AssertPrimaryKeyName(model, typeof(EmailPreparedSend), "pk_email_prepared_sends", failures);

		AssertCompositePrimaryKey(
			model, typeof(UserAccountProfile), ["UserAccountId", "ProfileId"], failures
		);
		AssertCompositePrimaryKey(
			model, typeof(ProfilePermission), ["ProfileId", "PermissionKey"], failures
		);
		AssertCompositePrimaryKey(
			model, typeof(InvitationProfile), ["InvitationId", "ProfileId"], failures
		);
		AssertCompositePrimaryKey(
			model, typeof(SystemJobOccurrence), ["JobKey", "ScheduledFireAt"], failures
		);

		AssertPropertyDefaultSql(model, typeof(Session), "Id", "uuidv7()", failures);

		AssertTableName(model, typeof(AuditLog), "audit_logs", failures);
		AssertTableName(model, typeof(InvitationEmailOutbox), "invitation_email_outbox", failures);
		AssertTableName(model, typeof(SystemNotice), "system_notices", failures);

		_ = failures.Should().BeEmpty(
			"the built EF model must carry each entity's configured metadata; "
			+ "a missing item means the configuration is not being applied:\n"
			+ string.Join("\n", failures)
		);
	}

	private static bool IsEntityConfigurationInterface(Type candidate) {
		return candidate.IsGenericType
			&& candidate.GetGenericTypeDefinition() == EntityConfigurationInterface;
	}

	private static bool CanBeInstantiatedByAssemblyDiscovery(TypeInfo type) {
		// Mirrors EF Core's ApplyConfigurationsFromAssembly exactly: GetConstructibleTypes
		// filters IsAbstract and IsGenericTypeDefinition, and instantiation requires an
		// instance parameterless constructor (public or non-public — EF uses
		// Activator.CreateInstance(type, nonPublic: true)).
		if (type.IsAbstract) {
			return false;
		}

		if (type.IsGenericTypeDefinition) {
			return false;
		}

		return type.GetConstructor(
			BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance,
			Type.EmptyTypes
		) is not null;
	}

	private static string DescribeSkipReason(TypeInfo type) {
		if (type.IsAbstract) {
			return $"- {type.FullName}: is abstract, so ApplyConfigurationsFromAssembly will skip it";
		}

		if (type.IsGenericTypeDefinition) {
			return $"- {type.FullName}: is an open generic type, so ApplyConfigurationsFromAssembly will skip it";
		}

		return $"- {type.FullName}: has no instance parameterless constructor, so "
			+ "ApplyConfigurationsFromAssembly will silently skip it (a configuration that "
			+ "grows a constructor dependency stops being applied)";
	}

	private static bool HasMappingAnnotations(Type entityType) {
		var hasTypeLevelAnnotation = entityType.GetCustomAttributes()
			.Any(attribute => attribute is TableAttribute or IndexAttribute);

		var hasMemberLevelAnnotation = entityType
			.GetProperties(BindingFlags.Public | BindingFlags.Instance)
			.SelectMany(property => property.GetCustomAttributes())
			.Any(attribute => attribute is ColumnAttribute or KeyAttribute or ForeignKeyAttribute);

		return hasTypeLevelAnnotation || hasMemberLevelAnnotation;
	}

	private static void AssertCheckConstraint(
		IModel model,
		Type entityType,
		string constraintName,
		List<string> failures
	) {
		var entity = model.FindEntityType(entityType);
		if (entity is null || entity.GetCheckConstraints()
			.All(constraint => constraint.Name != constraintName)) {
			failures.Add(
				$"{entityType.Name}: expected check constraint {constraintName} to be present"
			);
		}
	}

	private static void AssertPrimaryKeyName(
		IModel model,
		Type entityType,
		string keyName,
		List<string> failures
	) {
		var entity = model.FindEntityType(entityType);
		if (entity is null || entity.FindPrimaryKey()?.GetName() != keyName) {
			failures.Add($"{entityType.Name}: expected primary key to be named {keyName}");
		}
	}

	private static void AssertCompositePrimaryKey(
		IModel model,
		Type entityType,
		string[] expectedKeyProperties,
		List<string> failures
	) {
		var entity = model.FindEntityType(entityType);
		var actualKeyProperties = entity?.FindPrimaryKey()
			?.Properties.Select(property => property.Name)
			.ToArray();
		if (!expectedKeyProperties.SequenceEqual(actualKeyProperties ?? [])) {
			failures.Add(
				$"{entityType.Name}: expected composite primary key "
				+ $"[{string.Join(", ", expectedKeyProperties)}] but found "
				+ $"[{string.Join(", ", actualKeyProperties ?? [])}]"
			);
		}
	}

	private static void AssertPropertyDefaultSql(
		IModel model,
		Type entityType,
		string propertyName,
		string expectedDefaultSql,
		List<string> failures
	) {
		var entity = model.FindEntityType(entityType);
		if (entity is null
			|| entity.FindProperty(propertyName)?.GetDefaultValueSql() != expectedDefaultSql) {
			failures.Add(
				$"{entityType.Name}: expected property {propertyName} to default to "
				+ $"{expectedDefaultSql}"
			);
		}
	}

	private static void AssertTableName(
		IModel model,
		Type entityType,
		string expectedTableName,
		List<string> failures
	) {
		var entity = model.FindEntityType(entityType);
		if (entity is null || entity.GetTableName() != expectedTableName) {
			failures.Add(
				$"{entityType.Name}: expected table {expectedTableName} (data-annotation mapping)"
			);
		}
	}
}
