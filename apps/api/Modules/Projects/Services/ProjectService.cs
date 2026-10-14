using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Projects.Entities;

namespace PublyApp.Api.Modules.Projects.Services;

public interface IProjectService {
	Task<Project?> GetProjectAsync(Guid projectId, CancellationToken cancellationToken = default);
	Task<List<Project>> GetProjectsForTenantAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);
	Task<Project> CreateProjectAsync(Project project, CancellationToken cancellationToken = default);
	Task<Project> UpdateProjectAsync(Project project, CancellationToken cancellationToken = default);
	Task DeleteProjectAsync(Guid projectId, CancellationToken cancellationToken = default);
}

[Service(ServiceLifetime.Scoped)]
public class ProjectService : IProjectService {
	private readonly AppDbContext _DbContext;

	public ProjectService(AppDbContext context) {
		this._DbContext = context;
	}

	public async Task<Project?> GetProjectAsync(
		Guid projectId,
		CancellationToken cancellationToken = default
	) {
		return await this._DbContext.Project
			.Where(x => x.Id == projectId && !x.IsDeleted)
			.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<List<Project>> GetProjectsForTenantAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		return await this._DbContext.Project
			.Where(x =>
				x.TenantId == tenantId
				&& !x.IsDeleted
				&& x.Status == ProjectStatus.Active
			)
			.OrderBy(x => x.Name)
			.ToListAsync(cancellationToken);
	}

	public async Task<Project> CreateProjectAsync(
		Project project,
		CancellationToken cancellationToken = default
	) {
		await this._DbContext.Project.AddAsync(project, cancellationToken);
		await this._DbContext.SaveChangesAsync(cancellationToken);
		return project;
	}

	public async Task<Project> UpdateProjectAsync(
		Project project,
		CancellationToken cancellationToken = default
	) {
		this._DbContext.Project.Update(project);
		await this._DbContext.SaveChangesAsync(cancellationToken);
		return project;
	}

	public async Task DeleteProjectAsync(Guid projectId, CancellationToken cancellationToken = default) {
		var project = await this.GetProjectAsync(projectId, cancellationToken);
		if (project is not null) {
			// Deletion is audit state. ProjectStatus.Inactive remains available for non-deleted projects.
			project.IsDeleted = true;
			project.DeletedAt = DateTime.UtcNow;
			await this._DbContext.SaveChangesAsync(cancellationToken);
		}
	}
}
