# Mettre ce dossier sur GitHub (dépôt privé)

**Ne téléverse pas le ZIP tel quel comme un fichier du dépôt :** il faut ajouter
les **fichiers à l'intérieur du dossier** en conservant la structure.

## Le plus simple sur Mac : GitHub Desktop

1. Décompresser `Garment-Bending-Lab-GitHub-V3.7.1.zip`.
2. Installer [GitHub Desktop](https://desktop.github.com/) et se connecter.
3. Menu **File > Add Local Repository**, puis choisir le dossier extrait.
4. Si GitHub Desktop indique que ce n'est pas encore un dépôt Git, choisir
   **Create a Repository Here** et garder le dossier comme racine du projet.
5. Faire un premier commit, puis **Publish repository** en vérifiant que
   l'option **Keep this code private** est activée.
6. Connecter le plugin GitHub dans ChatGPT et donner accès à ce dépôt à Codex.

## Alternative : Terminal

Ouvrir un terminal dans le **dossier extrait** :

```bash
git init
git add .
git commit -m "Import GBL V3.7.1 - source pour Codex"
```

Créer ensuite un dépôt **privé** vide sur GitHub, et suivre les commandes
`git remote add origin ...` / `git push` affichées par GitHub.

## Fichiers à ne pas publier

Ne pas ajouter de données privées, fichiers `.env`, avatars personnels, exports
Blender générés, bibliothèques de photographies privées ou gros résultats de
simulation. Le `.gitignore` sert de protection, mais vérifier les fichiers
sélectionnés avant le premier commit.
