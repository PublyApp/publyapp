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
	users: 'Utilisateurs',
	user: 'Utilisateur',
	number: 'Nombre',
	tenant: 'Tenant',
	tenants: 'Tenants',
	status: 'Statut',
	logo: 'Logo',

	// ? ...
	views: 'Vues',
	'created-at': 'Créé le',
	draft: 'Brouillon',
	edit: 'Éditer',
	'edit-post': "Éditer l'article",
	published: 'Publié',
	'invalid-number': 'Nombre invalide',
	new: 'Nouveau',
	preview: 'Aperçu',
	'publish-date': 'Date de publication',
	save: 'Sauvegarder',
	'update-date': 'Date de mise à jour',
	'your-description': 'Votre description',
	'your-title': 'Votre titre',
	'your-content': 'Votre contenu',
	list: 'Liste',
	settings: 'Paramètres',
	overview: 'Aperçu',
	'staff-member': 'Membre du staff',
	'staff-members': 'Membres du staff',
	link: 'Lien',

	// ???
	'item-is-required': '{{item}} est obligatoire',
	'item-not-found': '{{item}} introuvable',
	'item-is-invalid': '{{item}} est invalide',
	'invalid-item': '{{item}} invalide',
	'new-item': 'Nouveau {{item}}',
	'item-is-not-instance-of-type': "{{item}} n'est pas une instance de {{type}}",
	'item-not-translated-short': '{{item}} non traduit',
	'item-not-translated':
		"Cet {{item}} n'est pas encore traduit dans le language actuel",
	'find-otherLanguage-version-of-item':
		'Retrouvez la version {{otherLanguage}} de ce {{item}}',
	here: 'Ici',
	'down-here': 'Ici bas',
	'unknown-item': '{{item}} inconnu',
	'pricing-plan': 'Plan tarifaire',
	'auth-welcome-title': 'Re-bienvenu(e)',
	cancel: 'Annuler',
	confirm: 'Confirmer',
	'item-creation-success-message': '{{item}} créé avec succès',

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
	'no-account-yet': 'Pas encore de compte?',
	'sign-up': "S'inscrire",
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

	'master-key-only-function': 'Fonction master key uniquement',
	'max-page-size-exceeded': 'Taille de page maximum de {{max}} excédée',

	'new-signup-disabled': 'Les nouvelles inscriptions sont désactivées',
	'set-as-current': 'Définir comme actuel',
	'slug-linked-to-another-post': 'Slug lié à un autre article',

	'list-of-items': 'Liste des {{items}}',
	unauthorized: 'Non autorisé',
	'too-many-invalid-requests': 'Trop de requêtes invalides',

	firstname: 'Prénom',
	lastname: 'Nom',
	'save-item-confirmation-title': 'Sauvegarder {{item}}?',
	'save-item-confirmation-message':
		'{{item}} sera sauvegardé avec les informations suivantes. Veuillez Confirmer.',

	'invalid-email-verification-link-description':
		'Le lien de vérification que vous avez fourni est invalide ou expiré. Contactez votre administrateur pour obtenir un nouveau lien.',

	'workspace-name': 'Nom du workspace',
	'create-the-tenant': 'Créer le tenant',
	'add-a-user': 'Ajouter un utilisateur',
	'max-users': "Nombre maximum d'utilisateurs",
	'tenant-should-have-at-least-one-admin':
		'Un tenant doit avoir au moins un admin',
	'each-user-must-have-a-unique-email':
		'Chaque utilisateur doit avoir une adresse email unique.',
	'initial-users': 'Utilisateurs initiaux',
	'max-users-reached': "Nombre maximum d'utilisateurs atteint",
	'initial-users-must-be-a-valid-json-string':
		'Les utilisateurs initiaux doivent être une chaîne JSON valide',

	'Error while uploading file': 'Error while uploading file',
	'Internal server error': 'Erreur interne du serveur',

	// messages from parse
	'User email is not verified.': "L'e-mail de l'utilisateur n'est pas vérifié.",
	'Session token is expired.': 'Session token expiré.',
	'Invalid username/password.': "Mot de passe/Nom d'utilisateur invalide",
	'Invalid session token': 'Session token invalide',
	'Invalid token': 'Token invalide',
	'Token expired': 'Token expiré',
	'Invalid object for context.': 'Objet invalide pour le contexte.',
	'Context is not an object': "Context n'est pas un objet",
} as const satisfies LooseCommonNamespace;

export default commonFR;
