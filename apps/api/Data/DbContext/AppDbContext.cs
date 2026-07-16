using System.Linq.Expressions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

using PublyApp.Api.Lib;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Auth.Entities;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Projects.Entities;
using PublyApp.Api.Modules.SystemNotices.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Data.DbContext;

/// <summary>
/// Main database context with automatic audit tracking for all entities.
/// </summary>
public class AppDbContext : Microsoft.EntityFrameworkCore.DbContext {
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

	// Staff back-office entities
	public DbSet<AuditLog> AuditLog {
		get { return Set<AuditLog>(); }
	}
	public DbSet<SystemNotice> SystemNotice {
		get { return Set<SystemNotice>(); }
	}

	public Guid? TenantId { get; set; }

	public AppDbContext(DbContextOptions options) : base(options) {
		var extension = options.FindExtension<TenantExtension>();
		TenantId = extension?.TenantId;
	}

	protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder) {
		base.OnConfiguring(optionsBuilder);

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

		// Access AppEnvironment for default values used in database schema configuration
		var env = AppEnvironment.Instance;

		// Database-level lowercase constraints
		modelBuilder.Entity<Tenant>()
			.ToTable(t => {
				t.HasCheckConstraint("CK_Tenant_Code_Lowercase", "code = LOWER(code)");
				// Keep lifecycle enum values constrained at the database boundary.
				// TenantStatus: Pending = 10, Active = 20, Suspended = 30.
				t.HasCheckConstraint(
					"CK_Tenant_Status",
					"status IN (10, 20, 30)"
				);
			})
			.Property(t => t.MaxUsers)
			.HasDefaultValue(env.DEFAULT_MAX_USERS_PER_TENANT);

		modelBuilder.Entity<User>()
			.ToTable(t => {
				t.HasCheckConstraint("CK_User_Email_Lowercase", "email = LOWER(email)");
				// User onboarding is invitation-first; persisted identity states are active or suspended.
				t.HasCheckConstraint("CK_User_Status", "status IN (30, 40)");
			});

		// Database-level account type constraints
		modelBuilder.Entity<UserAccount>()
			.ToTable(t => t.HasCheckConstraint("CK_UserAccount_Staff_Constraints",
				"(scope = 0 AND tenant_id IS NULL AND project_id IS NULL) OR scope != 0"));

		modelBuilder.Entity<UserAccount>()
			.ToTable(t => t.HasCheckConstraint("CK_UserAccount_Tenant_Constraints",
				"(scope = 1 AND tenant_id IS NOT NULL AND project_id IS NULL) OR scope != 1"));

		modelBuilder.Entity<UserAccount>()
			.ToTable(t => t.HasCheckConstraint("CK_UserAccount_Project_Constraints",
				"(scope = 2 AND tenant_id IS NOT NULL AND project_id IS NOT NULL) OR scope != 2"));

		modelBuilder.Entity<UserAccount>()
			// AccountStatus is membership-local only. GloballySuspended is a derived read-model
			// status and must never be stored in user_accounts.status.
			.ToTable(t => t.HasCheckConstraint("CK_UserAccount_Status", "status IN (0, 1)"));

		modelBuilder.Entity<Project>()
			// Project status is lifecycle state, not soft-delete state. Deleted rows use BaseAttributes.
			.ToTable(t => t.HasCheckConstraint("CK_Project_Status", "status IN (10, 20)"));

		// Database-level profile type constraints
		modelBuilder.Entity<Profile>()
			.ToTable(t => t.HasCheckConstraint("CK_Profile_Staff_Constraints",
				"(scope = 0 AND tenant_id IS NULL AND project_id IS NULL) OR scope != 0"));

		modelBuilder.Entity<Profile>()
			.ToTable(t => t.HasCheckConstraint("CK_Profile_Tenant_Constraints",
				"(scope = 1 AND tenant_id IS NOT NULL AND project_id IS NULL) OR scope != 1"));

		modelBuilder.Entity<Profile>()
			.ToTable(t => t.HasCheckConstraint("CK_Profile_Project_Constraints",
				"(scope = 2 AND tenant_id IS NOT NULL AND project_id IS NOT NULL) OR scope != 2"));

		// Database-level invitation scope constraints
		modelBuilder.Entity<Invitation>()
			.ToTable(t => t.HasCheckConstraint("CK_Invitation_Staff_Constraints",
				"(scope = 0 AND tenant_id IS NULL AND project_id IS NULL) OR scope != 0"));

		modelBuilder.Entity<Invitation>()
			.ToTable(t => t.HasCheckConstraint("CK_Invitation_Tenant_Constraints",
				"(scope = 1 AND tenant_id IS NOT NULL AND project_id IS NULL) OR scope != 1"));

		modelBuilder.Entity<Invitation>()
			.ToTable(t => t.HasCheckConstraint("CK_Invitation_Project_Constraints",
				"(scope = 2 AND tenant_id IS NOT NULL AND project_id IS NOT NULL) OR scope != 2"));

		modelBuilder.Entity<Invitation>()
			// Expired is derived from Pending + ExpiresAt, so only persisted lifecycle states are allowed.
			.ToTable(t => t.HasCheckConstraint("CK_Invitation_Status", "status IN (0, 1, 2)"));

		// Database-level permission key prefix constraints
		modelBuilder.Entity<Permission>()
			.ToTable(t => t.HasCheckConstraint("CK_Permission_Staff_Key_Prefix",
				"(scope = 0 AND key LIKE 'staff.%') OR scope != 0"));

		modelBuilder.Entity<Permission>()
			.ToTable(t => t.HasCheckConstraint("CK_Permission_Tenant_Key_Prefix",
				"(scope = 1 AND key LIKE 'tenant.%') OR scope != 1"));

		modelBuilder.Entity<Permission>()
			.ToTable(t => t.HasCheckConstraint("CK_Permission_Project_Key_Prefix",
				"(scope = 2 AND key LIKE 'project.%') OR scope != 2"));

		// Translations is runtime-only, explicitly exclude from mapping
		modelBuilder.Entity<Permission>()
			.Ignore(p => p.Translations);

		// ProfilePermission is an active-state junction table. The composite key prevents
		// duplicate grants without carrying a surrogate id or soft-delete state.
		modelBuilder.Entity<ProfilePermission>(entity => {
			entity.HasKey(e => new { e.ProfileId, e.PermissionKey });

			// Cascade from Profile/Permission is appropriate because the junction row has no
			// independent lifecycle once either side of the relationship disappears.
			entity.HasOne(e => e.Profile)
				.WithMany(p => p.ProfilePermissions)
				.HasForeignKey(e => e.ProfileId)
				.OnDelete(DeleteBehavior.Cascade);

			entity.HasOne(e => e.Permission)
				.WithMany(p => p.ProfilePermissions)
				.HasForeignKey(e => e.PermissionKey)
				.OnDelete(DeleteBehavior.Cascade);
		});

		// UserAccountProfile mirrors the same active-state design. User/profile assignment
		// history is tracked via audit logs, while this table stores current membership only.
		modelBuilder.Entity<UserAccountProfile>(entity => {
			entity.HasKey(e => new { e.UserAccountId, e.ProfileId });

			entity.HasOne(e => e.UserAccount)
				.WithMany(ua => ua.UserAccountProfiles)
				.HasForeignKey(e => e.UserAccountId)
				.OnDelete(DeleteBehavior.Cascade);

			entity.HasOne(e => e.Profile)
				.WithMany(p => p.UserAccountProfiles)
				.HasForeignKey(e => e.ProfileId)
				.OnDelete(DeleteBehavior.Cascade);
		});

		// Explicit relationships for Session -> User (two FKs to same principal)
		modelBuilder.Entity<Session>()
			.Property(s => s.Id)
			.HasDefaultValueSql("uuidv7()");

		modelBuilder.Entity<Session>()
			.HasOne(s => s.User)
			.WithMany(u => u.Sessions)
			.HasForeignKey(s => s.UserId)
			.IsRequired();

		modelBuilder.Entity<Session>()
			.HasOne(s => s.ImpersonatingStaffUser)
			.WithMany()
			.HasForeignKey(s => s.ImpersonatingStaffUserId)
			.OnDelete(DeleteBehavior.Restrict);

		// Configure InvitationProfile junction table
		modelBuilder.Entity<InvitationProfile>(entity => {
			entity.HasKey(e => new { e.InvitationId, e.ProfileId });

			entity.HasOne(e => e.Invitation)
				.WithMany(i => i.InvitationProfiles)
				.HasForeignKey(e => e.InvitationId)
				.OnDelete(DeleteBehavior.Cascade);

			entity.HasOne(e => e.Profile)
				.WithMany()
				.HasForeignKey(e => e.ProfileId)
				.OnDelete(DeleteBehavior.Restrict);
		});

		// Generic job queue (Infrastructure/Jobs). Not a BaseAttributes entity by
		// design (§4.0): success is a hard delete and claim/complete run through raw
		// SQL, so the uuidv7 id + manual timestamps are configured explicitly here
		// rather than via the BaseAttributes auto-config loop below.
		modelBuilder.Entity<JobQueueItem>(entity => {
			// Explicit snake_case PK constraint name (design §4.1); EF's convention
			// would generate PK_job_queue.
			entity.HasKey(e => e.Id).HasName("pk_job_queue");
			entity.Property(e => e.Id).HasDefaultValueSql("uuidv7()");
			entity.Property(e => e.Payload).HasDefaultValueSql("'{}'");
			entity.Property(e => e.Status).HasDefaultValue(JobQueueStatus.Pending);
			entity.Property(e => e.Priority).HasDefaultValue(0);
			entity.Property(e => e.Attempts).HasDefaultValue(0);
			entity.Property(e => e.MaxAttempts).HasDefaultValue(8);
			entity.Property(e => e.NextAttemptAt).HasDefaultValueSql("now()");
			entity.Property(e => e.CreatedAt).HasDefaultValueSql("now()");
			entity.Property(e => e.UpdatedAt).HasDefaultValueSql("now()");

			// Claim hot path: pending-and-due, ordered by priority then schedule.
			entity.HasIndex(e => new { e.Priority, e.NextAttemptAt, e.CreatedAt })
				.HasDatabaseName("ix_job_queue_claim")
				.IsDescending(true, false, false)
				.HasFilter("status = 0");

			// Stale-lease reclaim path.
			entity.HasIndex(e => e.LockedUntil)
				.HasDatabaseName("ix_job_queue_reclaim")
				.HasFilter("status = 1");

			// Idempotent enqueue (dedup on optional idempotency_key).
			entity.HasIndex(e => e.IdempotencyKey)
				.IsUnique()
				.HasDatabaseName("ux_job_queue_idempotency")
				.HasFilter("idempotency_key IS NOT NULL");
		});

		modelBuilder.Entity<JobDeadLetter>(entity => {
			// Explicit snake_case PK constraint name (design §4.2).
			entity.HasKey(e => e.Id).HasName("pk_job_dead_letter");
			entity.Property(e => e.Id).HasDefaultValueSql("uuidv7()");
			entity.Property(e => e.FailedAt).HasDefaultValueSql("now()");
			entity.Property(e => e.CreatedAt).HasDefaultValueSql("now()");

			entity.HasIndex(e => new { e.JobType, e.FailedAt })
				.HasDatabaseName("ix_job_dead_letter_job_type");
		});

		// Partial indexes to favor active rows without enforcing global filters
		modelBuilder.HasPostgresExtension("pg_trgm");

		modelBuilder.Entity<User>()
			.HasIndex(u => u.Email)
			.HasDatabaseName("ix_users_email_active")
			.HasFilter("\"is_deleted\" = false");

		modelBuilder.Entity<Tenant>()
			.HasIndex(t => t.Code)
			.HasDatabaseName("ix_tenants_code_active")
			.HasFilter("\"is_deleted\" = false");

		// Keyset pagination indexes for staff tenants
		// Supports efficient sorting by Name with Id as tie-breaker
		modelBuilder.Entity<Tenant>()
			.HasIndex(t => new { t.Name, t.Id })
			.HasDatabaseName("ix_tenants_staff_name_id")
			.HasFilter("\"is_deleted\" = false");

		// Supports efficient sorting by CreatedAt with Id as tie-breaker
		modelBuilder.Entity<Tenant>()
			.HasIndex(t => new { t.CreatedAt, t.Id })
			.HasDatabaseName("ix_tenants_staff_created_at_id")
			.HasFilter("\"is_deleted\" = false");

		// Supports efficient sorting by UpdatedAt with Id as tie-breaker
		modelBuilder.Entity<Tenant>()
			.HasIndex(t => new { t.UpdatedAt, t.Id })
			.HasDatabaseName("ix_tenants_staff_updated_at_id")
			.HasFilter("\"is_deleted\" = false");

		// Supports efficient sorting by Status with Id as tie-breaker
		modelBuilder.Entity<Tenant>()
			.HasIndex(t => new { t.Status, t.Id })
			.HasDatabaseName("ix_tenants_staff_status_id")
			.HasFilter("\"is_deleted\" = false");

		// Trigram indexes to accelerate ILIKE-based search on Name/Code
		// Note: we intentionally only index Name (substring match). Code uses prefix match and
		// keeps its unique btree index (avoid multiple EF indexes on the same column set).
		modelBuilder.Entity<Tenant>()
			.HasIndex(t => t.Name)
			.HasDatabaseName("ix_tenants_name_trgm")
			.HasMethod("gin")
			.HasOperators("gin_trgm_ops")
			.HasFilter("\"is_deleted\" = false");

		modelBuilder.Entity<UserAccount>()
			.HasIndex(u => new { u.UserId, u.Scope })
			.HasDatabaseName("ix_user_accounts_user_id_account_type_active")
			// Covers active membership lookups. Status 1 is AccountStatus.Suspended.
			.HasFilter("\"is_deleted\" = false AND \"status\" != 1");

		// Membership uniqueness invariant, enforced per scope because a plain composite
		// unique index treats TenantId/ProjectId NULLs as distinct in PostgreSQL and would
		// silently allow duplicate active memberships (round-5 API F1).
		modelBuilder.Entity<UserAccount>()
			.HasIndex(u => u.UserId)
			.IsUnique()
			.HasDatabaseName("ux_user_accounts_staff_active")
			// At most one active staff account per user.
			.HasFilter("\"scope\" = 0 AND \"is_deleted\" = false");

		modelBuilder.Entity<UserAccount>()
			.HasIndex(u => new { u.UserId, u.TenantId })
			.IsUnique()
			.HasDatabaseName("ux_user_accounts_tenant_active")
			// At most one active tenant account per user per tenant.
			.HasFilter("\"scope\" = 1 AND \"project_id\" IS NULL AND \"is_deleted\" = false");

		modelBuilder.Entity<UserAccount>()
			.HasIndex(u => new { u.UserId, u.ProjectId })
			.IsUnique()
			.HasDatabaseName("ux_user_accounts_project_active")
			// At most one active project account per user per project.
			.HasFilter("\"scope\" = 2 AND \"is_deleted\" = false");

		// Keyset pagination indexes for staff profiles
		// Supports efficient sorting by Name with Id as tie-breaker
		modelBuilder.Entity<Profile>()
			.HasIndex(p => new { p.Scope, p.Name, p.Id })
			.HasDatabaseName("ix_profiles_staff_name_id")
			.HasFilter("\"scope\" = 0");

		// Supports efficient sorting by CreatedAt with Id as tie-breaker
		modelBuilder.Entity<Profile>()
			.HasIndex(p => new { p.Scope, p.CreatedAt, p.Id })
			.HasDatabaseName("ix_profiles_staff_created_at_id")
			.HasFilter("\"scope\" = 0");

		modelBuilder.Entity<Profile>()
			.HasIndex(p => new { p.TenantId, p.Name })
			.IsUnique()
			.HasDatabaseName("ux_profiles_tenant_name")
			// Tenant profile names must be unique per tenant across active rows only.
			.HasFilter("\"scope\" = 1 AND \"is_deleted\" = false");

		modelBuilder.Entity<Profile>()
			.HasIndex(p => new { p.TenantId, p.Scope, p.IsDefault })
			.IsUnique()
			.HasDatabaseName("ux_profiles_tenant_default_profile")
			// At most one active default tenant profile can exist per tenant.
			// Soft-deleted defaults are excluded so a replacement default can be created safely.
			.HasFilter("\"scope\" = 1 AND \"project_id\" IS NULL AND \"is_default\" = true AND \"is_deleted\" = false");

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
						baseEntity.IsDeleted = false;
						baseEntity.DeletedAt = null;
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
						permission.IsDeleted = false;
						permission.DeletedAt = null;
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
