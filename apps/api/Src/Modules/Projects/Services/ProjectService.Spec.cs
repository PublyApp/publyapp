namespace MainApi.Src.Modules.Projects.Services;

using FluentAssertions;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Modules.Projects.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class ProjectServiceSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public ProjectServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task
	ItShouldSoftDeleteProjectWithoutChangingLifecycleStatusWhenDeleting() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		var tenantId = await dbContext.Tenant
			.Where(t => t.Code == SeedConstants.Tenants.AcmeCode)
			.Select(t => t.Id)
			.SingleAsync();
		if (tenantId is null) {
			throw new InvalidOperationException("Seed tenant id was unexpectedly null.");
		}

		var project = new Project {
			TenantId = tenantId.Value,
			Name = $"Soft Delete Project {Guid.NewGuid():N}",
			Status = ProjectStatus.Active
		};

		dbContext.Project.Add(project);
		await dbContext.SaveChangesAsync();

		var projectId = project.GetRequiredId();
		var service = new ProjectService(dbContext);

		await service.DeleteProjectAsync(projectId);

		dbContext.ChangeTracker.Clear();
		var deletedProject = await dbContext.Project
			.SingleAsync(p => p.Id == projectId);

		deletedProject.IsDeleted.Should().BeTrue();
		deletedProject.DeletedAt.Should().NotBeNull();
		deletedProject.Status.Should().Be(ProjectStatus.Active);

		var visibleProjects = await service.GetProjectsForTenantAsync(tenantId.Value);
		visibleProjects.Should().NotContain(p => p.Id == projectId);
	}
}
