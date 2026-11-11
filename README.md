# Carte des PFMP CIEL

Le répertoire et les effectifs par année proviennent de l’onglet **CIEL** du
classeur `Suivi_entreprises_PFMP_CIEL_uniquement.xlsx`. Les exports Pronote
complètent le répertoire avec les établissements qui figurent dans les
affectations. Les adresses reprises du classeur général privilégient l’onglet
**Détail accueils**. La colonne `source` du CSV indique la ligne retenue.
Les numéros sont ceux des établissements, tirés de l’annuaire Pronote ou des
pages de contact indiquées dans la colonne `source_telephone`.

## Ouvrir la carte

Ouvrir `index.html` dans un navigateur compatible WebGL, avec une connexion
Internet pour charger Leaflet et le [fond OpenFreeMap](https://openfreemap.org/).
On peut aussi lancer `python -m http.server 8000`
depuis ce dossier, puis ouvrir [localhost:8000](http://localhost:8000).

La vue initiale couvre les sites localisés. Un contour pointillé indique une
localisation à l'échelle de la rue, du site ou de la commune. Les structures
dont l'adresse d'accueil reste à confirmer figurent dans la liste. Laisser
`rue` vide pour une structure dont le lieu de stage reste à localiser.

Les dates viennent du calendrier PFMP CIEL 2026-2027 du lycée. Les relevés
`1CIEL Update 2026-11-11.pdf` et `Liste TCIEL 2627 - PFMP3.pdf` renseignent
les périodes de novembre 2026 et de septembre-octobre 2026. La carte affiche
en vert les sites sans accueil recensé dans le relevé de la période choisie.
Les périodes sans relevé et les sites d’affectation ambigus gardent un repère bleu.
Survoler une année dans une fiche, ou la toucher sur mobile, affiche son effectif.

## Mettre les données à jour

1. Modifier `adresses.csv` (UTF-8, séparateur point-virgule). Renseigner
   `tuteur` et `telephone` quand le suivi ou l’établissement les indique.
   La colonne facultative `coordonnees_site` accepte un couple latitude,longitude
   fourni par l'exploitant du site.
2. Renseigner les effectifs par année dans `historique` et les affectations
   par période dans `accueils`. Ces deux champs sont des objets JSON. Ajouter
   dans `accueil_a_verifier` les périodes pour lesquelles le site reste ambigu,
   séparées par des virgules. Activer la couverture d’une période dans
   `carte.js` dès que son relevé est disponible.
3. Lancer `python geocoder.py` pour régénérer `lieux.js` via les services
   de géocodage de l’IGN, du Géoportail luxembourgeois et de Photon.
4. Vérifier les résultats du géocodage et recharger la carte.
