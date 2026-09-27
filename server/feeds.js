// Elenco delle fonti RSS aggregate. Aggiungi/rimuovi voci qui per personalizzare l'app.
// Ogni fonte ha: name (nome visualizzato), url (feed RSS), category (etichetta di filtro).
// Per ogni testata sono incluse più sezioni (non solo l'homepage/"prima pagina"),
// così l'aggregazione copre più notizie. Le fonti irraggiungibili vengono ignorate
// automaticamente: se qualche URL qui sotto non fosse più valido, il resto continua
// a funzionare (vedi la sezione "Fonti non raggiungibili" nell'interfaccia).

const FEEDS = [
  // --- ANSA ---
  { name: 'ANSA - Homepage', url: 'https://www.ansa.it/sito/ansait_rss.xml', category: 'Italia' },
  { name: 'ANSA - Politica', url: 'https://www.ansa.it/sito/notizie/politica/politica_rss.xml', category: 'Italia' },
  { name: 'ANSA - Cronaca', url: 'https://www.ansa.it/sito/notizie/cronaca/cronaca_rss.xml', category: 'Italia' },
  { name: 'ANSA - Mondo', url: 'https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml', category: 'Mondo' },
  { name: 'ANSA - Economia', url: 'https://www.ansa.it/sito/notizie/economia/economia_rss.xml', category: 'Economia' },
  { name: 'ANSA - Tecnologia', url: 'https://www.ansa.it/sito/notizie/tecnologia/tecnologia_rss.xml', category: 'Tecnologia' },
  { name: 'ANSA - Sport', url: 'https://www.ansa.it/sito/notizie/sport/sport_rss.xml', category: 'Sport' },

  // --- Altre agenzie/testate italiane ---
  { name: 'AGI', url: 'https://www.agi.it/rss', category: 'Italia' },
  { name: 'Adnkronos - Ultimora', url: 'https://www.adnkronos.com/RSS_Adnkronos_Ultimora.xml', category: 'Italia', isFlash: true },
  { name: 'Rai News', url: 'https://www.rainews.it/rss/tutti', category: 'Italia' },
  { name: 'La Stampa', url: 'https://www.lastampa.it/rss.xml', category: 'Italia' },
  { name: 'Sky TG24', url: 'https://tg24.sky.it/rss/tg24.xml', category: 'Italia' },
  { name: 'Il Messaggero', url: 'https://www.ilmessaggero.it/rss/home.xml', category: 'Italia' },

  // --- Il Fatto Quotidiano ---
  { name: 'Il Fatto Quotidiano - Homepage', url: 'https://www.ilfattoquotidiano.it/feed/', category: 'Italia' },
  { name: 'Il Fatto Quotidiano - Politica', url: 'https://www.ilfattoquotidiano.it/politica-palazzo/feed/', category: 'Italia' },
  { name: 'Il Fatto Quotidiano - Economia', url: 'https://www.ilfattoquotidiano.it/economia-e-lobby/feed/', category: 'Economia' },
  { name: 'Il Fatto Quotidiano - Esteri', url: 'https://www.ilfattoquotidiano.it/esteri/feed/', category: 'Mondo' },

  // --- La Repubblica ---
  { name: 'La Repubblica - Homepage', url: 'https://www.repubblica.it/rss/homepage/rss2.0.xml', category: 'Italia' },
  { name: 'La Repubblica - Politica', url: 'https://www.repubblica.it/rss/politica/rss2.0.xml', category: 'Italia' },
  { name: 'La Repubblica - Cronaca', url: 'https://www.repubblica.it/rss/cronaca/rss2.0.xml', category: 'Italia' },
  { name: 'La Repubblica - Esteri', url: 'https://www.repubblica.it/rss/esteri/rss2.0.xml', category: 'Mondo' },
  { name: 'La Repubblica - Economia', url: 'https://www.repubblica.it/rss/economia/rss2.0.xml', category: 'Economia' },
  { name: 'La Repubblica - Tecnologia', url: 'https://www.repubblica.it/rss/tecnologia/rss2.0.xml', category: 'Tecnologia' },
  { name: 'La Repubblica - Sport', url: 'https://www.repubblica.it/rss/sport/rss2.0.xml', category: 'Sport' },

  // --- Corriere della Sera ---
  { name: 'Corriere della Sera - Homepage', url: 'https://xml2.corriereobjects.it/rss/homepage.xml', category: 'Italia' },
  { name: 'Corriere della Sera - Politica', url: 'https://xml2.corriereobjects.it/rss/politica.xml', category: 'Italia' },
  { name: 'Corriere della Sera - Esteri', url: 'https://xml2.corriereobjects.it/rss/esteri.xml', category: 'Mondo' },
  { name: 'Corriere della Sera - Economia', url: 'https://xml2.corriereobjects.it/rss/economia.xml', category: 'Economia' },

  // --- Economia ---
  { name: 'Il Sole 24 Ore', url: 'https://www.ilsole24ore.com/rss/italia--attualita.xml', category: 'Economia' },

  // --- Tecnologia ---
  { name: 'Wired Italia', url: 'https://www.wired.it/feed/rss', category: 'Tecnologia' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'Tecnologia' },

  // --- Sport ---
  { name: 'Gazzetta dello Sport', url: 'https://www.gazzetta.it/rss/home.xml', category: 'Sport' },

  // --- Mondo / internazionali ---
  { name: 'BBC World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml', category: 'Mondo' },
  { name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss', category: 'Mondo' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'Mondo' },
  { name: 'NYT World', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', category: 'Mondo' },
  { name: 'Euronews (IT)', url: 'https://it.euronews.com/rss?level=theme&name=news', category: 'Mondo' },
  { name: 'France 24 (EN)', url: 'https://www.france24.com/en/rss', category: 'Mondo' },
  { name: 'Deutsche Welle (EN)', url: 'https://rss.dw.com/rdf/rss-en-all', category: 'Mondo' },
  { name: 'El País (ES)', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', category: 'Mondo' },
];

module.exports = { FEEDS };
