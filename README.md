# AEROLINE — Browser Flight Simulator

Un simulateur de vol léger, sans installation, jouable sur ordinateur, tablette ou téléphone. Choisis une destination et l'un des cinq appareils, puis vole au-dessus d'un terrain satellite 3D.

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
| `M` | Activer ou couper le son |
| `K` | Copier une capture PNG |

Une manette standard et des commandes tactiles sont également prises en charge.

## Fonctionnalités

- écran d'accueil et carnet de vol conservé dans le navigateur ;
- douze destinations et coordonnées personnalisées ;
- préparation de l'appareil, du départ, de l'heure, de la météo et du carburant ;
- cinq appareils aux performances distinctes : monomoteur AL-182 (165 kt), turbopropulseur VT-12 (290 kt), jet léger SJ-42 (480 kt), chasseur FX-19 (1 450 kt) et soucoupe UFO-X1 (4 200 kt) ;
- modèle de vol adapté à chaque appareil avec vitesse, altitude, cap, roulis, tangage et consommation ;
- modèles Three.js tridimensionnels avec fuselage fuselé, ailes effilées, cockpit vitré, feux et propulsion ; train tricycle cohérent, trains escamotables, postcombustion animée et anneau antigravité lumineux ;
- silhouettes dédiées à chaque appareil dans l'écran de préparation ;
- tangage visuel cohérent : le nez se lève en montée et s'abaisse en descente ;
- stabilité assistée : commandes relâchées, l'appareil revient au vol en palier sans gain d'altitude parasite ;
- agilité différenciée, avec des virages beaucoup plus rapides pour le chasseur et la soucoupe ;
- ambiance audio Web Audio propre à chaque propulsion, alertes de décrochage et passage du mur du son ;
- pilote automatique, trois caméras, HUD et détection d'atterrissage ;
- terrain WebGL réellement tridimensionnel, relief limité à ×1,2, caméra liée à l'altitude, transitions de tuiles neutralisées et horizon moins voilé ;
- bâtiments OpenStreetMap extrudés en 3D dans la région de New York ;
- capture PNG du vol vers le presse-papiers, avec téléchargement de secours ;
- historique local des douze derniers vols avec lieu, appareil, durée, distance, performances et bouton de rejeu ;
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

Le rendu 3D utilise MapLibre GL JS, le relief Mapterhorn, les bâtiments OpenFreeMap/OpenStreetMap et la mosaïque EOxCloudless issue de données Copernicus Sentinel 2025. La carte de secours utilise OpenStreetMap. Ces sources restent soumises à leurs licences et attributions respectives ; le code du projet est distribué sous licence MIT.
