# Breaking News – Giù Trapani
## Scheda di continuità del progetto

Ultimo aggiornamento: 4 novembre 2026.

### Repository e pubblicazione
- Repository: https://github.com/giutrap/giutrapani
- Branch di lavoro e deploy: `claude/rss-news-aggregator-dosocy`
- Sito: https://breakingnewsgiutrapani.onrender.com/
- Servizio Render: `breakingnewsgiutrapani`
- Service ID: `srv-dbiabgafngtc73codjeg`
- Dashboard deploy: https://dashboard.render.com/web/srv-dbiabgafngtc73codjeg/deploys
- Deploy automatico: attivo (`autoDeploy=yes`).
- Runtime: Node.js / Express; build `npm install`, start `npm start`.
- Piano Render rilevato: Free; regione Oregon.
- Ultimo deploy confermato LIVE: commit `c0004c4f01166188d874ed6bdc81cc33b0f55475`, messaggio “Exclude future-dated RSS articles from newsroom”, deploy `dep-dblg76mgekts738av97g`, 4 novembre 2026.
- Branch aggiornato successivamente? Verificare sempre GitHub e Render prima di modificare o dichiarare una release.

### Identità e interfaccia
- Nome: **Breaking**, sottotitolo “a cura di @giutrapani”.
- Stile: fondo bianco, tipografia Economica, titoli neri, accenti rossi e verdi; interfaccia compatta e leggibile.
- Aggiornamento automatico del flusso ogni minuto.
- Desktop: sotto la testata, player YouTube a sinistra e pannello “TREND NEWS OGGI” a destra.
- Mobile: player sopra i trend.
- Nel pannello Trend sono visualizzate quattro parole chiave verticali; ogni box mostra indice, tag, numero di notizie e fonti, e filtra il flusso al clic.

### Funzioni implementate
1. **Aggregatore RSS**: fonti di agenzie, quotidiani, testate italiane e internazionali, con gestione degli errori per fonte. Il dettaglio delle fonti è in `server/feeds.js`.
2. **Flusso notizie**: aggiornamento ogni 60 secondi; ordinamento editoriale con post X, Il Riformista e contenuti FOCUS prioritari, quindi le altre notizie in ordine cronologico.
3. **Filtro per parole chiave**: quattro temi selezionati automaticamente da un repertorio di argomenti in `public/app.js`; il clic filtra le notizie corrispondenti.
4. **Esclusione date future**: gli articoli con data futura oltre due ore rispetto all'orario corrente sono esclusi sia dal flusso sia dai Trend.
5. **X**: prova più endpoint RSS; visualizza il post più recente e conserva l'ultimo post ricevuto nella tabella PostgreSQL `x_feed_cache` se le fonti temporaneamente non rispondono. La disponibilità dei feed X esterni non è garantita.
6. **YouTube LIVE**: player sotto la testata, gestibile dalla Redazione; URL YouTube validato e ID video salvato nella tabella `live_settings`.
7. **Area Redazione**: autenticazione Basic con variabili d'ambiente `REDAZIONE_USER` e `REDAZIONE_PASSWORD`; archivio di note editoriali, link, appunti e gestione della diretta.
8. **Contenuti editoriali**: archivio PostgreSQL `editorial_notes`, con contenuti pubblicabili e consultabili dal sito.
9. **Diagnostica RSS**: endpoint backend `/api/diagnostics/feeds`; non esporre pulsanti diagnostici nell'interfaccia pubblica.

### Architettura e dati
- Server: `server/index.js`.
- Fonti: `server/feeds.js`.
- Frontend: `public/index.html`, `public/app.js`, `public/style.css`.
- Dipendenze principali: Express, rss-parser, pg.
- PostgreSQL viene usato quando è configurata `DATABASE_URL`.
- Tabelle attuali: `editorial_notes`, `live_settings`, `x_feed_cache`.
- Non inserire mai nel repository credenziali o segreti; usare le variabili d'ambiente Render.
- Il filesystem del servizio Render Free non deve essere considerato archivio permanente per file caricati: i nuovi upload richiedono storage persistente esterno o un disco persistente compatibile con il piano.

### Podcast Spreaker
- Integrato un solo episodio Spreaker attivo alla volta; la Redazione può pubblicare/sostituire il link o ritirarlo.
- Il player viene mostrato subito sotto la testata e prima della griglia YouTube LIVE + Trend News.
- Nessun file MP3 viene caricato sul servizio: l'audio resta ospitato da Spreaker e viene riprodotto tramite iframe.
- Tabella PostgreSQL `podcast_settings`; la prima inizializzazione inserisce come episodio di prova l'ID `76168692`.
- Endpoint pubblico `GET /api/podcast`; endpoint autenticati `GET/PUT /api/redazione/podcast`.
- Il backend accetta solo link `spreaker.com` con ID episodio nel formato `--ID`; i parametri di tracking vengono ignorati.

Disegno funzionale suggerito:
- Form Redazione con file picker MP3, titolo, breve descrizione e pulsanti pubblica / disattiva / sostituisci / elimina.
- Player HTML5 audio con controlli nativi (play, pausa, avanzamento, volume); nessun autoplay.
- Una scheda podcast pubblica con titolo e descrizione, posizionabile sotto il blocco LIVE + Trend o in una sezione dedicata più in basso.
- PostgreSQL conserva metadati e stato di pubblicazione; il file audio va in storage persistente (non nel filesystem effimero del servizio).
- Validare estensione, MIME type, dimensione massima e nome file; accesso di upload protetto da `requireRedazione`.
- Prevedere un solo podcast attivo in homepage inizialmente; in seguito si potrà introdurre un archivio di episodi.

Prima di implementare il podcast, definire la collocazione pubblica del player e scegliere lo storage persistente compatibile con i costi desiderati. Non esporre né richiedere le credenziali in chat.

### Regole operative per le prossime modifiche
- Prima di intervenire, leggere la versione corrente dei file dal branch indicato; non basarsi su copie vecchie.
- Fare modifiche mirate e controllare il codice prima del commit.
- Non dichiarare una funzione online finché Render non mostra il commit come `live`.
- Con auto-deploy attivo, non lanciare deploy manuali salvo richiesta esplicita e necessità verificata.
- Dopo ogni deploy, verificare stato e log Render; la navigazione web pubblica del sito può non essere disponibile agli strumenti.
- Preservare le funzioni esistenti: RSS, trend cliccabili, YouTube LIVE, area Redazione, note editoriali e cache X.
