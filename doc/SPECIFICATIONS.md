# Browser Flight Simulator — spécifications du MVP

## But

Créer un simulateur de vol immédiatement jouable dans un navigateur, inspiré des interfaces sombres et aéronautiques des références fournies. Le joueur choisit une destination, prépare son vol et pilote un avion léger au-dessus d'une carte réelle, sans installation ni clé API.

Le projet doit rester simple à héberger sur GitHub Pages : HTML, CSS et JavaScript natifs, sans compilation ni serveur applicatif.

## Périmètre fonctionnel

### 1. Accueil et progression

- Présenter le produit, les commandes principales et la progression locale.
- Permettre de reprendre immédiatement un vol.
- Conserver dans le navigateur le temps de vol, la distance parcourue et les atterrissages réussis.

### 2. Exploration

- Proposer plusieurs destinations prédéfinies, dont Lausanne, Dubai, New York et Tokyo.
- Rechercher une destination locale par nom ou saisir directement des coordonnées `latitude, longitude`.
- Afficher la destination sélectionnée et ses coordonnées sur une carte de préparation.
- Choisir l'appareil, l'heure, la météo, le carburant et le mode de départ.
- Proposer un monomoteur accessible, un turbopropulseur rapide et un jet léger, chacun avec ses performances.

### 3. Simulation de vol

- Afficher une vue extérieure avec carte réelle OpenStreetMap et repli graphique hors ligne.
- Simuler de manière accessible : cap, roulis, tangage, vitesse, altitude, vitesse verticale et carburant.
- Gérer les commandes au clavier, les boutons tactiles et une manette compatible Gamepad API.
- Proposer pause, recentrage, changement de caméra, masquage du HUD et pilote automatique.
- Détecter un atterrissage réussi ou un crash selon la vitesse verticale et l'inclinaison.
- Afficher l'appareil comme un volume 3D éclairé avec fuselage, ailes, cockpit, propulsion, feux et train tricycle cohérent.

### 4. Interface

- Direction artistique sombre, bleu nuit et cyan, lisible sur ordinateur et tablette.
- HUD aéronautique : vitesse, altitude, cap, horizon artificiel, puissance et état du vol.
- Écrans accessibles au clavier, focus visible et textes contrastés.
- Interface responsive à partir de 360 px de largeur.

## Modèle de vol simplifié

Le MVP ne vise pas une certification ni le réalisme d'un simulateur professionnel. Il privilégie une sensation cohérente :

- la puissance détermine la vitesse cible ;
- le roulis modifie progressivement le cap ;
- le tangage et la vitesse influencent la montée ou la descente ;
- l'altitude ne peut pas passer sous le sol ;
- le carburant diminue selon la puissance ;
- un pilote automatique stabilise le cap et l'altitude courants.

## Architecture

- `index.html` : structure des trois écrans et HUD.
- `styles.css` : identité visuelle et responsive design.
- `src/app.js` : navigation, stockage local et orchestration.
- `src/flight-model.js` : modèle de vol déterministe et testable.
- `src/aircrafts.js` : catalogue et performances des trois appareils.
- `src/aircraft-renderer.js` : modèles 3D procéduraux Three.js, animation et train d'atterrissage.
- `src/map-renderer.js` : rendu cartographique et cache des tuiles.
- `src/terrain-renderer.js` : terrain WebGL, relief plafonné à ×1,2, caméra liée à l'altitude, satellite et repli cartographique.
- `src/destinations.js` : catalogue local et recherche par coordonnées.
- `tests/flight-model.test.mjs` : tests unitaires exécutables avec Node.js.
- `.github/workflows/pages.yml` : validation et déploiement GitHub Pages.

## Contraintes

- Aucune clé API ni donnée personnelle.
- Aucun framework ou processus de build obligatoire.
- Les tuiles OpenStreetMap ne sont chargées qu'à l'exécution et avec attribution visible.
- La simulation reste utilisable si les tuiles réseau ne se chargent pas.
- Les préférences et statistiques restent uniquement dans `localStorage`.

## Critères d'acceptation

1. Le site s'ouvre sans erreur JavaScript depuis GitHub Pages.
2. Le joueur peut choisir une destination puis démarrer un vol en moins de trois actions.
3. Les flèches pilotent tangage et roulis ; `W` et `S` règlent la puissance.
4. La position, le cap, la vitesse, l'altitude et le carburant évoluent pendant le vol.
5. L'avion peut décoller, voler, activer le pilote automatique puis atterrir ou se crasher.
6. Pause, changement de caméra et masquage du HUD fonctionnent au clavier et via l'interface.
7. Les commandes tactiles apparaissent sur écran tactile ou petite largeur.
8. Les statistiques de vol persistent après rechargement de la page.
9. Le rendu conserve une solution de repli utilisable sans tuiles cartographiques.
10. Les tests unitaires du modèle de vol passent avec `node --test`.
11. La livraison initiale est séparée en trois commits : spécifications, application, publication Pages ; les améliorations ultérieures restent isolées dans leurs propres commits.
12. Le workflow GitHub Pages publie automatiquement `main` après validation des tests.
13. Le joueur peut sélectionner trois appareils et constater des vitesses maximales distinctes jusqu'à 480 kt.
14. À l'arrêt ou au roulage, le terrain ne relance pas de fondu de tuiles à chaque mise à jour de caméra.
15. Le relief lointain reste lisible grâce à une caméra basse altitude plus large et un horizon moins brumeux.
16. La vue poursuite utilise un modèle 3D complet ; le train compte trois roues et se rétracte en vol sur les appareils rapides.

## Hors périmètre du MVP

- Cockpit 3D détaillé, trafic multijoueur et météo réelle.
- Modèle aérodynamique certifié, procédures IFR et avionique complète.
- Recherche géographique distante et photogrammétrie urbaine.
- Comptes utilisateurs, backend et synchronisation cloud.

## Définition de terminé

Le MVP est terminé lorsque les douze critères d'acceptation sont vérifiés, que le workflow Pages est vert et que l'URL publique permet de lancer un vol sans configuration.
