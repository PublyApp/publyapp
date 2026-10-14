using FluentValidation;

using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.Utils;

namespace PublyApp.Api.Lib.Validation;

public class EncryptedIdTokenQuery {
	[FromQuery(Name = "id")]
	public required string Id { get; set; }
	[FromQuery(Name = "token")]
	public required string Token { get; set; }
}

public class EncryptedIdTokenQueryValidator<T>
	: AbstractValidator<T>
	where T : EncryptedIdTokenQuery {
	public EncryptedIdTokenQueryValidator() {
		this.RuleFor(x => x.Id)
			.NotEmpty()
			.WithMessage("id is required")
			.Must(id =>
				CryptoUtils.IsValidEncryptedString(id)
			)
			.WithMessage("id must be a valid encrypted string");

		this.RuleFor(x => x.Token)
			.NotEmpty()
			.WithMessage("token is required");
	}
}
