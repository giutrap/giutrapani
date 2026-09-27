// Classificazione euristica dei "lanci" secondo la convenzione delle agenzie di stampa:
// + (verde) rilievo superiore alla media, ++ (giallo) notizia molto importante,
// +++ (rosso) massima priorità. I feed RSS pubblici non trasportano il flag di
// redazione originale delle agenzie (quello è interno ai notiziari riservati),
// quindi il livello viene stimato da parole chiave nel titolo/riassunto e,
// quando disponibile, dal fatto che la fonte sia essa stessa un notiziario
// "flash/ultima ora" (vedi il campo isFlash in feeds.js).

const LEVEL_3_KEYWORDS = [
  // vittime di rilievo, attentati, crisi istituzionali, guerra, disastri
  'e morto', 'e morta', 'muore a', 'ucciso a', 'uccisa a', 'assassinat',
  'attentato', 'strage', 'kamikaze', 'attacco terroristico', 'ordigno esplo',
  'si dimette il governo', 'governo si dimette', 'cade il governo', 'crisi di governo', 'sfiducia al governo',
  'dimissioni del premier', 'premier si dimette', 'dimissioni del presidente del consiglio',
  'presidente del consiglio si dimette', 'golpe', 'colpo di stato',
  'dichiara guerra', 'dichiarazione di guerra', 'stato di emergenza nazionale',
  'terremoto', 'esplosione', 'crollo del ponte', 'morti nel crollo', 'bilancio delle vittime',
  'has died', 'dies at', 'dead at', 'killed in', 'assassinat', 'terrorist attack',
  'declares war', 'resigns as prime minister', 'government collapses', "coup d'etat",
  'coup attempt', 'earthquake', 'mass shooting', 'explosion kills', 'state of emergency',
];

const LEVEL_2_KEYWORDS = [
  'arrestato', 'arrestata', 'arresto di', 'indagato', 'indagata', 'indagine su',
  'perquisizione', 'sciopero generale', 'allerta rossa', 'allerta meteo',
  'condannato a', 'condannata a', 'condanna a', 'sentenza storica', 'crollo in borsa',
  'crisi diplomatica', 'mozione di sfiducia', 'voto di sfiducia', 'ultimatum', 'stato di allerta',
  'arrested', 'indicted', 'investigation into', 'general strike', 'red alert',
  'sentenced to', 'market crash', 'diplomatic crisis', 'no-confidence vote', 'ultimatum',
];

const LEVEL_1_KEYWORDS = [
  "ultim'ora", 'ultimora', 'flash', 'diretta:', 'in aggiornamento', 'appena diramato',
  'edizione straordinaria', 'breaking news', 'just in', 'developing story',
];

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function matchesAny(haystack, keywords) {
  return keywords.some((kw) => haystack.includes(kw));
}

function classifyPriority({ title, summary, source }) {
  const haystack = normalize(`${title} ${summary}`);
  if (matchesAny(haystack, LEVEL_3_KEYWORDS)) return 3;
  if (matchesAny(haystack, LEVEL_2_KEYWORDS)) return 2;
  if (matchesAny(haystack, LEVEL_1_KEYWORDS) || source?.isFlash) return 1;
  return 0;
}

const LEVEL_META = {
  0: { crosses: '', label: 'Lancio ordinario', color: null },
  1: { crosses: '+', label: 'Rilievo superiore alla media', color: 'green' },
  2: { crosses: '++', label: 'Notizia molto importante', color: 'yellow' },
  3: { crosses: '+++', label: 'Massima priorità', color: 'red' },
};

module.exports = { classifyPriority, LEVEL_META };
