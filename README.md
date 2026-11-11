# Carte des PFMP 1CIEL

Essai Leaflet à partir du relevé Pronote `1CIEL Update 2026-11-11.pdf`.
Chaque fiche regroupe les affectations d'une structure par classe. Les lignes
sans structure sont exclues et les données de la carte se limitent aux
établissements et aux effectifs par classe.

## Ouvrir la carte

Ouvrir `index.html` dans un navigateur compatible WebGL, avec une connexion
Internet pour charger Leaflet et le [fond OpenFreeMap](https://openfreemap.org/).
On peut aussi lancer `python -m http.server 8000`
depuis ce dossier, puis ouvrir [localhost:8000](http://localhost:8000).

La vue initiale couvre la Moselle et le Luxembourg. Le bouton **Voir tous les
points** inclut aussi le siège de M2 Gestion et Conseil à Drancy. Le lieu
effectif de cette PFMP reste à confirmer. Un contour pointillé indique une
localisation à l'échelle de la rue, du site ou de la commune.

## Mettre les données à jour

1. Modifier `adresses.csv` (UTF-8, séparateur point-virgule). Les colonnes
   `a` et `b` donnent le nombre d'affectations par classe. La colonne
   facultative `coordonnees_site` accepte un couple latitude,longitude
   fourni par l'exploitant du site.
2. Lancer `python geocoder.py` pour régénérer `lieux.js` via les services
   de géocodage de l'IGN et du Géoportail luxembourgeois.
3. Vérifier les résultats du géocodage et recharger la carte.
