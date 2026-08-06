# Bookmarklet de lecture BD

Ce module transforme temporairement une page web contenant des planches en lecteur plein écran.

## Fonctionnement

- repère les grandes images de la page ;
- propose un menu déroulant pour choisir la planche ;
- affiche une zone agrandie à la fois ;
- fonctionne entièrement dans le navigateur ;
- n’envoie aucune image vers un serveur ;
- se ferme avec `Échap`.

## Installation

1. Ouvrir le fichier `reader-bookmarklet.js`.
2. Copier son contenu dans un favori précédé de `javascript:` après minification, ou utiliser une future page d’installation automatisée.
3. Ouvrir une page contenant les planches.
4. Activer le favori.

## Limitation actuelle

La première version utilise une grille adaptative très légère pour découper visuellement les planches. Elle ne prétend pas encore reconnaître parfaitement les contours réels de chaque case. Une détection géométrique plus précise pourra être ajoutée ensuite, avec correction manuelle des cadres.

Utiliser uniquement ce lecteur sur des contenus que vous êtes autorisé à consulter.