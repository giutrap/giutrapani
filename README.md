# Aggregatore News RSS

Web app che aggrega in un'unica pagina i feed RSS delle principali agenzie di stampa
e testate giornalistiche (italiane e internazionali), con filtri per categoria/fonte,
ricerca testuale e aggiornamento automatico.

## Funzionalità

- Recupero e unione di più feed RSS lato server (con `rss-parser`), ordinati per data.
- Cache in memoria (5 minuti) per evitare di interrogare le fonti ad ogni richiesta.
- Le fonti irraggiungibili vengono ignorate senza far fallire l'intera aggregazione.
- Filtro per categoria (Italia, Mondo, Economia, Tecnologia, Sport), per singola fonte e per priorità del lancio.
- Ricerca testuale su titolo e riassunto.
- Ordine cronologico (più recenti in alto).
- **Lanci con crocette e colori**, sul modello delle agenzie di stampa: ogni articolo viene classificato in automatico in base a parole chiave nel titolo/riassunto e mostrato con un badge colorato:
  - 🟢 `+` rilievo superiore alla media
  - 🟡 `++` notizia molto importante
  - 🔴 `+++` massima priorità (es. morte di un personaggio di rilievo, attentato grave, dimissioni del governo)
  - la classificazione è definita in `server/priority.js`; le fonti RSS pubbliche non trasportano il flag di priorità interno delle redazioni, quindi il livello è una stima automatica, non il segnale ufficiale dell'agenzia.
- Segnale acustico opzionale (checkbox "🔊") quando arriva un nuovo lancio `+++` durante l'aggiornamento automatico.
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
  index.js    # server Express + endpoint API (/api/feeds, /api/sources)
  feeds.js    # elenco delle fonti RSS aggregate
  priority.js # classificazione dei lanci (+, ++, +++) da parole chiave
public/
  index.html # markup della pagina
  style.css  # stile (tema chiaro/scuro, colori dei lanci)
  app.js     # logica frontend (fetch, filtri, rendering, segnale acustico)
```
