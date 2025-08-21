using MainApi.Src.Data.DbContext;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Tenant.Product;

public interface IProductService
{
    Task<IEnumerable<Product>> GetAllProductsAsync();
    Task<Product?> GetProductByIdAsync(string id);
    Task<Product> CreateProductAsync(Product product);
    Task<Product> UpdateProductAsync(Product product);
    Task<bool> DeleteProductAsync(string id);
}

public class ProductService : IProductService
{
    private readonly MainApiDbContext _dbContext;

    public ProductService(MainApiDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<IEnumerable<Product>> GetAllProductsAsync()
    {
        return await _dbContext.Product.ToListAsync();
    }

    public async Task<Product?> GetProductByIdAsync(string id)
    {
        return await _dbContext.Product.FindAsync(id);
    }

    public async Task<Product> CreateProductAsync(Product product)
    {
        _dbContext.Product.Add(product);
        await _dbContext.SaveChangesAsync();
        return product;
    }

    public async Task<Product> UpdateProductAsync(Product product)
    {
        _dbContext.Entry(product).State = EntityState.Modified;
        await _dbContext.SaveChangesAsync();
        return product;
    }

    public async Task<bool> DeleteProductAsync(string id)
    {
        var product = await _dbContext.Product.FindAsync(id);
        if (product == null)
        {
            return false;
        }

        _dbContext.Product.Remove(product);
        await _dbContext.SaveChangesAsync();
        return true;
    }
}
