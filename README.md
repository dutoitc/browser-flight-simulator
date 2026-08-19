# AEROLINE — Browser Flight Simulator

Un simulateur de vol léger, sans installation, jouable sur ordinateur, tablette ou téléphone. Choisis une destination, règle ton vol et pilote un AL-182 au-dessus d'une carte OpenStreetMap.

## Jouer

Le jeu public est disponible sur **GitHub Pages** : l'URL apparaît dans la section *Deployments* du dépôt après le premier déploiement.

Pour l'exécuter localement, lance un serveur HTTP statique à la racine du projet :

```bash
python3 -m http.server 8080
```

Puis ouvre <http://localhost:8080>.

## Commandes

| Commande | Action |
|---|---|
| `←` / `→` | Roulis et virage |
| `↑` / `↓` | Cabrer / piquer |
| `W` / `S` | Augmenter / réduire la puissance |
| `A` | Pilote automatique |
| `C` | Changer de caméra |
| `P` | Pause |
| `H` | Masquer le HUD |
| `R` | Recentrer l'assiette |

Une manette standard et des commandes tactiles sont également prises en charge.

## Fonctionnalités

- écran d'accueil et carnet de vol conservé dans le navigateur ;
- douze destinations et coordonnées personnalisées ;
- préparation du départ, de l'heure, de la météo et du carburant ;
- modèle de vol accessible avec vitesse, altitude, cap, roulis, tangage et carburant ;
- AL-182 détaillé en vue poursuite et en vue verticale, avec surfaces, vitrages, train fixe et hélice liée à la puissance ;
- pilote automatique, trois caméras, HUD et détection d'atterrissage ;
- terrain WebGL réellement tridimensionnel, relief limité à ×1,2 et caméra dont le zoom et l'inclinaison suivent réellement l'altitude ;
- mosaïque satellite Sentinel-2 EOxCloudless et modèle d'élévation Mapterhorn, sans clé API ;
- carte OpenStreetMap de secours si WebGL ou les services 3D sont indisponibles ;
- responsive design, clavier, tactile et Gamepad API ;
- aucune clé API, aucun backend et aucune donnée envoyée par le jeu.

## Tests

```bash
npm test
```

Les spécifications et critères d'acceptation se trouvent dans [`doc/SPECIFICATIONS.md`](doc/SPECIFICATIONS.md).

## Cartographie et licence

Le rendu 3D utilise MapLibre GL JS, le relief Mapterhorn et la mosaïque EOxCloudless issue de données Copernicus Sentinel 2025. La carte de secours utilise OpenStreetMap. Ces sources restent soumises à leurs licences et attributions respectives ; le code du projet est distribué sous licence MIT.
