# Aggregatore News RSS

Web app che aggrega in un'unica pagina i feed RSS delle principali agenzie di stampa
e testate giornalistiche (italiane e internazionali), con filtri per categoria/fonte,
ricerca testuale e aggiornamento automatico.

## Funzionalità

- Recupero e unione di più feed RSS lato server (con `rss-parser`), ordinati per data.
- Cache in memoria (5 minuti) per evitare di interrogare le fonti ad ogni richiesta.
- Le fonti irraggiungibili vengono ignorate senza far fallire l'intera aggregazione.
- Filtro per categoria (Italia, Mondo, Economia, Tecnologia, Sport) e per singola fonte.
- Ricerca testuale su titolo e riassunto.
- Aggiornamento manuale ("Aggiorna") e automatico ogni 5 minuti.
- Tema chiaro/scuro con preferenza salvata nel browser.

## Avvio

```bash
npm install
npm start
```

L'app sarà disponibile su http://localhost:3000 (porta configurabile con la variabile
d'ambiente `PORT`).

## Aggiungere o modificare le fonti

Le fonti RSS sono definite in `server/feeds.js`. Ogni voce ha la forma:

```js
{ name: 'Nome fonte', url: 'https://esempio.com/rss.xml', category: 'Italia' }
```

Aggiungi, rimuovi o modifica le voci dell'array `FEEDS` per personalizzare l'elenco.
Le categorie e le fonti disponibili nei filtri vengono generate automaticamente da
questo elenco.

## Struttura del progetto

```
server/
  index.js   # server Express + endpoint API (/api/feeds, /api/sources)
  feeds.js   # elenco delle fonti RSS aggregate
public/
  index.html # markup della pagina
  style.css  # stile (tema chiaro/scuro)
  app.js     # logica frontend (fetch, filtri, rendering)
```
