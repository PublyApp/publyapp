namespace MainApi.Src.Features.Tenant.Product;

public static class ProductHandlers {
	public static async Task<IResult> GetProducts(IProductService productService, CancellationToken cancellationToken = default) {
		var products = await productService.GetAllProductsAsync(cancellationToken).ConfigureAwait(false);
		return TypedResults.Ok(products);
	}

	public static async Task<IResult> GetProductById(Guid id, IProductService productService, CancellationToken cancellationToken = default) {
		var product = await productService.GetProductByIdAsync(id, cancellationToken).ConfigureAwait(false);

		if (product == null) {
			return TypedResults.NotFound();
		}

		return TypedResults.Ok(product);
	}

	public static async Task<IResult> CreateProduct(Product product, IProductService productService, CancellationToken cancellationToken = default) {
		var createdProduct = await productService.CreateProductAsync(product, cancellationToken).ConfigureAwait(false);
		return TypedResults.Created($"/api/products/{createdProduct.Id}", createdProduct);
	}

	public static async Task<IResult> UpdateProduct(Guid id, Product product, IProductService productService, CancellationToken cancellationToken = default) {
		if (id != product.Id) {
			return TypedResults.BadRequest();
		}

		var updatedProduct = await productService.UpdateProductAsync(product, cancellationToken).ConfigureAwait(false);
		return TypedResults.Ok(updatedProduct);
	}

	public static async Task<IResult> DeleteProduct(Guid id, IProductService productService, CancellationToken cancellationToken = default) {
		var deleted = await productService.DeleteProductAsync(id, cancellationToken).ConfigureAwait(false);

		if (!deleted) {
			return TypedResults.NotFound();
		}

		return TypedResults.NoContent();
	}
}
