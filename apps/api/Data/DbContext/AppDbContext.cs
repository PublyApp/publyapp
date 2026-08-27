using System.Linq.Expressions;

using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

using PublyApp.Api.Lib;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Auth.Entities;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Messaging.Entities;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Projects.Entities;
using PublyApp.Api.Modules.RateLimiting.Entities;
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.SystemNotices.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Uploads.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Data.DbContext;

/// <summary>
/// Main database context with automatic audit tracking for all entities.
/// </summary>
public class AppDbContext : Microsoft.EntityFrameworkCore.DbContext, IDataProtectionKeyContext {
	private static readonly Lazy<List<Type>> SeederTypeCache = new(DiscoverSeedersInternal, LazyThreadSafetyMode.ExecutionAndPublication);

	public DbSet<Session> Session {
		get { return Set<Session>(); }
	}
	public DbSet<User> User {
		get { return Set<User>(); }
	}
	public DbSet<Tenant> Tenant {
		get { return Set<Tenant>(); }
	}

	// Project system entities (still needed for Project entity)
	public DbSet<Project> Project {
		get { return Set<Project>(); }
	}

	// Unified permission system entities
	public DbSet<Permission> Permission {
		get { return Set<Permission>(); }
	}
	public DbSet<Profile> Profile {
		get { return Set<Profile>(); }
	}
	public DbSet<ProfilePermission> ProfilePermission {
		get { return Set<ProfilePermission>(); }
	}
	public DbSet<UserAccountProfile> UserAccountProfile {
		get { return Set<UserAccountProfile>(); }
	}

	// Unified account system (handles Staff, Tenant, and Project accounts)
	public DbSet<UserAccount> UserAccount {
		get { return Set<UserAccount>(); }
	}

	// Unified invitation system (Staff/Tenant/Project)
	public DbSet<Invitation> Invitation {
		get { return Set<Invitation>(); }
	}
	public DbSet<InvitationProfile> InvitationProfile {
		get { return Set<InvitationProfile>(); }
	}
	public DbSet<InvitationEmailOutbox> InvitationEmailOutbox {
		get { return Set<InvitationEmailOutbox>(); }
	}

	// Generic background job engine (Infrastructure/Jobs). Entities live in
	// Modules/Jobs by convention; behavior lives in Infrastructure/Jobs.
	public DbSet<JobQueueItem> JobQueue {
		get { return Set<JobQueueItem>(); }
	}
	public DbSet<JobDeadLetter> JobDeadLetter {
		get { return Set<JobDeadLetter>(); }
	}
	public DbSet<JobDeadLetterEvent> JobDeadLetterEvent {
		get { return Set<JobDeadLetterEvent>(); }
	}

	// Dashboard-configurable recurring system jobs, reconciled into the leader's Quartz
	// scheduler by SyncSystemJobsJob (design §4.3).
	public DbSet<SystemJobDefinition> SystemJobDefinition {
		get { return Set<SystemJobDefinition>(); }
	}
	public DbSet<SystemJobOccurrence> SystemJobOccurrence {
		get { return Set<SystemJobOccurrence>(); }
	}

	// Append-only email delivery record + send-once envelope scratch (design §4.4/§4.5,
	// Modules/Messaging). Written by the email job handlers; never read by the engine.
	public DbSet<EmailLog> EmailLog {
		get { return Set<EmailLog>(); }
	}
	public DbSet<EmailPreparedSend> EmailPreparedSend {
		get { return Set<EmailPreparedSend>(); }
	}
	// §4.4 provider-evidence transition history (#866/K-6): the actor-named evidence
	// table for transitions audit_logs cannot carry (a webhook has no user).
	public DbSet<EmailLogEvidenceEvent> EmailLogEvidenceEvent {
		get { return Set<EmailLogEvidenceEvent>(); }
	}

	// Staff back-office entities
	public DbSet<AuditLog> AuditLog {
		get { return Set<AuditLog>(); }
	}
	public DbSet<SystemNotice> SystemNotice {
		get { return Set<SystemNotice>(); }
	}

	// Durable upload admission control + asset lifecycle (#807). Entities live in
	// Modules/Uploads by convention; the accounting engine lives beside them.
	public DbSet<UploadAsset> UploadAsset {
		get { return Set<UploadAsset>(); }
	}
	public DbSet<UploadBudget> UploadBudget {
		get { return Set<UploadBudget>(); }
	}

	// Distributed rate-limit counters (#953): one fixed-window budget row per
	// (policy, hashed partition key, window). Tenant-free by design — anonymous
	// and per-IP partitions carry no tenant id.
	public DbSet<RateLimitCounter> RateLimitCounter {
		get { return Set<RateLimitCounter>(); }
	}

	// Tenant content entities
	public DbSet<Post> Post {
		get { return Set<Post>(); }
	}

	// One image per post (lane 639 / #629 wave B3). The blob stays owned by the
	// uploads pipeline; this row is the tenant-scoped attachment record.
	public DbSet<PostMediaAsset> PostMediaAsset {
		get { return Set<PostMediaAsset>(); }
	}

	// Data Protection key ring (C1-bis): keys persisted in Postgres, encrypted at rest
	// with SOCIAL_ACCOUNTS_MASTER_KEY.
	public DbSet<DataProtectionKey> DataProtectionKeys {
		get { return Set<DataProtectionKey>(); }
	}

	// Social accounts (C1-bis)
	public DbSet<Modules.SocialAccounts.Entities.SocialAccount> SocialAccount {
		get { return Set<Modules.SocialAccounts.Entities.SocialAccount>(); }
	}
	public DbSet<Modules.SocialAccounts.Entities.SocialAccountProject> SocialAccountProject {
		get { return Set<Modules.SocialAccounts.Entities.SocialAccountProject>(); }
	}

	// Publishing lifecycle (Epic D / D1)
	public DbSet<Modules.Publishing.Entities.Publication> Publication {
		get { return Set<Modules.Publishing.Entities.Publication>(); }
	}

	public Guid? TenantId { get; set; }

	public AppDbContext(DbContextOptions options) : base(options) {
		var extension = options.FindExtension<TenantExtension>();
		TenantId = extension?.TenantId;
	}

	protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder) {
		base.OnConfiguring(optionsBuilder);

		// #1446 runtime containment: the Publication.Status single-writer guard
		// rides every context because OnConfiguring always runs — DI hosts, the
		// migrator, tests, and a bare `new AppDbContext(...)` alike. There is no
		// opt-out by design; see Modules/Publishing/Lib/PublicationStatusWriteGuard.
		//
		// Performance impact: the guard adds two distinct measurements, each
		// defined below in one sentence in code and production comments:
		//
		// 1. GUARDED PATH TOTAL: the full regex chain for a publication-table
		//    read query, string-splitting + comment stripping + regex matching.
		//    Measured ~0.57 µs – 1.22 µs (median across 3 runs) on Intel i5-12500T,
		//    100k iterations, A/B alternating within the same loop.
		//
		// 2. INCREMENTAL DETECTION OVERHEAD: the UpdateStatementShape
		//    + StatusColumnWord detection the guard adds above the baseline.
		//    Measured ~0.12 µs – 0.27 µs (median across 3 runs) on the same machine.
		//
		// ROBUSTNESS: The decision to keep the guard stands even if measurements
		// are wrong by 10x. 10× overhead (~5.7–12.2 µs total, ~1.2–2.7 µs detection)
		// remains well under 2% of a 1 ms query, so the 1% robustness threshold
		// survives. The guard is kept because the total path cost is negligible,
		// not because of any specific number.
		//
		// Note on measurement dispersion: a reviewer measured the guarded path at
		// ~1.87 µs on this machine (round 3). That measurement likely includes the
		// EF Core interceptor dispatch overhead, which this benchmark isolates away
		// to measure only the regex chain. The gap (~0.7–1.3 µs) is consistent with
		// the interceptor dispatch cost. Both measurements support the same conclusion:
		// the guard's cost is negligible.
		//
		// Run MeasureStatusGuardOverhead to reproduce:
		//   dotnet run --project packages/scripts-cs/PublyApp.Scripts.csproj -- \
		//     measure-status-guard-overhead
		// Expected output: "GUARDED PATH TOTAL: ~0.57 µs" (median, varies by run)
		optionsBuilder.AddInterceptors(new PublicationStatusWriteGuard());

		// EF Core 9: Define seeding logic here using reflection to discover all seeders
		optionsBuilder.UseSeeding((context, _) => {
			var dbContext = (AppDbContext)context;

			if (dbContext is null) {
				throw new InvalidOperationException("Seeding context cannot be null");
			}

			var infrastructure = (IInfrastructure<IServiceProvider>)dbContext;
			SeedAll(dbContext, infrastructure.Instance);
		});

		optionsBuilder.UseAsyncSeeding(async (context, _, cancellationToken) => {
			var dbContext = (AppDbContext)context;

			if (dbContext is null) {
				throw new InvalidOperationException("Seeding context cannot be null");
			}

			var infrastructure = (IInfrastructure<IServiceProvider>)dbContext;
			await SeedAllAsync(dbContext, infrastructure.Instance, cancellationToken);
		});
	}

	/// <summary>
	/// Discovers and executes all entity seeders synchronously.
	/// </summary>
	private static void SeedAll(AppDbContext dbContext, IServiceProvider serviceProvider) {
		Task.Run(() => SeedAllAsync(dbContext, serviceProvider, CancellationToken.None))
			.GetAwaiter()
			.GetResult();
	}

	/// <summary>
	/// Discovers and executes all entity seeders asynchronously using reflection.
	/// </summary>
	private static async Task SeedAllAsync(AppDbContext dbContext, IServiceProvider serviceProvider, CancellationToken cancellationToken) {
		var logger = serviceProvider.GetService<ILogger<AppDbContext>>();
		var seeders = CreateSeeders(serviceProvider);

		foreach (var seeder in seeders) {
			if (logger?.IsEnabled(LogLevel.Information) is true) {
				logger.LogInformation("Running seeder {Seeder} with order {Order}", seeder.GetType().Name, seeder.Order);
			}
			await seeder.SeedAsync(dbContext, cancellationToken);
		}
	}

	/// <summary>
	/// Discovers all classes that implement <see cref="IEntitySeeder"/> using reflection.
	/// </summary>
	private static List<Type> DiscoverSeeders() {
		return SeederTypeCache.Value;
	}

	/// <summary>
	/// Creates seeded instances via dependency injection with robust error handling.
	/// </summary>
	/// <param name="serviceProvider">The service provider used for DI instantiation.</param>
	/// <exception cref="InvalidOperationException">Thrown if a seeder cannot be instantiated.</exception>
	private static List<IEntitySeeder> CreateSeeders(IServiceProvider serviceProvider) {
		var seederTypes = DiscoverSeeders();
		var seeders = new List<IEntitySeeder>(seederTypes.Count);

		foreach (var type in seederTypes) {
			try {
				var instance = (IEntitySeeder)ActivatorUtilities.CreateInstance(serviceProvider, type);
				seeders.Add(instance);
			} catch (Exception ex) {
				throw new InvalidOperationException($"Failed to instantiate seeder '{type.FullName}'.", ex);
			}
		}

		return seeders
			.Where(seeder =>
				!AppEnvironment.IsProduction
				|| !seeder.IsDemo
			)
			.OrderBy(seeder => seeder.Order)
			.ToList();
	}

	/// <summary>
	/// Performs the reflection scan to find available seeders. Results are cached.
	/// </summary>
	private static List<System.Type> DiscoverSeedersInternal() {
		var seederInterface = typeof(IEntitySeeder);
		var assembly = typeof(AppDbContext).Assembly;

		var seederTypes = assembly
			.GetTypes()
			.Where(t =>
				t.IsClass &&
				!t.IsAbstract &&
				seederInterface.IsAssignableFrom(t) &&
				t != seederInterface
			)
			.ToList();

		return seederTypes;
	}

	protected override void OnModelCreating(ModelBuilder modelBuilder) {
		base.OnModelCreating(modelBuilder);

		modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);

		// Partial indexes to favor active rows without enforcing global filters
		modelBuilder.HasPostgresExtension("pg_trgm");

		// #1416: exactly ONE master-key canary row may exist. Concurrent first boots
		// used to mint duplicates (every boot read null, every boot inserted), which
		// crash-looped every later boot on SingleOrDefault. The partial unique index
		// constrains ONLY the canary row name (PostgresKeyRingCanaryStore.RowName);
		// Data Protection key-ring rows keep their own names untouched.
		modelBuilder.Entity<Microsoft.AspNetCore.DataProtection.EntityFrameworkCore.DataProtectionKey>()
			.HasIndex(key => key.FriendlyName)
			.HasDatabaseName("ux_data_protection_keys_canary_friendly_name")
			.IsUnique()
			.HasFilter("\"FriendlyName\" = 'social-accounts-master-key-canary'");

		// Apply matching query filters to ensure consistent filtering
		if (TenantId is not null) {
			// UserAccountProfile gets a filter that matches the Profile's tenant
			// This ensures both entities in the relationship are filtered consistently
			modelBuilder.Entity<UserAccountProfile>()
				.HasQueryFilter(uap => uap.Profile.TenantId == TenantId);
		}

		// Configure other entities with generic approach
		foreach (var entityType in modelBuilder.Model.GetEntityTypes()) {
			// Skip UserAccountProfile - it's already configured above with custom query filter
			// UserAccountProfile implements INoTenantEntity but needs tenant filtering through Profile.TenantId
			// Without this check, it would be processed as a regular INoTenantEntity (no filtering)
			// or potentially cause duplicate entity configuration issues
			if (entityType.ClrType == typeof(UserAccountProfile)) {
				continue;
			}

			// DataProtectionKey (C1-bis) is managed by the Data Protection
			// framework, not our tenant-convention model builder.
			if (entityType.ClrType == typeof(Microsoft.AspNetCore.DataProtection.EntityFrameworkCore.DataProtectionKey)) {
				continue;
			}

			if (typeof(ITenantEntity).IsAssignableFrom(entityType.ClrType)) {
				modelBuilder.Entity(entityType.ClrType);

				if (TenantId is not null) {
					// Dynamically apply query filter for tenant-filtered entities
					var parameter = Expression.Parameter(entityType.ClrType, "x");
					var tenantIdProperty = Expression.Property(parameter, nameof(TenantId));
					var tenantIdConstant = Expression.Constant(TenantId);
					var equalExpression = Expression.Equal(tenantIdProperty, tenantIdConstant);
					var lambda = Expression.Lambda(equalExpression, parameter);

					// Apply the query filter
					modelBuilder.Entity(entityType.ClrType)
						.HasQueryFilter(lambda);
				}
			} else if (typeof(IOptionalTenantEntity).IsAssignableFrom(entityType.ClrType)) {
				// Set table name for optional tenant entities (no automatic filtering)
				modelBuilder.Entity(entityType.ClrType);
			} else if (typeof(INoTenantEntity).IsAssignableFrom(entityType.ClrType)) {
				// Set table name for non-tenant-filtered entities
				modelBuilder.Entity(entityType.ClrType);
			} else {
				throw new InvalidOperationException(
					$"{entityType.ClrType.Name} must implement {nameof(ITenantEntity)}, {nameof(IOptionalTenantEntity)}, or {nameof(INoTenantEntity)}"
				);
			}

			// Configure UUID v7 auto-generation for entities with Guid Id (inheriting from BaseAttributes)
			if (typeof(BaseAttributes).IsAssignableFrom(entityType.ClrType)) {
				modelBuilder.Entity(entityType.ClrType)
					.Property("Id")
					.HasDefaultValueSql("uuidv7()");
			}
		}
	}

	#region Audit Tracking - SaveChanges Overrides

	/// <summary>
	/// Automatically handles audit field updates for all entities.
	/// </summary>
	public override int SaveChanges() {
		UpdateAuditFields();
		return base.SaveChanges();
	}

	/// <summary>
	/// Automatically handles audit field updates for all entities.
	/// </summary>
	public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) {
		UpdateAuditFields();
		return await base.SaveChangesAsync(cancellationToken);
	}

	private readonly HashSet<object> _forceHardDeleteEntities = new();

	/// <summary>
	/// Updates audit fields and applies soft-delete conversion where supported.
	/// </summary>
	private void UpdateAuditFields() {
		var entries = ChangeTracker.Entries()
			.Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted);

		foreach (var entry in entries) {
			// Handle Session timestamps; deletes remain physical.
			if (entry.Entity is Session session) {
				var now = DateTime.UtcNow;

				switch (entry.State) {
					case EntityState.Added:
						session.CreatedAt = now;
						session.UpdatedAt = now;
						break;

					case EntityState.Modified:
						session.UpdatedAt = now;
						break;

					case EntityState.Deleted:
						_forceHardDeleteEntities.Remove(entry.Entity);
						continue;
					case EntityState.Detached:
					case EntityState.Unchanged:
						break;
					default:
						throw new ArgumentOutOfRangeException(
							nameof(entry.State),
							entry.State,
							$"Unhandled EntityState: {entry.State}"
						);
				}
			}
			// Handle BaseAttributesNoKey entities
			else if (entry.Entity is BaseAttributesNoKey baseEntity) {
				var now = DateTime.UtcNow;

				switch (entry.State) {
					case EntityState.Added:
						baseEntity.CreatedAt = now;
						baseEntity.UpdatedAt = now;
						SetConsistentSoftDeleteState(baseEntity, now);
						break;

					case EntityState.Modified:
						baseEntity.UpdatedAt = now;
						break;

					case EntityState.Deleted:
						// Check if this is a forced hard delete
						if (_forceHardDeleteEntities.Contains(entry.Entity)) {
							// Allow actual deletion - don't convert to soft delete
							_forceHardDeleteEntities.Remove(entry.Entity);
							continue;
						}

						// Default behavior: convert to soft delete
						entry.State = EntityState.Modified;
						baseEntity.IsDeleted = true;
						baseEntity.DeletedAt = now;
						baseEntity.UpdatedAt = now;
						break;
					case EntityState.Detached:
					case EntityState.Unchanged:
						break;
					default:
						throw new ArgumentOutOfRangeException(
							nameof(entry.State),
							entry.State,
							$"Unhandled EntityState: {entry.State}"
						);
				}
			}
			// Handle Permission record (has audit properties but doesn't inherit from BaseAttributesNoKey)
			else if (entry.Entity is Permission permission) {
				var now = DateTime.UtcNow;

				switch (entry.State) {
					case EntityState.Added:
						permission.CreatedAt = now;
						permission.UpdatedAt = now;
						SetConsistentSoftDeleteState(permission, now);
						break;

					case EntityState.Modified:
						permission.UpdatedAt = now;
						break;

					case EntityState.Deleted:
						// Check if this is a forced hard delete
						if (_forceHardDeleteEntities.Contains(entry.Entity)) {
							// Allow actual deletion - don't convert to soft delete
							_forceHardDeleteEntities.Remove(entry.Entity);
							continue;
						}

						// Default behavior: convert to soft delete
						entry.State = EntityState.Modified;
						permission.IsDeleted = true;
						permission.DeletedAt = now;
						permission.UpdatedAt = now;
						break;
					case EntityState.Detached:
					case EntityState.Unchanged:
						break;
					default:
						throw new ArgumentOutOfRangeException(
							nameof(entry.State),
							entry.State,
							$"Unhandled EntityState: {entry.State}"
						);
				}
			}
		}
	}

	/// <summary>
	/// Keeps <c>IsDeleted</c>/<c>DeletedAt</c> state coherent on inserts while preserving
	/// explicit soft-delete intent.
	///
	/// - <c>IsDeleted = true</c> and <c>DeletedAt = null</c> are normalized by setting
	///   <c>DeletedAt</c> to the current UTC time.
	/// - <c>IsDeleted = false</c> and <c>DeletedAt != null</c> are normalized by flipping
	///   <c>IsDeleted</c> to true, preventing inconsistent audit rows from entering the
	///   database.
	/// - A fully consistent pair is preserved as-is.
	/// </summary>
	private static void SetConsistentSoftDeleteState(BaseAttributesNoKey baseEntity, DateTime now) {
		baseEntity.DeletedAt = NormalizeDeletedAt(baseEntity.DeletedAt);

		if (baseEntity.IsDeleted && baseEntity.DeletedAt is null) {
			baseEntity.DeletedAt = now;
			return;
		}

		if (!baseEntity.IsDeleted && baseEntity.DeletedAt is not null) {
			baseEntity.IsDeleted = true;
		}
	}

	private static void SetConsistentSoftDeleteState(Permission permission, DateTime now) {
		permission.DeletedAt = NormalizeDeletedAt(permission.DeletedAt);

		if (permission.IsDeleted && permission.DeletedAt is null) {
			permission.DeletedAt = now;
			return;
		}

		if (!permission.IsDeleted && permission.DeletedAt is not null) {
			permission.IsDeleted = true;
		}
	}

	/// <summary>
	/// Coerces a caller-supplied <c>DeletedAt</c> to UTC so a <c>timestamptz</c> write cannot fail.
	///
	/// <c>Unspecified</c> is tagged rather than converted. Every timestamp this application
	/// produces comes from <c>DateTime.UtcNow</c>, so an unspecified value is already UTC that
	/// merely lost its kind — passing it through <c>ToUniversalTime()</c> would treat it as
	/// local and shift it by the host's offset, silently moving the deletion time by hours on
	/// any non-UTC machine. Only a genuinely <c>Local</c> value needs converting.
	/// </summary>
	private static DateTime? NormalizeDeletedAt(DateTime? deletedAt) {
		if (deletedAt is null) {
			return null;
		}

		if (deletedAt.Value.Kind == DateTimeKind.Utc) {
			return deletedAt;
		}

		if (deletedAt.Value.Kind == DateTimeKind.Unspecified) {
			return DateTime.SpecifyKind(deletedAt.Value, DateTimeKind.Utc);
		}

		return deletedAt.Value.ToUniversalTime();
	}

	/// <summary>
	/// Forces a hard delete (permanent removal) instead of soft delete.
	/// Use with caution as this bypasses audit tracking.
	/// </summary>
	public void ForceHardDelete<TEntity>(TEntity entity) where TEntity : class {
		_forceHardDeleteEntities.Add(entity);
		Remove(entity);
	}

	/// <summary>
	/// Forces hard delete for multiple entities.
	/// </summary>
	public void ForceHardDeleteRange<TEntity>(IEnumerable<TEntity> entities) where TEntity : class {
		foreach (var entity in entities) {
			ForceHardDelete(entity);
		}
	}

	#endregion
}
