# Application de Gestion SAP

Cette application permet de gérer les factures et les prélèvements avec authentification LDAP.

## Prérequis

- Node.js (v14 ou supérieur)
- PostgreSQL
- Compte LDAP valide

## Installation

1. Cloner le dépôt :
   ```bash
   git clone [URL_DU_REPO]
   cd serverSap
   ```

2. Installer les dépendances :
   ```bash
   npm install
   cd frontend
   npm install
   cd ..
   ```

3. Configurer l'environnement :
   - Copier `.env.example` vers `.env`
   - Modifier les variables d'environnement selon votre configuration

4. Configurer la base de données :
   ```bash
   npx sequelize-cli db:create
   npx sequelize-cli db:migrate
   ```

## Démarrage

1. Démarrer le serveur :
   ```bash
   npm start
   ```

2. Démarrer le frontend (dans un autre terminal) :
   ```bash
   cd frontend
   npm start
   ```

L'application sera accessible à l'adresse : http://localhost:3000

## Fonctionnalités

- Authentification LDAP
- Gestion des factures
- Suivi des téléchargements et suppressions
- Interface utilisateur réactive

## Structure du projet

- `/controllers` - Logique métier
- `/models` - Modèles de données
- `/migrations` - Migrations de base de données
- `/routes` - Définition des routes API
- `/frontend` - Application React
- `/middleware` - Middleware d'authentification

## Variables d'environnement

Créez un fichier `.env` à la racine du projet avec les variables suivantes :

```
PORT=6000
NODE_ENV=development
JWT_SECRET=votre_clé_secrète
LDAP_URL=ldap://votre-serveur-ldap:389
LDAP_BASE_DN=dc=example,dc=com
DB_HOST=localhost
DB_NAME=nom_de_la_base
DB_USER=utilisateur_db
DB_PASS=mot_de_passe_db
DB_PORT=5432
```

## Licence

Ce projet est sous licence MIT.
