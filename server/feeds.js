// Elenco delle fonti RSS aggregate. Aggiungi/rimuovi voci qui per personalizzare l'app.
// Ogni fonte ha: name (nome visualizzato), url (feed RSS), category (etichetta di filtro).

const FEEDS = [
  // --- Agenzie di stampa e news italiane ---
  { name: 'ANSA', url: 'https://www.ansa.it/sito/ansait_rss.xml', category: 'Italia' },
  { name: 'AGI', url: 'https://www.agi.it/rss', category: 'Italia' },
  { name: 'Adnkronos', url: 'https://www.adnkronos.com/RSS_Adnkronos_Ultimora.xml', category: 'Italia' },
  { name: 'Rai News', url: 'https://www.rainews.it/rss/tutti', category: 'Italia' },
  { name: 'Il Fatto Quotidiano', url: 'https://www.ilfattoquotidiano.it/feed/', category: 'Italia' },
  { name: 'La Repubblica', url: 'https://www.repubblica.it/rss/homepage/rss2.0.xml', category: 'Italia' },
  { name: 'Corriere della Sera', url: 'https://xml2.corriereobjects.it/rss/homepage.xml', category: 'Italia' },

  // --- Economia ---
  { name: 'Il Sole 24 Ore', url: 'https://www.ilsole24ore.com/rss/italia--attualita.xml', category: 'Economia' },
  { name: 'Reuters Business', url: 'https://feeds.reuters.com/reuters/businessNews', category: 'Economia' },

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
];

module.exports = { FEEDS };
