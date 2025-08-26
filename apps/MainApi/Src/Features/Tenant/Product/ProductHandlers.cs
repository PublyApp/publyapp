namespace MainApi.Src.Features.Tenant.Product;

public static class ProductHandlers
{
	public static async Task<IResult> GetProducts(IProductService productService)
	{
		var products = await productService.GetAllProductsAsync();
		return TypedResults.Ok(products);
	}

	public static async Task<IResult> GetProductById(string id, IProductService productService)
	{
		var product = await productService.GetProductByIdAsync(id);

		if (product == null)
		{
			return TypedResults.NotFound();
		}

		return TypedResults.Ok(product);
	}

	public static async Task<IResult> CreateProduct(Product product, IProductService productService)
	{
		var createdProduct = await productService.CreateProductAsync(product);
		return TypedResults.Created($"/api/products/{createdProduct.Id}", createdProduct);
	}

	public static async Task<IResult> UpdateProduct(string id, Product product, IProductService productService)
	{
		if (id != product.Id)
		{
			return TypedResults.BadRequest();
		}

		var updatedProduct = await productService.UpdateProductAsync(product);
		return TypedResults.Ok(updatedProduct);
	}

	public static async Task<IResult> DeleteProduct(string id, IProductService productService)
	{
		var deleted = await productService.DeleteProductAsync(id);

		if (!deleted)
		{
			return TypedResults.NotFound();
		}

		return TypedResults.NoContent();
	}
}
