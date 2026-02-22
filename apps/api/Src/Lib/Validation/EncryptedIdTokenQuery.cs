using FluentValidation;

using MainApi.Src.Lib.Utils;

using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Lib.Validation;

public class EncryptedIdTokenQuery {
	[FromQuery]
	public required string Id { get; set; }
	[FromQuery]
	public required string Token { get; set; }
}

public class EncryptedIdTokenQueryValidator<T>
	: AbstractValidator<T>
	where T : EncryptedIdTokenQuery {
	public EncryptedIdTokenQueryValidator() {
		RuleFor(x => x.Id)
			.NotEmpty()
			.WithMessage("ID is required")
			.Must(id =>
				CryptoUtils.IsValidEncryptedString(id)
			)
			.WithMessage("Invalid ID format");

		RuleFor(x => x.Token)
			.NotEmpty()
			.WithMessage("Token is required");
	}
}
