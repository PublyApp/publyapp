import type { LooseCommonNamespace } from '../en/common';

const commonFR = {
	hello: 'Bonjour',
	userHasNoEmail: "L'utilisateur n'a pas d'email",

	// item types
	authentication: 'Authentification',
	content: 'Contenu',
	cover: 'Couverture',
	field: 'Champ',
	file: 'Fichier',
	locale: 'Language',
	name: 'Nom',
	post: 'Article',
	role: 'Rôle',
	title: 'Titre',
	translation: 'Traduction',
	user: 'Utilisateur',
	number: 'Nombre',

	// ? ...
	'created-at': 'Créé le',
	draft: 'Brouillon',
	'edit-post': "Éditer l'article",
	edit: 'Éditer',
	'invalid-number': 'Nombre invalide',
	new: 'Nouveau',
	preview: 'Aperçu',
	'publish-date': 'Date de publication',
	published: 'Publié',
	save: 'Sauvegarder',
	'update-date': 'Date de mise à jour',
	views: 'Vues',
	'your-description': 'Votre description',
	'your-title': 'Votre titre',
	'your-content': 'Votre contenu',
	list: 'Liste',
	settings: 'Paramètres',

	// ???
	'item-is-required': '{{item}} est obligatoire',
	'item-not-found': '{{item}} non trouvé',
	'item-is-invalid': '{{item}} est invalide',
	'new-item': 'Nouveau {{item}}',
	'item-is-not-instance-of-type': "{{item}} n'est pas une instance de {{type}}",
	'item-not-translated-short': '{{item}} non traduit',
	'item-not-translated': "Cet {{item}} n'est pas encore traduit dans le language actuel",
	'find-otherLanguage-version-of-item': 'Retrouvez la version {{otherLanguage}} de ce {{item}}',
	here: 'Ici',
	'down-here': 'Ici bas',

	// very specific sentences
	'unknown-error': 'Erreur inconnue',
	'invalid-session': 'Session invalide',
	'user-is-not-staff': "L'utilisateur n'est pas du personnel interne",
	'insufficient-role': 'Rôle insuffisant',
	'new-post': 'Nouvel article',
	'user-has-no-email': 'Utilisateur sans email',
	'an-error-occurred': "Une erreur s'est produite",
	retry: 'Ré-essayer',
	'read-more': 'Lire plus',
	'page-not-found': 'Page introuvable',
	'not-found-sentence':
		"Désolé, nous n'avons pas trouvé la page que vous recherchez. Peut-être avez-vous mal saisi l'URL? Assurez-vous de vérifier votre orthographe.",
	'go-to-home': "Aller à l'accueil",
	'other-posts': 'Autres articles',

	'sign-in': 'Se connecter',
	'create-an-account': 'Créer un compte',
	'email-address': 'Adresse email',
	password: 'Mot de passe',
	'forgot-password': 'Mot de passe oublié',
	login: 'Se connecter',
	'verify-my-email': 'Vérifier mon email',

	'manage-blog-post-slugs': 'Gérer les slugs de cet article',
	'slug-already-used': 'Ce slug est déjà utilisé par un autre article',
	'slugify-current-title': 'Slugger le titre en cours',
	'add-slug': 'Ajout slug',
	'slug-added-to-post': "Slug ajouté à l'article",

	// auth from parse
	'User email is not verified.': "L'e-mail de l'utilisateur n'est pas vérifié.",
	'Session token is expired.': 'Session token expiré.',
	'Invalid username/password.': "Mot de passe/Nom d'utilisateur invalide",
} as const satisfies LooseCommonNamespace;

export default commonFR;
