# CoBot-Cell · simulateur 3D (équipe 605)

Animation de concept de la cellule de chargement robotisée de CNC-04, réalisée pour le pitch du projet CoBot-Cell.

**Page en ligne :** https://gabrielgorithme.github.io/CoBot-Cell-Simulator/

Le fichier `index.html` est autonome : il s'ouvre aussi directement depuis le disque, sans connexion.

## Ce que montre le simulateur

- Trois scénarios : aujourd'hui (chargement à la main), pince simple, pince double.
- L'échange de pièce dans l'étau, piloté par le modèle de temps du dossier (7,1 s en pince double, 14,5 s en pince simple, 12 s à la main).
- Le scanner laser, les champs de sécurité calculés selon ISO 13855 (S = 1600·T + 1180 mm) et l'arrêt de protection quand une personne entre dans le champ.
- Les exigences du dossier, comparées scénario par scénario.

## Utilisation

- La visite guidée (en haut à gauche) déroule les dix étapes.
- Le bouton « Options » de la même carte ouvre les accès directs : scénario (aujourd'hui, pince simple, pince double), une personne approche, arrêt d'urgence (MODE-05), réarmement, vues, comparaison, recommencer. Un choix qui sort de la visite l'indique, et « Reprendre la visite » y revient.
- En bas de l'écran, au survol : la timeline (cliquer ou glisser pour avancer et reculer), les curseurs et les objectifs.
- La souris fait tourner et zoomer la vue.

## Ce que ce n'est pas

C'est une animation de concept, pas un jumeau numérique ni un programme robot validé.

- Les chiffres affichés viennent du dossier de l'équipe ; les formules sont dans `src/model.js`.
- La géométrie de CNC-04, le temps d'arrêt T et la vitesse réduite (0,25 m/s) sont des hypothèses.
- Le découpage des 12 s de l'échange manuel en gestes est illustratif.
- Les poses du bras sont calculées par cinématique inverse à l'intérieur de chaque étape minutée ; les durées, elles, viennent du modèle.

## Reconstruire

```
npm install
npm run build     # produit index.html
npm run reach     # vérifie que le bras atteint toutes les poses du cycle
```

`tools/dae2glb.py` a servi à convertir les maillages du bras ; `tools/shot.py` sert aux captures de contrôle.

## Sources et licences

- Bras UR16e : maillages et paramètres cinématiques de [Universal_Robots_ROS2_Description](https://github.com/UniversalRobots/Universal_Robots_ROS2_Description), licence BSD-3-Clause (texte dans `licenses/`). Le UR16e est le candidat documenté dans le dossier, pas un achat.
- three.js (MIT), polices IBM Plex (SIL OFL 1.1).

## Équipe 605 (ESILV)

- [Lilian Jaouen](https://www.linkedin.com/in/lilian-jaouen)
- [Othman Kharroubi](https://www.linkedin.com/in/othman-k-7ab775295)
- [Nicolas Le Bris](https://www.linkedin.com/in/nicolas-le-bris-3302a22ab)
- [Arsene Maitre](https://www.linkedin.com/in/arsene-maitre)
- [Timothée Mariotte](https://www.linkedin.com/in/timothee-mariotte)
- [Youssouf Yiagnigni Touondounko](https://www.linkedin.com/in/youssouf-yiagnigni-touondounko-81490329b)
- [Gabriel Ghanem](https://www.linkedin.com/in/gabriel-ghanem-02528a208)
