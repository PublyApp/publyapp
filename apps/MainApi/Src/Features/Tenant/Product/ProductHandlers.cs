namespace MainApi.Src.Features.Tenant.Product;

public static class ProductHandlers
{
		public static async Task<IResult> GetProducts(IProductService productService)
		{
			var products = await productService.GetAllProductsAsync();
            return Results.Ok(products);
		}

		public static async Task<IResult> GetProductById(string id, IProductService productService)
		{
			var product = await productService.GetProductByIdAsync(id);

            if (product == null)
            {
                return Results.NotFound();
            }

            return Results.Ok(product);
		}

		public static async Task<IResult> CreateProduct(Product product, IProductService productService)
		{
			var createdProduct = await productService.CreateProductAsync(product);
			return Results.Created($"/api/products/{createdProduct.Id}", createdProduct);
		}

		public static async Task<IResult> UpdateProduct(string id, Product product, IProductService productService)
		{
			if (id != product.Id)
			{
				return Results.BadRequest();
			}

			var updatedProduct = await productService.UpdateProductAsync(product);
			return Results.Ok(updatedProduct);
		}

		public static async Task<IResult> DeleteProduct(string id, IProductService productService)
		{
			var deleted = await productService.DeleteProductAsync(id);

			if (!deleted)
			{
				return Results.NotFound();
			}

			return Results.NoContent();
		}
}
