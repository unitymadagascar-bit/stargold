# Star Gold By TSR MT5 Bridge

Ce bridge synchronise Star Gold By TSR avec le flux exact de ton MetaTrader 5 via un relais cloud persistant.

```text
MT5 TradeTSRBridge -> local Windows relay or Vercel ingest API -> Supabase relay -> Vercel app
```

## Installation

1. Dans MT5, ouvre `File > Open Data Folder`.
2. Copie `TradeTSRBridge.mq5` dans `MQL5/Experts/`.
3. Ouvre-le dans MetaEditor et compile-le, ou redemarre MT5 pour reconstruire le `.ex5`.
4. Clique droit dans `Navigator > Expert Advisors > Refresh`.
5. Va dans `Tools > Options > Expert Advisors`.
6. Active `Allow WebRequest for listed URL`.
7. Ajoute cette URL :

```text
https://stargold-chi.vercel.app
```

8. Attache `TradeTSRBridge` au graphique `XAUUSD`.
9. Active `Algo Trading`.
10. Ouvre l'application :

```text
https://stargold-chi.vercel.app
```

## Mode local optionnel

Le bridge peut toujours envoyer vers le serveur local pendant le developpement si tu lances :

```text
http://127.0.0.1:3000
```

Mais la production ne depend plus de localhost.
Si ton graphique MT5 garde encore l'ancien `InpEndpoint=http://127.0.0.1:3000/api/market/mt5/ingest`, lance `scripts/start-star-gold-relay.bat`. Le relais local forwarde automatiquement vers Vercel/Supabase.

## Resultat attendu

L'application doit afficher `MT5 connecte` quand MT5 pousse ses donnees. Si MT5 demarre plus lentement, Vercel affiche un flux externe clairement marque `Fallback, not live MT5` en attendant le premier tick MT5.

La version 1.12 du bridge fait un ping au demarrage et tente un fallback GET pour les ticks si le POST JSON echoue. Dans MT5, regarde l'onglet `Experts` :

- `Star Gold By TSR bridge ping OK` signifie que MT5 atteint Vercel ;
- `WebRequest failed` signifie que l'URL n'est pas autorisee ou que MT5 bloque l'appel ;
- `HTTP error` signifie que Vercel a repondu avec une erreur lisible.

## Important pour Vercel

Pour eviter que le statut MT5 disparaisse quand Vercel change d'instance serverless, Star Gold By TSR utilise Supabase comme relais cloud si ces variables sont configurees dans Vercel :

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
POSTGRES_URL
SUPABASE_MT5_TICK_TABLE=mt5_ticks
SUPABASE_MT5_HISTORY_TABLE=mt5_candles
SUPABASE_MT5_TICK_ID=xauusd
```

Redis Upstash reste supporte comme stockage optionnel secondaire. Sans Supabase ou Redis, le bridge peut repondre temporairement, mais le statut peut redevenir `MT5 non connecte` parce que Vercel ne partage pas la memoire entre toutes les fonctions.

Le statut passe a `MT5 non connecte` si aucun tick MT5 n'arrive pendant plus de 10 secondes.

Si l'application affiche encore `MT5 non connecte`, verifie :

- l'URL WebRequest `https://stargold-chi.vercel.app` autorisee dans MT5 ;
- le bouton `Algo Trading` ;
- l'onglet `Experts` dans MT5 pour les erreurs WebRequest ;
- que l'Expert Advisor utilise bien l'endpoint `https://stargold-chi.vercel.app/api/market/mt5/ingest` ;
- la page diagnostic `https://stargold-chi.vercel.app/settings/mt5-connection` pour verifier le symbole broker, le dernier tick et la source active.

## Demarrage Windows

Utilise les scripts dans `scripts/` :

```bat
scripts\install-star-gold-mt5-startup.bat
```

Sauvegarde ton profil MT5 avec le graphique XAUUSD et `TradeTSRBridge` attache. Apres redemarrage, Windows ouvre MT5 et le relais local, puis l'EA reconnecte automatiquement le flux quand `Algo Trading` est actif.
