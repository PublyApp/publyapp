using MainApi.Src.Data.DbContext;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Tenant.Product;

public interface IProductService {
	Task<IEnumerable<Product>> GetAllProductsAsync(CancellationToken cancellationToken = default);
	Task<Product?> GetProductByIdAsync(Guid id, CancellationToken cancellationToken = default);
	Task<Product> CreateProductAsync(Product product, CancellationToken cancellationToken = default);
	Task<Product> UpdateProductAsync(Product product, CancellationToken cancellationToken = default);
	Task<bool> DeleteProductAsync(Guid id, CancellationToken cancellationToken = default);
}

public class ProductService : IProductService {
	private readonly MainApiDbContext _dbContext;

	public ProductService(MainApiDbContext dbContext) {
		_dbContext = dbContext;
	}

	public async Task<IEnumerable<Product>> GetAllProductsAsync(CancellationToken cancellationToken = default) {
		return await _dbContext.Product.ToListAsync(cancellationToken).ConfigureAwait(false);
	}

	public async Task<Product?> GetProductByIdAsync(Guid id, CancellationToken cancellationToken = default) {
		return await _dbContext.Product.FindAsync(new object[] { id }, cancellationToken).ConfigureAwait(false);
	}

	public async Task<Product> CreateProductAsync(Product product, CancellationToken cancellationToken = default) {
		_dbContext.Product.Add(product);
		await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
		return product;
	}

	public async Task<Product> UpdateProductAsync(Product product, CancellationToken cancellationToken = default) {
		_dbContext.Entry(product).State = EntityState.Modified;
		await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
		return product;
	}

	public async Task<bool> DeleteProductAsync(Guid id, CancellationToken cancellationToken = default) {
		var product = await _dbContext.Product.FindAsync(new object[] { id }, cancellationToken).ConfigureAwait(false);
		if (product == null) {
			return false;
		}

		_dbContext.Product.Remove(product);
		await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
		return true;
	}
}
