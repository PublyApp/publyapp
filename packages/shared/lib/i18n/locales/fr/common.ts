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
	user: 'User',
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

	// ???
	'item-is-required': '{{item}} est obligatoire',
	'item-not-found': '{{item}} non trouvé',
	'item-is-invalid': '{{item}} is invalid',
	'new-item': 'Nouveau {{item}}',
	'item-is-not-instance-of-type': "{{item}} n'est pas une instance de {{type}}",

	// very specific sentences
	'unknown-error': 'Erreur inconnue',
	'invalid-session': 'Session invalide',
	'must-init-parse-api': 'Doit être initialisé avec un client REST',
	'user-is-not-staff': "L'utilisateur n'est pas du personnel interne",
	'insufficient-role': 'Rôle insuffisant',
	'new-post': 'Nouvel article',
	'user-has-no-email': 'Utilisateur sans email',
} as const satisfies LooseCommonNamespace;

export default commonFR;
