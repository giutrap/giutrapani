// Elenco delle fonti RSS aggregate.
// Preferire feed ufficiali; per le testate senza RSS pubblico si usano feed alternativi
// limitati al dominio della testata. Le fonti non raggiungibili vengono segnalate separatamente.

const FEEDS = [
  // --- Agenzie e servizio pubblico ---
  { name: 'ANSA - Homepage', url: 'https://www.ansa.it/sito/ansait_rss.xml', category: 'Italia' },
  { name: 'ANSA - Politica', url: 'https://www.ansa.it/sito/notizie/politica/politica_rss.xml', category: 'Italia' },
  { name: 'ANSA - Cronaca', url: 'https://www.ansa.it/sito/notizie/cronaca/cronaca_rss.xml', category: 'Italia' },
  { name: 'ANSA - Mondo', url: 'https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml', category: 'Mondo' },
  { name: 'ANSA - Economia', url: 'https://www.ansa.it/sito/notizie/economia/economia_rss.xml', category: 'Economia' },
  { name: 'ANSA - Tecnologia', url: 'https://www.ansa.it/sito/notizie/tecnologia/tecnologia_rss.xml', category: 'Tecnologia' },
  { name: 'ANSA - Sport', url: 'https://www.ansa.it/sito/notizie/sport/sport_rss.xml', category: 'Sport' },
  { name: 'AGI', url: 'https://www.agi.it/rss.xml', category: 'Italia' },
  { name: 'Adnkronos', url: 'https://www.adnkronos.com/RSS_PrimaPagina.xml', category: 'Italia' },
  { name: 'Rai News', url: 'https://www.rainews.it/rss/tutti', category: 'Italia' },
  { name: 'Governo Italiano', url: 'https://www.governo.it/it/rss.xml', category: 'Istituzioni' },

  // --- Quotidiani italiani ---
  { name: 'Corriere della Sera - Homepage', url: 'https://xml2.corriereobjects.it/rss/homepage.xml', category: 'Italia' },
  { name: 'Corriere della Sera - Politica', url: 'https://xml2.corriereobjects.it/rss/politica.xml', category: 'Italia' },
  { name: 'Corriere della Sera - Esteri', url: 'https://xml2.corriereobjects.it/rss/esteri.xml', category: 'Mondo' },
  { name: 'Corriere della Sera - Economia', url: 'https://xml2.corriereobjects.it/rss/economia.xml', category: 'Economia' },
  { name: 'Corriere della Sera - Sport', url: 'https://xml2.corriereobjects.it/rss/sport.xml', category: 'Sport' },
  { name: 'la Repubblica - Homepage', url: 'https://www.repubblica.it/rss/homepage/rss2.0.xml', category: 'Italia' },
  { name: 'la Repubblica - Politica', url: 'https://www.repubblica.it/rss/politica/rss2.0.xml', category: 'Italia' },
  { name: 'la Repubblica - Cronaca', url: 'https://www.repubblica.it/rss/cronaca/rss2.0.xml', category: 'Italia' },
  { name: 'la Repubblica - Esteri', url: 'https://www.repubblica.it/rss/esteri/rss2.0.xml', category: 'Mondo' },
  { name: 'la Repubblica - Economia', url: 'https://www.repubblica.it/rss/economia/rss2.0.xml', category: 'Economia' },
  { name: 'la Repubblica - Tecnologia', url: 'https://www.repubblica.it/rss/tecnologia/rss2.0.xml', category: 'Tecnologia' },
  { name: 'la Repubblica - Sport', url: 'https://www.repubblica.it/rss/sport/rss2.0.xml', category: 'Sport' },
  { name: 'La Stampa', url: 'https://news.google.com/rss/search?q=site%3Alastampa.it&hl=it&gl=IT&ceid=IT%3Ait', category: 'Italia' },
  { name: 'Il Messaggero', url: 'https://www.ilmessaggero.it/rss/home.xml', category: 'Italia' },
  { name: 'Il Giornale', url: 'https://www.ilgiornale.it/rss.xml', category: 'Italia' },
  { name: 'Il Foglio - Ultime notizie', url: 'https://naxos.ilfoglio.it/api/v5/rss/stories/latest', category: 'Italia' },
  { name: 'Il Foglio - Politica', url: 'https://naxos.ilfoglio.it/api/v5/rss/stories/politica', category: 'Italia' },
  { name: 'Il Foglio - Esteri', url: 'https://naxos.ilfoglio.it/api/v5/rss/stories/esteri', category: 'Mondo' },
  { name: 'Il Foglio - Economia', url: 'https://naxos.ilfoglio.it/api/v5/rss/stories/economia', category: 'Economia' },
  { name: 'Il Fatto Quotidiano - Homepage', url: 'https://www.ilfattoquotidiano.it/feed/', category: 'Italia' },
  { name: 'Il Fatto Quotidiano - Politica', url: 'https://www.ilfattoquotidiano.it/politica-palazzo/feed/', category: 'Italia' },
  { name: 'Il Fatto Quotidiano - Economia', url: 'https://www.ilfattoquotidiano.it/economia-e-lobby/feed/', category: 'Economia' },
  { name: 'Il Fatto Quotidiano - Esteri', url: 'https://www.ilfattoquotidiano.it/esteri/feed/', category: 'Mondo' },
  { name: 'Il Sole 24 Ore - Italia', url: 'https://www.ilsole24ore.com/rss/italia.xml', category: 'Italia' },
  { name: 'Il Sole 24 Ore - Economia', url: 'https://www.ilsole24ore.com/rss/economia.xml', category: 'Economia' },
  { name: 'Il Sole 24 Ore - Mondo', url: 'https://www.ilsole24ore.com/rss/mondo.xml', category: 'Mondo' },
  { name: 'Il Sole 24 Ore - Finanza', url: 'https://www.ilsole24ore.com/rss/finanza.xml', category: 'Economia' },
  { name: 'Il Sole 24 Ore - Tecnologia', url: 'https://www.ilsole24ore.com/rss/tecnologia.xml', category: 'Tecnologia' },
  { name: 'Avvenire', url: 'https://www.avvenire.it/rss', category: 'Italia' },
  { name: 'Domani', url: 'https://www.editorialedomani.it/rss', category: 'Italia' },
  { name: 'Libero Quotidiano', url: 'https://www.liberoquotidiano.it/rss.xml', category: 'Italia' },
  { name: 'Il Riformista', url: 'https://www.ilriformista.it/feed/', category: 'Italia' },
  { name: 'Open', url: 'https://www.open.online/feed/', category: 'Italia' },
  { name: 'Il Post', url: 'https://www.ilpost.it/feed/', category: 'Italia' },
  { name: 'Fanpage.it', url: 'https://www.fanpage.it/feed/', category: 'Italia' },
  { name: 'TGcom24', url: 'https://www.tgcom24.mediaset.it/rss/home.xml', category: 'Italia' },
  { name: 'Internazionale', url: 'https://www.internazionale.it/sitemaps/rss.xml', category: 'Mondo' },
  { name: 'Panorama', url: 'https://www.panorama.it/feeds/feed.rss', category: 'Italia' },

  // --- Economia, finanza e lavoro ---
  { name: 'QuiFinanza', url: 'https://quifinanza.it/feed/', category: 'Economia' },
  { name: 'EconomyUp', url: 'https://www.economyup.it/feed/', category: 'Economia' },

  // --- Tecnologia e innovazione ---
  { name: 'Wired Italia', url: 'https://www.wired.it/feed/rss', category: 'Tecnologia' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', category: 'Tecnologia' },
  { name: 'Punto Informatico', url: 'https://www.punto-informatico.it/feed/', category: 'Tecnologia' },
  { name: 'Agenda Digitale', url: 'https://www.agendadigitale.eu/rss', category: 'Tecnologia' },
  { name: 'DDay.it', url: 'https://www.dday.it/rss', category: 'Tecnologia' },
  { name: 'HDblog', url: 'https://www.hdblog.it/rss/', category: 'Tecnologia' },
  { name: "Tom's Hardware Italia", url: 'https://www.tomshw.it/feed/', category: 'Tecnologia' },

  // --- Sport ---
  { name: 'Gazzetta dello Sport', url: 'https://www.gazzetta.it/rss/home.xml', category: 'Sport' },
  { name: 'Corriere dello Sport', url: 'https://www.corrieredellosport.it/rss/', category: 'Sport' },
  { name: 'Tuttosport', url: 'https://www.tuttosport.com/rss/', category: 'Sport' },
  { name: 'Sky Sport', url: 'https://sport.sky.it/rss/sport.xml', category: 'Sport' },

  // --- Cultura, scienza e società ---
  { name: 'Rinnovabili.it', url: 'https://www.rinnovabili.it/feed/', category: 'Ambiente' },
  { name: 'LifeGate', url: 'https://www.lifegate.it/feed', category: 'Ambiente' },
  { name: 'Focus', url: 'https://www.focus.it/rss', category: 'Scienza' },
  { name: 'Le Scienze', url: 'https://www.lescienze.it/news/rss', category: 'Scienza' },
  { name: 'Vatican News', url: 'https://www.vaticannews.va/it.rss.xml', category: 'Chiesa' },

  // --- Internazionali ---
  { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'Mondo' },
  { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', category: 'Economia' },
  { name: 'BBC Science', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', category: 'Scienza' },
  { name: 'The Guardian - World', url: 'https://www.theguardian.com/world/rss', category: 'Mondo' },
  { name: 'The Guardian - Italy', url: 'https://www.theguardian.com/world/italy/rss', category: 'Mondo' },
  { name: 'The Guardian - Business', url: 'https://www.theguardian.com/uk/business/rss', category: 'Economia' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'Mondo' },
  { name: 'Euronews', url: 'https://www.euronews.com/rss?format=mrss&level=theme&name=news', category: 'Mondo' },
  { name: 'France 24', url: 'https://www.france24.com/en/rss', category: 'Mondo' },
  { name: 'Deutsche Welle - World', url: 'https://rss.dw.com/rdf/rss-en-world', category: 'Mondo' },
  { name: 'Politico Europe', url: 'https://www.politico.eu/feed/', category: 'Europa' },
  { name: 'Financial Times - World', url: 'https://www.ft.com/world?format=rss', category: 'Economia' },
  { name: 'The Economist', url: 'https://www.economist.com/latest/rss.xml', category: 'Mondo' },
  { name: 'Der Spiegel International', url: 'https://www.spiegel.de/international/index.rss', category: 'Mondo' },
  { name: 'New York Times - World', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', category: 'Mondo' },
  { name: 'Reuters - via Google News', url: 'https://news.google.com/rss/search?q=when%3A24h+site%3Areuters.com&ceid=US%3Aen&hl=en-US', category: 'Mondo' },
  { name: 'Associated Press - via Google News', url: 'https://news.google.com/rss/search?q=when%3A24h+site%3Aapnews.com&hl=en-US&gl=US&ceid=US%3Aen', category: 'Mondo' },
];

module.exports = { FEEDS };