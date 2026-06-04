# Star Gold By TSR MT5 Bridge

Ce bridge synchronise Star Gold By TSR avec le flux exact de ton MetaTrader 5 via un relais cloud persistant.

```text
MT5 TradeTSRBridge -> Vercel ingest API -> Supabase relay -> Vercel app
```

## Installation

1. Dans MT5, ouvre `File > Open Data Folder`.
2. Copie `TradeTSRBridge.mq5` dans `MQL5/Experts/`.
3. Redemarre MT5 ou clique droit dans `Navigator > Expert Advisors > Refresh`.
4. Va dans `Tools > Options > Expert Advisors`.
5. Active `Allow WebRequest for listed URL`.
6. Ajoute ces URLs :

```text
https://tradetsr.vercel.app
```

7. Attache `TradeTSRBridge` au graphique `XAUUSD`.
8. Active `Algo Trading`.
9. Ouvre l'application :

```text
https://tradetsr.vercel.app
```

## Mode local optionnel

Le bridge peut toujours envoyer vers le serveur local pendant le developpement si tu lances :

```text
http://127.0.0.1:3000
```

Mais la production ne depend plus de localhost.

## Resultat attendu

L'application doit afficher `MT5 connecte` quand MT5 pousse ses donnees. Si MT5 demarre plus lentement, Vercel affiche un flux externe clairement marque `Fallback, not live MT5` en attendant le premier tick MT5.

## Important pour Vercel

Pour eviter que le statut MT5 disparaisse quand Vercel change d'instance serverless, Star Gold By TSR utilise Supabase comme relais cloud si ces variables sont configurees dans Vercel :

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_MT5_TICK_TABLE=mt5_ticks
SUPABASE_MT5_HISTORY_TABLE=mt5_candles
SUPABASE_MT5_TICK_ID=xauusd
```

Redis Upstash reste supporte comme stockage optionnel secondaire. Sans Supabase ou Redis, le bridge peut repondre temporairement, mais le statut peut redevenir `MT5 non connecte` parce que Vercel ne partage pas la memoire entre toutes les fonctions.

Le statut passe a `MT5 non connecte` si aucun tick MT5 n'arrive pendant plus de 10 secondes.

Si l'application affiche encore `MT5 non connecte`, verifie :

- l'URL WebRequest `https://tradetsr.vercel.app` autorisee dans MT5 ;
- le bouton `Algo Trading` ;
- l'onglet `Experts` dans MT5 pour les erreurs WebRequest ;
- que l'Expert Advisor utilise bien l'endpoint `https://tradetsr.vercel.app/api/market/mt5/ingest`.

## Demarrage Windows

Utilise les scripts dans `scripts/` :

```bat
scripts\install-star-gold-mt5-startup.bat
```

Sauvegarde ton profil MT5 avec le graphique XAUUSD et `TradeTSRBridge` attache. Apres redemarrage, Windows ouvre MT5, puis l'EA reconnecte automatiquement le flux quand `Algo Trading` est actif.
