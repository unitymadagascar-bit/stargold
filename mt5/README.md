# TradeTSR MT5 Bridge

Ce bridge synchronise l'application TradeTSR avec le flux exact de ton MetaTrader 5.

## Installation

1. Dans MT5, ouvre `File > Open Data Folder`.
2. Copie `TradeTSRBridge.mq5` dans `MQL5/Experts/`.
3. Redemarre MT5 ou clique droit dans `Navigator > Expert Advisors > Refresh`.
4. Va dans `Tools > Options > Expert Advisors`.
5. Active `Allow WebRequest for listed URL`.
6. Ajoute cette URL :

```text
http://127.0.0.1:3000
```

7. Lance l'application en local sur le port 3000.
8. Attache `TradeTSRBridge` au graphique `XAUUSD`.
9. Active `Algo Trading`.

## Resultat attendu

L'application doit afficher `Flux reel MT5 actif` et les prix doivent correspondre au bid/ask de ton broker MT5.

Si l'application affiche `MT5 non connecte`, verifie :

- l'URL WebRequest autorisee dans MT5 ;
- le bouton `Algo Trading` ;
- le port local `http://127.0.0.1:3000` ;
- l'onglet `Experts` dans MT5 pour les erreurs WebRequest.
