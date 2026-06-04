# Star Gold By TSR MT5 Bridge

Ce bridge synchronise Star Gold By TSR avec le flux exact de ton MetaTrader 5, directement vers l'application Vercel.

## Installation

1. Dans MT5, ouvre `File > Open Data Folder`.
2. Copie `TradeTSRBridge.mq5` dans `MQL5/Experts/`.
3. Redemarre MT5 ou clique droit dans `Navigator > Expert Advisors > Refresh`.
4. Va dans `Tools > Options > Expert Advisors`.
5. Active `Allow WebRequest for listed URL`.
6. Ajoute ces URLs :

```text
https://tradetsr.vercel.app
http://127.0.0.1:3000
```

7. Attache `TradeTSRBridge` au graphique `XAUUSD`.
8. Active `Algo Trading`.
9. Ouvre l'application :

```text
https://tradetsr.vercel.app
```

## Mode local optionnel

Le bridge peut toujours envoyer vers le serveur local si tu lances :

```text
http://127.0.0.1:3000
```

Mais ce n'est plus obligatoire pour utiliser l'application Vercel.

## Resultat attendu

L'application doit afficher `Flux reel MT5 actif` quand MT5 pousse ses donnees. Si MT5 demarre plus lentement, Vercel affiche un flux marche externe en attendant le premier snapshot MT5.

## Important pour Vercel

Pour eviter que le statut MT5 disparaisse quand Vercel change d'instance serverless, Star Gold By TSR utilise un stockage Redis Upstash si ces variables sont configurees dans Vercel :

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Sans ces variables, le bridge peut repondre temporairement, mais le statut peut redevenir `MT5 non connecte` parce que Vercel ne partage pas la memoire entre toutes les fonctions.

Si l'application affiche encore `MT5 non connecte`, verifie :

- l'URL WebRequest `https://tradetsr.vercel.app` autorisee dans MT5 ;
- le bouton `Algo Trading` ;
- l'onglet `Experts` dans MT5 pour les erreurs WebRequest ;
- que l'Expert Advisor utilise bien l'endpoint `https://tradetsr.vercel.app/api/market/mt5/ingest`.
