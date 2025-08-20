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
    private readonly MainApiDbContext _context;

    public ProductService(MainApiDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<Product>> GetAllProductsAsync()
    {
        return await _context.Product.ToListAsync();
    }

    public async Task<Product?> GetProductByIdAsync(string id)
    {
        return await _context.Product.FindAsync(id);
    }

    public async Task<Product> CreateProductAsync(Product product)
    {
        _context.Product.Add(product);
        await _context.SaveChangesAsync();
        return product;
    }

    public async Task<Product> UpdateProductAsync(Product product)
    {
        _context.Entry(product).State = EntityState.Modified;
        await _context.SaveChangesAsync();
        return product;
    }

    public async Task<bool> DeleteProductAsync(string id)
    {
        var product = await _context.Product.FindAsync(id);
        if (product == null)
        {
            return false;
        }

        _context.Product.Remove(product);
        await _context.SaveChangesAsync();
        return true;
    }
}
