using System.Data.Common;
using System.Linq.Expressions;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Projects.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Tenants.Services;

/// <summary>
/// Specs for TenantUsageService.GetTenantUsageAsync (#168).
///
/// The cost trap: usage numbers are per-tenant aggregates read by staff on a
/// multi-tenant database. A naive implementation that scans every tenant's
/// rows does not scale, so ItShouldFilterEveryQueryOnTheRequestedTenantId
/// anchors the SHAPE of the queries (not just their results): a
/// DbCommandInterceptor records every SQL command the service emits and each
/// one must carry the requested tenant id as a parameter. Any regression to a
/// whole-table scan (or a cross-tenant join) emits commands without the
/// parameter and fails this spec with the offending SQL text.
/// </summary>
public sealed class TenantUsageServiceSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public TenantUsageServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldCountActiveAndTotalUsersProjectsAndScheduledPublications() {
		var tenantId = await SeedRichTenantAsync();

		var result = await NewService().GetTenantUsageAsync(tenantId);
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"Tenant usage snapshot was empty."
			);
		}

		result.UsersTotal.Should().Be(3);
		result.UsersActive.Should().Be(2);
		result.ProjectsCount.Should().Be(2);
		result.ScheduledPublicationsCount.Should().Be(2);
	}

	[Fact]
	public async Task ItShouldExcludeSoftDeletedAndForeignTenantRowsFromCounts() {
		var (tenantId, _) = await SeedTwoTenantsWithNoiseAsync();

		var result = await NewService().GetTenantUsageAsync(tenantId);
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"Tenant usage snapshot was empty."
			);
		}

		// Only this tenant's live rows count; soft-deleted rows and another
		// tenant's rows must never leak into the aggregate.
		result.UsersTotal.Should().Be(1);
		result.UsersActive.Should().Be(1);
		result.ProjectsCount.Should().Be(1);
		result.ScheduledPublicationsCount.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldReturnLastActivityAtFromTheTenantRow() {
		var lastActivity = new DateTime(2026, 8, 1, 9, 30, 0, DateTimeKind.Utc);
		var tenantId = await SeedTenantWithLastActivityAsync(lastActivity);

		var result = await NewService().GetTenantUsageAsync(tenantId);
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"Tenant usage snapshot was empty."
			);
		}

		result.LastActivityAt.Should().Be(lastActivity);
	}

	[Fact]
	public async Task ItShouldReturnZeroesForATenantWithoutAnyActivity() {
		var tenantId = await SeedBareTenantAsync("usage empty");

		var result = await NewService().GetTenantUsageAsync(tenantId);
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"Tenant usage snapshot was empty."
			);
		}

		result.UsersTotal.Should().Be(0);
		result.UsersActive.Should().Be(0);
		result.ProjectsCount.Should().Be(0);
		result.ScheduledPublicationsCount.Should().Be(0);
		result.LastActivityAt.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldReturnNullForAnUnknownTenant() {
		var result = await NewService()
			.GetTenantUsageAsync(Guid.NewGuid());

		result.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldReturnNullWhenTenantIsSoftDeleted() {
		// The existence guard at TenantUsageService.cs:73 excludes soft-deleted
		// tenants. Without that clause, a deleted space would surface as an
		// empty-but-existing one instead of returning null.
		var tenantId = await SeedSoftDeletedTenantAsync();

		var result = await NewService().GetTenantUsageAsync(tenantId);

		result.Should().BeNull(
			"a soft-deleted tenant must be treated as non-existent — otherwise "
			+ "it would surface as an empty-but-existing space instead of "
			+ "returning null"
		);
	}

	[Fact]
	public async Task ItShouldReturnNonNullForALivePendingTenant() {
		// Mirror of ItShouldReturnNullWhenTenantIsSoftDeleted (#1818 r2): a
		// non-deleted tenant must surface, regardless of status. Without this
		// half of the pin, a reviewer can swap the guard
		// `!tenant.IsDeleted` for any status-conditional that happens to be
		// false for the fixture's specific status and the test stays green.
		// Pending is the default Tenant.Status value, so it's the cheapest
		// status to keep un-derivable from the previous fixture.
		var tenantId = await SeedLiveTenantWithStatusAsync(TenantStatus.Pending);

		var result = await NewService().GetTenantUsageAsync(tenantId);

		result.Should().NotBeNull(
			"a non-deleted Pending tenant exists and must surface — the existence "
			+ "guard must depend on IsDeleted, not on Status. A guard that "
			+ "filtered on Status would either return null here (if it required "
			+ "Active) or let a soft-deleted tenant through (if it required "
			+ "Pending) — both are wrong."
		);
	}

	[Fact]
	public async Task ItShouldReturnNonNullForALiveSuspendedTenant() {
		// Same mirror as ItShouldReturnNonNullForALivePendingTenant, but with
		// Suspended. This case in particular kills the reviewer mutation
		// `tenant.Status == TenantStatus.Pending`: a Suspended tenant would
		// wrongly return null under that guard, so the assertion catches it.
		var tenantId = await SeedLiveTenantWithStatusAsync(TenantStatus.Suspended);

		var result = await NewService().GetTenantUsageAsync(tenantId);

		result.Should().NotBeNull(
			"a non-deleted Suspended tenant exists and must surface — soft "
			+ "deletion and tenant suspension are independent concerns. A guard "
			+ "based on Status would hide Suspended tenants from staff usage "
			+ "readouts, breaking triage of suspended-but-still-billable spaces."
		);
	}

	[Fact]
	public async Task ItShouldReturnNullForASoftDeletedSuspendedTenant() {
		// #1818 r3 — closes the "too-permissive" half of the pin. The r1 test
		// (ItShouldReturnNullWhenTenantIsSoftDeleted) seeds a soft-deleted
		// tenant with Status=Active, so any guard that is false for
		// (IsDeleted=true, Status=Active) keeps it green — including the
		// reviewer mutation `!IsDeleted || Status != Active`. This spec
		// combines IsDeleted=true with Status=Suspended; under that mutation
		// `!IsDeleted || Status != Active` evaluates to `false || true` =
		// true, the existence guard passes, and a snapshot is returned. The
		// spec asserts the opposite, so the mutation fails this test.
		var tenantId = await SeedSoftDeletedTenantWithStatusAsync(TenantStatus.Suspended);

		var result = await NewService().GetTenantUsageAsync(tenantId);

		result.Should().BeNull(
			"a soft-deleted tenant must be treated as non-existent regardless "
			+ "of its Status. A guard that lets a deleted-but-non-Active tenant "
			+ "through — e.g. `!IsDeleted || Status != Active` — would surface a "
			+ "deleted space as an empty-but-existing one instead of returning "
			+ "null. Soft deletion and tenant status are independent concerns."
		);
	}

	[Fact]
	public async Task ItShouldReturnNullForASoftDeletedPendingTenant() {
		// #1818 r3 — same direction as the Suspended variant, on the other
		// non-Active status. A guard that lets a deleted-but-Pending tenant
		// through also fails here. Pending is the Tenant.Status default, so
		// this case is the cheapest to seed (no explicit Status assignment is
		// required) and would be the first to silently regress if a future
		// refactor defaulted a soft-deleted tenant to Pending.
		var tenantId = await SeedSoftDeletedTenantWithStatusAsync(TenantStatus.Pending);

		var result = await NewService().GetTenantUsageAsync(tenantId);

		result.Should().BeNull(
			"a soft-deleted tenant must be treated as non-existent regardless "
			+ "of its Status — including the default Pending. A guard that "
			+ "relies on `Status != Active` would let this row through."
		);
	}

	// ── IsDeleted guard specs (expression-tree based, not SQL-regex) ──

	[Fact]
	public async Task ItShouldGuardLastActivityAtReadWithIsDeletedFilter() {
		// #1839 r4 — the LastActivityAt query must carry its own
		// `!tenant.IsDeleted` guard so that a future refactor that reorders or
		// merges the two Tenant queries cannot leak a soft-deleted tenant's
		// LastActivityAt.
		//
		// Strategy: call LastActivityAtQuery() directly (bypassing the
		// existence guard), then assert on the resolved EF expression tree
		// that IsDeleted is negated in the WHERE predicate. This is robust to
		// SQL dialect (NOT (is_deleted), is_deleted = FALSE, NOT EXISTS …) and
		// to semantically equivalent rewrites — a regex on emitted SQL is not.
		var tenantId = await SeedTenantWithLastActivityAsync(
			new DateTime(2026, 8, 15, 12, 0, 0, DateTimeKind.Utc)
		);
		var service = NewServiceWithContext();

		var query = service.LastActivityAtQuery(tenantId);

		AssertIsDeletedNegated(
			query.Expression,
			"Tenant (LastActivityAt)"
		);
	}

	[Fact]
	public async Task ItShouldGuardUsersTotalQueryWithIsDeletedFilter() {
		// #1839 r4 — UsersTotalQuery must negate IsDeleted on the membership
		// row AND on the owning User row. Without either, a soft-deleted
		// membership or user would leak into the total.
		var tenantId = await SeedTenantWithLastActivityAsync(
			new DateTime(2026, 8, 15, 12, 0, 0, DateTimeKind.Utc)
		);
		var service = NewServiceWithContext();

		var query = service.UsersTotalQuery(tenantId);

		AssertIsDeletedNegated(
			query.Expression,
			"UserAccount (UsersTotal)"
		);
	}

	[Fact]
	public async Task ItShouldGuardUsersActiveQueryWithIsDeletedFilter() {
		// #1839 r4 — UsersActiveQuery must negate IsDeleted on the membership
		// row AND on the owning User row. Same guard as UsersTotal, plus the
		// Active status filter.
		var tenantId = await SeedTenantWithLastActivityAsync(
			new DateTime(2026, 8, 15, 12, 0, 0, DateTimeKind.Utc)
		);
		var service = NewServiceWithContext();

		var query = service.UsersActiveQuery(tenantId);

		AssertIsDeletedNegated(
			query.Expression,
			"UserAccount (UsersActive)"
		);
	}

	[Fact]
	public async Task ItShouldGuardProjectsCountQueryWithIsDeletedFilter() {
		// #1839 r4 — ProjectsCountQuery must negate IsDeleted on the project
		// row. Without it, a soft-deleted project would leak into the count.
		var tenantId = await SeedTenantWithLastActivityAsync(
			new DateTime(2026, 8, 15, 12, 0, 0, DateTimeKind.Utc)
		);
		var service = NewServiceWithContext();

		var query = service.ProjectsCountQuery(tenantId);

		AssertIsDeletedNegated(
			query.Expression,
			"Project (ProjectsCount)"
		);
	}

	[Fact]
	public async Task ItShouldGuardScheduledPublicationsCountQueryWithIsDeletedFilter() {
		// #1839 r4 — ScheduledPublicationsCountQuery must negate IsDeleted on
		// the publication row. Without it, a soft-deleted publication would
		// leak into the count.
		var tenantId = await SeedTenantWithLastActivityAsync(
			new DateTime(2026, 8, 15, 12, 0, 0, DateTimeKind.Utc)
		);
		var service = NewServiceWithContext();

		var query = service.ScheduledPublicationsCountQuery(tenantId);

		AssertIsDeletedNegated(
			query.Expression,
			"Publication (ScheduledPublicationsCount)"
		);
	}

	/// <summary>
	/// Walks the expression tree and proves that <c>IsDeleted</c> is negated
	/// on the ROOT entity of the query. A regex on emitted SQL would fail on
	/// semantically equivalent rewrites (NOT EXISTS, is_deleted = FALSE, …);
	/// this asserts the MEANING, not the rendering.
	///
	/// Entity-specific: for a UserAccount query, it checks that the
	/// UserAccount.IsDeleted is negated (not just a related entity's). This
	/// prevents a mutation that removes the guard on the queried entity but
	/// leaves a guard on a related entity from passing.
	/// </summary>
	private static void AssertIsDeletedNegated(
		Expression expression,
		string entityName
	) {
		// Unwrap to find the lambda whose parameter is the root entity.
		var lambda = ExtractWhereLambda(expression);
		var entityParam = lambda.Parameters[0];

		var visitor = new IsDeletedNegationVisitor(entityParam);
		visitor.Visit(lambda.Body);

		visitor.Found.Should().BeTrue(
			$"the query for {entityName} must negate IsDeleted on the queried "
			+ "entity in its WHERE predicate — a query that reads through "
			+ "soft-deleted rows leaks deleted data into the usage snapshot. "
			+ "A regex on emitted SQL would fail here on equivalent rewrites "
			+ "(NOT EXISTS, is_deleted = FALSE); this asserts the meaning, "
			+ "not the rendering."
		);
	}

	/// <summary>
	/// Extracts the Where lambda from a query expression. Handles the common
	/// pattern of DbSet.Where(...).Where(...) chains by finding the innermost
	/// lambda whose parameter type matches the entity type.
	/// </summary>
	private static LambdaExpression ExtractWhereLambda(Expression expression) {
		// If it's already a lambda, return it.
		if (expression is LambdaExpression lambda) {
			return lambda;
		}

		// Look for MethodCallExpression (Where, Select, etc.) and recurse
		// into the lambda argument.
		if (expression is MethodCallExpression {
			Method.Name: "Where"
		} call) {
			// The lambda is the last argument to Where.
			var lambdaArg = call.Arguments.Last();
			if (lambdaArg is UnaryExpression {
				Operand: LambdaExpression innerLambda
			}) {
				return innerLambda;
			}
			if (lambdaArg is LambdaExpression directLambda) {
				return directLambda;
			}
		}

		// Fallback: try to find any lambda in the expression.
		// This handles edge cases like query syntax compilation.
		var finder = new LambdaFinder();
		finder.Visit(expression);
		if (finder.Found is not null) {
			return finder.Found;
		}

		throw new InvalidOperationException(
			"Could not extract Where lambda from query expression of type "
				+ expression.GetType().Name
		);
	}

	private sealed class LambdaFinder : ExpressionVisitor {
		public LambdaExpression? Found { get; private set; }

		protected override Expression VisitLambda<T>(Expression<T> node) {
			Found ??= node;
			return base.VisitLambda(node);
		}
	}

	/// <summary>
	/// Visitor that detects a <c>NOT</c> (<c>!</c>) applied to the queried
	/// entity's <c>IsDeleted</c> property anywhere in the expression tree.
	/// Robust to SQL dialect and to semantically equivalent rewrites — it
	/// inspects the LINQ expression, not the rendered SQL.
	///
	/// Entity-specific: only matches <c>!entity.IsDeleted</c> where
	/// <c>entity</c> is the query's root parameter. A negation on a related
	/// entity (e.g. <c>!ua.User.IsDeleted</c>) does not count for the
	/// entity-specific assertion.
	/// </summary>
	private sealed class IsDeletedNegationVisitor : ExpressionVisitor {
		private readonly ParameterExpression _entityParam;

		public IsDeletedNegationVisitor(ParameterExpression entityParam) {
			_entityParam = entityParam;
		}

		public bool Found { get; private set; }

		protected override Expression VisitUnary(UnaryExpression node) {
			if (node.NodeType == ExpressionType.Not
				&& IsEntityIsDeletedAccess(node.Operand)) {
				Found = true;
			}
			return base.VisitUnary(node);
		}

		protected override Expression VisitBinary(BinaryExpression node) {
			// Also catch `is_deleted == false` / `is_deleted = FALSE`.
			if (node.NodeType == ExpressionType.Equal
				&& IsEntityIsDeletedAccess(node.Left)
				&& node.Right is ConstantExpression { Value: false }) {
				Found = true;
			}
			return base.VisitBinary(node);
		}

		private bool IsEntityIsDeletedAccess(Expression expression) {
			// Unwrap conversions (e.g. bool -> bool?).
			if (expression is UnaryExpression {
				NodeType: ExpressionType.Convert or ExpressionType.Quote
			} convert) {
				expression = convert.Operand;
			}
			// Match `entity.IsDeleted` where entity IS the root parameter
			// directly — NOT a member access chain like `entity.User.IsDeleted`.
			return expression is MemberExpression {
				Member.Name: "IsDeleted",
				Expression: ParameterExpression param
			} && param == _entityParam;
		}
	}

	// ── existing helper seed methods ──

	[Fact]
	public async Task ItShouldFilterEveryQueryOnTheRequestedTenantId() {
		var tenantId = await SeedRichTenantAsync();
		var connectionString = await GetConnectionStringAsync();
		var interceptor = new TenantParameterCaptureInterceptor();

		await using var serviceDbContext = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.AddInterceptors(interceptor)
				.Options
		);

		var service = new TenantUsageService(
			serviceDbContext,
			NullLogger<TenantUsageService>.Instance
		);

		var tenantIdText = tenantId.ToString();
		await service.GetTenantUsageAsync(tenantId);

		interceptor.Commands.Should().NotBeEmpty(
			"the service must issue its aggregate queries through EF Core so "
			+ "the shape guard can observe them"
		);
		var unfiltered = interceptor.Commands
			.Where(c => !c.Parameters.Contains(tenantIdText))
			.ToList();
		unfiltered.Should().BeEmpty(
			"every query emitted by GetTenantUsageAsync must filter on the "
			+ "requested tenant id — an unbounded cross-tenant scan is the "
			+ "exact cost failure mode #168 forbids. Offending commands:\n"
			+ string.Join("\n", unfiltered.Select(c => c.Text))
		);
	}

	[Fact]
	public async Task ItShouldNotEmitAnyWriteCommand() {
		// The shape guard above only proves that every *read* filters on the
		// tenant id. If this service ever starts writing (cached snapshot,
		// access log, computed column), a write command would slip past that
		// guard unnoticed — it carries no result set to count. This spec
		// proves the service emits NO write command at all today, so a future
		// write is a regression someone must think about, not a silent cost
		// leak. The interceptor now captures NonQueryExecuting as well.
		var tenantId = await SeedRichTenantAsync();
		var connectionString = await GetConnectionStringAsync();
		var interceptor = new TenantParameterCaptureInterceptor();

		await using var serviceDbContext = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.AddInterceptors(interceptor)
				.Options
		);

		var service = new TenantUsageService(
			serviceDbContext,
			NullLogger<TenantUsageService>.Instance
		);

		await service.GetTenantUsageAsync(tenantId);

		var writeCommands = interceptor.Commands
			.Where(c => !c.Text.StartsWith("SELECT", StringComparison.OrdinalIgnoreCase))
			.ToList();
		writeCommands.Should().BeEmpty(
			"GetTenantUsageAsync must be a read-only operation — any write "
			+ "command it emits today is a cost leak the shape guard would "
			+ "miss. Offending commands:\n"
			+ string.Join("\n", writeCommands.Select(c => c.Text))
		);
	}

	private TenantUsageService NewService() {
		return new TenantUsageService(
			CreateServiceDbContext().GetAwaiter().GetResult(),
			NullLogger<TenantUsageService>.Instance
		);
	}

	private TenantUsageService NewServiceWithContext() {
		return new TenantUsageService(
			CreateServiceDbContext().GetAwaiter().GetResult(),
			NullLogger<TenantUsageService>.Instance
		);
	}

	private async Task<AppDbContext> CreateServiceDbContext() {
		var connectionString = await GetConnectionStringAsync();
		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}

	private async Task<string> GetConnectionStringAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var connectionString = dbContext.Database.GetConnectionString();
		if (connectionString is null) {
			throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
		}

		return connectionString;
	}

	[Fact]
	public async Task ItShouldNotCountProjectAccountsInTheTenantUserCounters() {
		// A Project account has a non-null TenantId on the same tenant, so it
		// would be counted as a tenant member if the Scope filter were absent.
		// This spec proves the filter distinguishes scope, not just tenant id.
		var tenantId = await SeedTenantWithAProjectAccountAsync();

		var result = await NewService().GetTenantUsageAsync(tenantId);
		result.Should().NotBeNull();
		if (result is null) {
			throw new InvalidOperationException(
				"Tenant usage snapshot was empty."
			);
		}

		result.UsersTotal.Should().Be(1);
		result.UsersActive.Should().Be(1);
	}

	private async Task<Guid> SeedTenantWithAProjectAccountAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"usage-scope-{Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 20,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();
		var tenantId = tenant.GetRequiredId();

		var tenantUser = new User {
			Email = $"usage-scope-tenant-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		await dbContext.User.AddAsync(tenantUser);
		await dbContext.SaveChangesAsync();

		await dbContext.UserAccount.AddAsync(
			UserAccount.CreateTenantAccount(tenantUser.GetRequiredId(), tenantId)
		);

		var projectUser = new User {
			Email = $"usage-scope-project-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		await dbContext.User.AddAsync(projectUser);
		await dbContext.SaveChangesAsync();

		var project = new Project {
			TenantId = tenantId,
			Name = $"usage-scope-project-{Guid.NewGuid():N}",
		};
		await dbContext.Project.AddAsync(project);
		await dbContext.SaveChangesAsync();

		await dbContext.UserAccount.AddAsync(
			UserAccount.CreateProjectAccount(
				projectUser.GetRequiredId(), tenantId, project.GetRequiredId()
			)
		);

		await dbContext.SaveChangesAsync();

		return tenantId;
	}

	private async Task<Guid> SeedBareTenantAsync(string namePrefix) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"{namePrefix} {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		return tenant.GetRequiredId();
	}

	private async Task<Guid> SeedSoftDeletedTenantAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"usage-deleted {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		// Soft-delete AFTER insert: SaveChanges forces IsDeleted=false on Added
		// rows (audit interceptor), matching the existing specs' seeding note.
		tenant.IsDeleted = true;
		await dbContext.SaveChangesAsync();

		return tenant.GetRequiredId();
	}

	private async Task<Guid> SeedSoftDeletedTenantWithStatusAsync(
			TenantStatus status
		) {
		// Mirror of SeedSoftDeletedTenantAsync, with an explicit Status so the
		// r3 specs can probe the (IsDeleted=true, Status∈{Suspended,Pending})
		// quadrant. The r1 seed used Status=Active, which made the reviewer
		// mutation `!IsDeleted || Status != Active` indistinguishable from
		// the real `!IsDeleted` guard on that single fixture.
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"usage-deleted-{status} {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = status,
			MaxUsers = 10,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		// Soft-delete AFTER insert: SaveChanges forces IsDeleted=false on Added
		// rows (audit interceptor), matching the existing specs' seeding note.
		tenant.IsDeleted = true;
		await dbContext.SaveChangesAsync();

		return tenant.GetRequiredId();
	}

	private async Task<Guid> SeedLiveTenantWithStatusAsync(TenantStatus status) {
		// Mirror of SeedSoftDeletedTenantAsync for the non-deleted half of the
		// #1818 r2 pin: a tenant that exists and is not soft-deleted, with an
		// explicit Status so the spec is decoupled from the entity default
		// (Tenant.Status defaults to Pending — Pending and Suspended are
		// covered by the two callers, and a future Active caller is one
		// parameter away).
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"usage-live-{status} {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = status,
			MaxUsers = 10,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		return tenant.GetRequiredId();
	}

	private async Task<Guid> SeedTenantWithLastActivityAsync(
		DateTime lastActivityAt
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"usage activity {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
			LastActivityAt = lastActivityAt,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		return tenant.GetRequiredId();
	}

	private async Task<Guid> SeedRichTenantAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"usage rich {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 20,
		};
		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();
		var tenantId = tenant.GetRequiredId();

		async Task<User> AddUserAsync(AccountLevel level, bool suspendAccount) {
			var user = new User {
				Email = $"usage-rich-{Guid.NewGuid():N}@example.com",
				Password = "unused",
				Status = UserStatus.Active,
				IsVerified = true,
			};
			await dbContext.User.AddAsync(user);
			await dbContext.SaveChangesAsync();

			var account = UserAccount.CreateTenantAccount(
				user.GetRequiredId(), tenantId, level
			);
			if (suspendAccount) {
				account.Status = AccountStatus.Suspended;
			}
			await dbContext.UserAccount.AddAsync(account);
			await dbContext.SaveChangesAsync();

			return user;
		}

		var owner = await AddUserAsync(AccountLevel.Admin, suspendAccount: false);
		await AddUserAsync(AccountLevel.User, suspendAccount: false);
		await AddUserAsync(AccountLevel.User, suspendAccount: true);

		var activeProject = new Project {
			TenantId = tenantId,
			Name = $"usage-project-active-{Guid.NewGuid():N}",
		};
		var inactiveProject = new Project {
			TenantId = tenantId,
			Name = $"usage-project-inactive-{Guid.NewGuid():N}",
			Status = ProjectStatus.Inactive,
		};
		dbContext.Project.AddRange(activeProject, inactiveProject);
		await dbContext.SaveChangesAsync();

		var postA = new Post {
			TenantId = tenantId,
			Body = "usage spec post A",
			CreatedByUserId = owner.GetRequiredId(),
		};
		var postB = new Post {
			TenantId = tenantId,
			Body = "usage spec post B",
			CreatedByUserId = owner.GetRequiredId(),
		};
		var accountOne = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@usage-one.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		var accountTwo = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@usage-two.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		dbContext.Post.AddRange(postA, postB);
		dbContext.SocialAccount.AddRange(accountOne, accountTwo);
		await dbContext.SaveChangesAsync();

		// ux_publications_post_account allows one publication per (post,
		// account) pair, so spread the rows over distinct pairs.
		dbContext.Publication.AddRange(
			new Publication {
				TenantId = tenantId,
				PostId = postA.GetRequiredId(),
				SocialAccountId = accountOne.GetRequiredId(),
				Status = PublicationStatus.Scheduled,
				ScheduledAtUtc = DateTime.UtcNow.AddHours(2),
				ScheduledTimeZone = "Etc/UTC",
				IdempotencyKey = $"usage-sched-1-{Guid.NewGuid():N}",
			},
			new Publication {
				TenantId = tenantId,
				PostId = postA.GetRequiredId(),
				SocialAccountId = accountTwo.GetRequiredId(),
				Status = PublicationStatus.Scheduled,
				ScheduledAtUtc = DateTime.UtcNow.AddHours(3),
				ScheduledTimeZone = "Etc/UTC",
				IdempotencyKey = $"usage-sched-2-{Guid.NewGuid():N}",
			},
			new Publication {
				TenantId = tenantId,
				PostId = postB.GetRequiredId(),
				SocialAccountId = accountOne.GetRequiredId(),
				Status = PublicationStatus.Published,
				ScheduledAtUtc = DateTime.UtcNow.AddDays(-1),
				ScheduledTimeZone = "Etc/UTC",
				IdempotencyKey = $"usage-pub-1-{Guid.NewGuid():N}",
			}
		);
		await dbContext.SaveChangesAsync();

		return tenantId;
	}

	private async Task<(Guid TenantId, Guid OtherTenantId)>
	SeedTwoTenantsWithNoiseAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Name = $"usage noise {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		var otherTenant = new Tenant {
			Name = $"usage other {Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		dbContext.Tenant.AddRange(tenant, otherTenant);
		await dbContext.SaveChangesAsync();
		var tenantId = tenant.GetRequiredId();
		var otherTenantId = otherTenant.GetRequiredId();

		var keptUser = new User {
			Email = $"usage-kept-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		var deletedUser = new User {
			Email = $"usage-deleted-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		dbContext.User.AddRange(keptUser, deletedUser);
		await dbContext.SaveChangesAsync();

		dbContext.UserAccount.Add(
			UserAccount.CreateTenantAccount(keptUser.GetRequiredId(), tenantId)
		);
		var doomedAccount = UserAccount.CreateTenantAccount(
			deletedUser.GetRequiredId(), tenantId
		);
		dbContext.UserAccount.Add(doomedAccount);
		// Foreign-tenant membership: must never appear in this tenant's counts.
		dbContext.UserAccount.Add(
			UserAccount.CreateTenantAccount(
				keptUser.GetRequiredId(), otherTenantId
			)
		);
		await dbContext.SaveChangesAsync();

		// Soft-delete AFTER insert: SaveChanges forces IsDeleted=false on Added
		// rows (audit interceptor), matching the existing specs' seeding note.
		doomedAccount.IsDeleted = true;
		deletedUser.IsDeleted = true;
		await dbContext.SaveChangesAsync();

		var keptProject = new Project {
			TenantId = tenantId,
			Name = $"usage-live-project-{Guid.NewGuid():N}",
		};
		var doomedProject = new Project {
			TenantId = tenantId,
			Name = $"usage-noise-project-{Guid.NewGuid():N}",
		};
		var otherProject = new Project {
			TenantId = otherTenantId,
			Name = $"usage-other-project-{Guid.NewGuid():N}",
		};
		dbContext.Project.AddRange(keptProject, doomedProject, otherProject);
		await dbContext.SaveChangesAsync();

		doomedProject.IsDeleted = true;
		await dbContext.SaveChangesAsync();

		var user = new User {
			Email = $"usage-other-owner-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		dbContext.User.Add(user);
		await dbContext.SaveChangesAsync();

		var otherPost = new Post {
			TenantId = otherTenantId,
			Body = "foreign post",
			CreatedByUserId = user.GetRequiredId(),
		};
		var otherAccount = new SocialAccount {
			TenantId = otherTenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@other.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		dbContext.Post.Add(otherPost);
		dbContext.SocialAccount.Add(otherAccount);
		await dbContext.SaveChangesAsync();

		dbContext.Publication.Add(new Publication {
			TenantId = otherTenantId,
			PostId = otherPost.GetRequiredId(),
			SocialAccountId = otherAccount.GetRequiredId(),
			Status = PublicationStatus.Scheduled,
			ScheduledAtUtc = DateTime.UtcNow.AddHours(1),
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = $"usage-other-{Guid.NewGuid():N}",
		});
		await dbContext.SaveChangesAsync();

		return (tenantId, otherTenantId);
	}

	private sealed record CapturedCommand(string Text, string Parameters) {
		public bool Contains(string value) {
			return Text.Contains(value, StringComparison.OrdinalIgnoreCase)
				|| Parameters.Contains(value, StringComparison.Ordinal);
		}
	}

	private sealed class TenantParameterCaptureInterceptor : DbCommandInterceptor {
		public List<CapturedCommand> Commands { get; } = [];

		public override InterceptionResult<DbDataReader> ReaderExecuting(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<DbDataReader> result
		) {
			Record(command);
			return base.ReaderExecuting(command, eventData, result);
		}

		public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<DbDataReader> result,
			CancellationToken cancellationToken = default
		) {
			Record(command);
			return new ValueTask<InterceptionResult<DbDataReader>>(result);
		}

		public override InterceptionResult<object> ScalarExecuting(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<object> result
		) {
			Record(command);
			return base.ScalarExecuting(command, eventData, result);
		}

		public override ValueTask<InterceptionResult<object>> ScalarExecutingAsync(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<object> result,
			CancellationToken cancellationToken = default
		) {
			Record(command);
			return new ValueTask<InterceptionResult<object>>(result);
		}

		public override InterceptionResult<int> NonQueryExecuting(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<int> result
		) {
			Record(command);
			return base.NonQueryExecuting(command, eventData, result);
		}

		public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<int> result,
			CancellationToken cancellationToken = default
		) {
			Record(command);
			return new ValueTask<InterceptionResult<int>>(result);
		}

		private void Record(DbCommand command) {
			var parameters = string.Join(
				", ",
				command.Parameters
					.Cast<DbParameter>()
					.Select(p => $"{p.ParameterName}={p.Value}")
			);
			Commands.Add(new CapturedCommand(command.CommandText, parameters));
		}
	}
}
