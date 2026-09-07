// Identity Clash - real-time multi-view party game server
// Owns the single source of truth for: current view, coin toss result,
// active theme, secret-character lock-in status, card elimination state,
// and the shared countdown clock. All connected clients stay in lockstep.
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const THEMES = ["feline", "cyber", "tavern", "bermuda", "cinema", "london"];
const CARD_COUNT = 24;
const START_TIME = 60;

const SUDDEN_DEATH_ROUND_COUNT = 10;
const SUDDEN_DEATH_QUESTION_MS = 10000;
const SUDDEN_DEATH_REVEAL_MS = 2500;
const WAGER_TIMEOUT_MS = 8000;
const FLASH_BANG_CHANCE = 0.2;
const FOG_DURATION_MS = 15000;

// Minimal mirror of index.html's client-side trait generation, kept server-only
// so "The Interrogation" leak can reveal a true trait without ever exposing the
// actual secret character index to any client.
const TRAIT_PATTERNS = [
  (i) => i < 12,
  (i) => i % 2 === 0,
  (i) => i % 4 < 2,
  (i) => Math.floor(i / 2) % 2 === 0,
  (i) => i % 6 < 3,
  (i) => i % 8 < 4
];
function rotatePatterns(arr, n) {
  return arr.slice(n).concat(arr.slice(0, n));
}
const LONDON_TRAIT_MATRIX = [
  [true, true, true, true, true],
  [false, true, true, true, true],
  [false, false, true, true, true],
  [false, false, false, true, true],
  [false, false, false, false, true],
  [false, false, false, false, false],
  [true, false, false, false, false],
  [false, true, false, false, false],
  [true, false, true, false, false],
  [false, true, false, true, false],
  [false, false, true, false, true],
  [true, false, false, true, false],
  [true, true, false, false, true],
  [false, true, true, false, false],
  [false, false, true, true, false],
  [true, false, false, true, true],
  [true, true, false, false, true],
  [false, true, true, false, false],
  [true, false, true, true, false],
  [false, true, false, true, true],
  [true, false, true, false, true],
  [true, true, false, true, false],
  [true, true, true, false, true],
  [true, true, true, true, false]
];
const THEME_TRAIT_CONFIG = {
  feline: { traits: ["coatIsLight", "eyesAreGreen", "nameHasOddLetters", "hasMoreVowels", "wearingGlasses", "isSmiling"], patterns: TRAIT_PATTERNS },
  cyber: { traits: ["isAlien", "hasCybernetics", "hasNeonVisor", "holdsBlaster", "wearsTrenchCoat", "hasHoloTattoo"], patterns: rotatePatterns(TRAIT_PATTERNS, 2) },
  tavern: { traits: ["isMagicUser", "hasPointyEars", "hasPetFamiliar", "wearingHood", "hasMagicAura", "holdingTankard"], patterns: rotatePatterns(TRAIT_PATTERNS, 4) },
  bermuda: { traits: ["isMerfolk", "hasConchShell", "wearsSeaGlassCharm", "hasBarnacleScar", "isGhostlyPale", "carriesLantern"], patterns: rotatePatterns(TRAIT_PATTERNS, 1) },
  cinema: { traits: ["isDoubleAgent", "wearsFedora", "hasHiddenCamera", "isFilmDirector", "hasMysteriousScar", "holdsMartini"], patterns: rotatePatterns(TRAIT_PATTERNS, 5) },
  london: { traits: ["hasGlasses", "hasHat", "hasScarf", "hasLightHair", "isSmiling"], matrix: LONDON_TRAIT_MATRIX }
};
const TRAIT_PHRASES = {
  coatIsLight: "wearing a light coat", eyesAreGreen: "green eyed", nameHasOddLetters: "carrying a name with an odd number of letters",
  hasMoreVowels: "carrying a name packed with vowels", wearingGlasses: "wearing glasses", isSmiling: "smiling",
  isAlien: "an alien", hasCybernetics: "kitted out with cybernetics", hasNeonVisor: "wearing a neon visor",
  holdsBlaster: "holding a blaster", wearsTrenchCoat: "wearing a trench coat", hasHoloTattoo: "sporting a holo-tattoo",
  isMagicUser: "a magic user", hasPointyEars: "sporting pointy ears", hasPetFamiliar: "travelling with a pet familiar",
  wearingHood: "wearing a hood", hasMagicAura: "glowing with a magic aura", holdingTankard: "holding a tankard",
  isMerfolk: "merfolk", hasConchShell: "carrying a conch shell", wearsSeaGlassCharm: "wearing a sea glass charm",
  hasBarnacleScar: "marked with a barnacle scar", isGhostlyPale: "ghostly pale", carriesLantern: "carrying a lantern",
  isDoubleAgent: "a double agent", wearsFedora: "wearing a fedora", hasHiddenCamera: "hiding a camera",
  isFilmDirector: "a film director", hasMysteriousScar: "marked with a mysterious scar", holdsMartini: "holding a martini",
  hasGlasses: "wearing glasses", hasHat: "wearing a hat", hasScarf: "wearing a scarf", hasLightHair: "light haired"
};
function getSecretTraits(themeKey, characterIndex) {
  const config = THEME_TRAIT_CONFIG[themeKey];
  if (!config || !Number.isInteger(characterIndex)) return {};
  const traits = {};
  config.traits.forEach((key, ti) => {
    traits[key] = config.matrix ? !!(config.matrix[characterIndex] && config.matrix[characterIndex][ti]) : config.patterns[ti](characterIndex);
  });
  return traits;
}

// Sudden Death Trivia question bank. correctIndex is never broadcast to
// clients until a question resolves (both answered or timed out).
const SUDDEN_DEATH_QUESTIONS = [
  { id: 1, category: "hardGeneral", question: "What is the only letter that does not appear in any U.S. state name?", options: ["Q", "X", "Z", "J"], correctIndex: 0 },
  { id: 2, category: "hardGeneral", question: "Which planet has the shortest day in the Solar System?", options: ["Mercury", "Jupiter", "Mars", "Saturn"], correctIndex: 1 },
  { id: 3, category: "hardGeneral", question: "In what year was the Rosetta Stone discovered?", options: ["1799", "1822", "1856", "1901"], correctIndex: 0 },
  { id: 4, category: "hardGeneral", question: "What is the rarest blood type in humans?", options: ["O negative", "AB negative", "B negative", "AB positive"], correctIndex: 1 },
  { id: 5, category: "hardGeneral", question: "Which country has the most time zones?", options: ["Russia", "USA", "France", "China"], correctIndex: 2 },
  { id: 6, category: "hardGeneral", question: "What is the only mammal capable of true flight?", options: ["Flying squirrel", "Bat", "Sugar glider", "Colugo"], correctIndex: 1 },
  { id: 7, category: "hardGeneral", question: "Which element is liquid at room temperature besides mercury?", options: ["Bromine", "Gallium", "Cesium", "Francium"], correctIndex: 0 },
  { id: 8, category: "hardGeneral", question: "What is the longest river in the world?", options: ["Amazon", "Nile", "Yangtze", "Mississippi"], correctIndex: 1 },
  { id: 9, category: "tennis", question: "Who is the only man to win a Golden Slam (all 4 majors + Olympic gold in the same year)?", options: ["Rod Laver", "Andre Agassi", "Steffi Graf", "Rafael Nadal"], correctIndex: 1 },
  { id: 10, category: "tennis", question: "Which Grand Slam is the only one played on grass?", options: ["French Open", "US Open", "Wimbledon", "Australian Open"], correctIndex: 2 },
  { id: 11, category: "tennis", question: "How many Grand Slam singles titles did Serena Williams win?", options: ["19", "21", "23", "25"], correctIndex: 2 },
  { id: 12, category: "tennis", question: "What is the name of the tiebreak rule introduced at Wimbledon for deciding sets?", options: ["Match tiebreak", "Advantage set", "Championship tiebreak", "Golden point"], correctIndex: 2 },
  { id: 13, category: "tennis", question: "Which surface is generally considered the slowest, favoring long rallies?", options: ["Grass", "Hard court", "Clay", "Carpet"], correctIndex: 2 },
  { id: 14, category: "tennis", question: "Who holds the record for most Australian Open men's singles titles?", options: ["Roger Federer", "Novak Djokovic", "Rafael Nadal", "Andre Agassi"], correctIndex: 1 },
  { id: 15, category: "tennis", question: "In what year did the US Open introduce the tiebreak?", options: ["1965", "1970", "1975", "1980"], correctIndex: 1 },
  { id: 16, category: "cinema", question: "Which director is known for long takes in 'Children of Men' and 'Gravity'?", options: ["Guillermo del Toro", "Alfonso Cuaron", "Alejandro Inarritu", "Pedro Almodovar"], correctIndex: 1 },
  { id: 17, category: "cinema", question: "Who directed 'Vertigo' and 'Rear Window'?", options: ["Billy Wilder", "Orson Welles", "Alfred Hitchcock", "John Huston"], correctIndex: 2 },
  { id: 18, category: "cinema", question: "Which auteur is famous for the 'Three Colours' trilogy?", options: ["Krzysztof Kieslowski", "Ingmar Bergman", "Federico Fellini", "Jean-Luc Godard"], correctIndex: 0 },
  { id: 19, category: "cinema", question: "Who directed 'No Country for Old Men' and 'Fargo'?", options: ["David Fincher", "The Coen Brothers", "Paul Thomas Anderson", "Denis Villeneuve"], correctIndex: 1 },
  { id: 20, category: "cinema", question: "Which filmmaker is associated with 'auteur theory' as a French critic-turned-director?", options: ["Francois Truffaut", "Roman Polanski", "Luc Besson", "Claude Lelouch"], correctIndex: 0 },
  { id: 21, category: "cinema", question: "Who directed the thriller 'Se7en' and 'Zodiac'?", options: ["Christopher Nolan", "David Fincher", "Ridley Scott", "Michael Mann"], correctIndex: 1 },
  { id: 22, category: "cinema", question: "Which director's signature style includes symmetrical framing, seen in 'The Grand Budapest Hotel'?", options: ["Wes Anderson", "Tim Burton", "Terry Gilliam", "Spike Jonze"], correctIndex: 0 },
  { id: 23, category: "chess", question: "What is the opening move sequence 1.e4 e5 2.Nf3 Nc6 3.Bb5 known as?", options: ["Italian Game", "Ruy Lopez", "Sicilian Defense", "Scotch Game"], correctIndex: 1 },
  { id: 24, category: "chess", question: "Which opening begins with 1.d4 Nf6 2.c4 g6 3.Nc3 Bg7?", options: ["King's Indian Defense", "Nimzo-Indian Defense", "Grunfeld Defense", "Benoni Defense"], correctIndex: 0 },
  { id: 25, category: "chess", question: "What is 1.e4 c5 known as?", options: ["Caro-Kann Defense", "French Defense", "Sicilian Defense", "Pirc Defense"], correctIndex: 2 },
  { id: 26, category: "chess", question: "Which opening is defined by 1.e4 e6?", options: ["French Defense", "Caro-Kann Defense", "Scandinavian Defense", "Alekhine's Defense"], correctIndex: 0 },
  { id: 27, category: "chess", question: "What is the name of the aggressive gambit starting 1.d4 d5 2.c4?", options: ["King's Gambit", "Queen's Gambit", "Evans Gambit", "Budapest Gambit"], correctIndex: 1 },
  { id: 28, category: "chess", question: "Which opening starts 1.e4 Nf6, provoking White's pawns forward?", options: ["Alekhine's Defense", "Scandinavian Defense", "Petrov's Defense", "Philidor Defense"], correctIndex: 0 },
  { id: 29, category: "reggae", question: "Which Jamaican artist recorded 'No Woman, No Cry'?", options: ["Peter Tosh", "Bob Marley", "Jimmy Cliff", "Burning Spear"], correctIndex: 1 },
  { id: 30, category: "reggae", question: "What record label did Chris Blackwell found, key to reggae's global rise?", options: ["Trojan Records", "Island Records", "Studio One", "Def Jam"], correctIndex: 1 },
  { id: 31, category: "reggae", question: "Which Kingston studio, founded by Coxsone Dodd, is called the 'Motown of Jamaica'?", options: ["Studio One", "Channel One", "Tuff Gong", "Black Ark"], correctIndex: 0 },
  { id: 32, category: "reggae", question: "Who is considered the pioneering producer behind dub music at the Black Ark studio?", options: ["King Tubby", "Lee 'Scratch' Perry", "Sly Dunbar", "Duke Reid"], correctIndex: 1 },
  { id: 33, category: "reggae", question: "Which musical style directly preceded and evolved into reggae in the 1960s?", options: ["Calypso", "Ska", "Mento", "Rocksteady"], correctIndex: 3 },
  { id: 34, category: "reggae", question: "What is the name of Bob Marley's backing band?", options: ["The Skatalites", "The Wailers", "Third World", "Black Uhuru"], correctIndex: 1 },
  { id: 35, category: "reggae", question: "Which religious/cultural movement heavily influences reggae lyrics and themes?", options: ["Vodou", "Rastafari", "Santeria", "Obeah"], correctIndex: 1 },
  { id: 36, category: "hardGeneral", question: "Which country invented the printing press with movable metal type?", options: ["Germany", "China", "Korea", "Italy"], correctIndex: 2 },
  { id: 37, category: "tennis", question: "Which player has won the most career singles titles across the Open Era (men or women)?", options: ["Roger Federer", "Martina Navratilova", "Jimmy Connors", "Chris Evert"], correctIndex: 2 },
  { id: 38, category: "cinema", question: "Who directed the psychological thriller 'Memento' and 'Insomnia'?", options: ["Christopher Nolan", "Denis Villeneuve", "David Lynch", "Darren Aronofsky"], correctIndex: 0 }
];

const state = {
  view: "landing",       // "landing" | "coinToss" | "secretSelect" | "board" | "trivia_sudden_death" | "matchOver"
  coinResult: null,      // null | "neil" | "gemma"
  theme: null,           // theme key
  eliminated: {          // independent elimination board per player - each only sees/edits their own
    neil: new Array(CARD_COUNT).fill(false),
    gemma: new Array(CARD_COUNT).fill(false)
  },
  secretsLocked: { neil: false, gemma: false }, // whether each player has locked in a secret (never reveals which)
  activeTurn: null,      // null | "neil" | "gemma" - whose turn it currently is on the board
  timeRemaining: START_TIME,
  running: false,
  score: { neil: 0, gemma: 0 },  // persists across rounds, only reset on server restart
  matchResult: null,     // { winner, loser, correct, guesser, guessedIndex, secretIndex }
  suddenDeath: null,     // { questions, currentIndex, phase, wagers, answers, scores, revealCorrectIndex, startedAt, duration }
  lastSuddenDeathResult: null, // { winner, scores } - shown briefly on return to the board
  droneTokens: { neil: 0, gemma: 0 },       // Recon Drone charges: awarded via Easy-wager correct answers + round winner bonus
  smokescreenTokens: { neil: 0, gemma: 0 }, // earned every 3 consecutive correct trivia answers
  fogged: { neil: false, gemma: false }     // true while that player's own board is covered by an opponent's Smokescreen
};

// Server-only, never broadcast: each player's own secret character for this round,
// and the correct answers for whichever Sudden Death round is currently active.
const secrets = { neil: null, gemma: null };
let suddenDeathCorrectIndexes = [];
let suddenDeathTimeoutId = null;
const streaks = { neil: 0, gemma: 0 }; // consecutive correct Sudden Death answers, drives the Smokescreen token
const fogTimeouts = { neil: null, gemma: null };

let tickInterval = null;

function opponentOf(name) {
  return name === "neil" ? "gemma" : "neil";
}

function clearSuddenDeathTimeout() {
  clearTimeout(suddenDeathTimeoutId);
  suddenDeathTimeoutId = null;
}

function shuffled(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function startSuddenDeath() {
  if (state.view !== "board" || state.suddenDeath) return;
  const chosen = shuffled(SUDDEN_DEATH_QUESTIONS).slice(0, SUDDEN_DEATH_ROUND_COUNT);
  suddenDeathCorrectIndexes = chosen.map((q) => q.correctIndex);
  state.running = false;
  stopTicking();
  state.lastSuddenDeathResult = null;
  streaks.neil = 0;
  streaks.gemma = 0;
  state.suddenDeath = {
    questions: chosen.map(({ id, category, question, options }) => ({
      id, category, question, options, isFlashBang: Math.random() < FLASH_BANG_CHANCE
    })),
    currentIndex: 0,
    phase: "wager",
    wagers: { neil: null, gemma: null },
    answers: { neil: null, gemma: null },
    scores: { neil: 0, gemma: 0 },
    revealCorrectIndex: null,
    startedAt: Date.now(),
    duration: SUDDEN_DEATH_QUESTION_MS
  };
  state.view = "trivia_sudden_death";
  broadcastState();
  clearSuddenDeathTimeout();
  suddenDeathTimeoutId = setTimeout(forceResolveWagers, WAGER_TIMEOUT_MS);
}

// If a player dawdles on their wager, they're defaulted to Play it Safe so the round keeps moving.
function forceResolveWagers() {
  const sd = state.suddenDeath;
  if (!sd || sd.phase !== "wager") return;
  ["neil", "gemma"].forEach((name) => {
    if (!sd.wagers[name]) sd.wagers[name] = "easy";
  });
  beginQuestionPhase();
}

function beginQuestionPhase() {
  const sd = state.suddenDeath;
  if (!sd) return;
  clearSuddenDeathTimeout();
  sd.phase = "question";
  sd.startedAt = Date.now();
  broadcastState();
  const q = sd.questions[sd.currentIndex];
  if (q.isFlashBang) {
    io.emit("trivia:flash_bang", { question: q.question });
  }
  suddenDeathTimeoutId = setTimeout(revealSuddenDeathQuestion, SUDDEN_DEATH_QUESTION_MS);
}

// Reveals one true trait of the opponent's secret character - the actual secret
// index never leaves the server, only a single spoken descriptor of it.
function leakIntel(name) {
  const opponent = opponentOf(name);
  const secretIndex = secrets[opponent];
  if (!state.theme || !Number.isInteger(secretIndex)) return;
  const traits = getSecretTraits(state.theme, secretIndex);
  const trueTraitKeys = Object.keys(traits).filter((k) => traits[k]);
  if (!trueTraitKeys.length) return;
  const traitKey = trueTraitKeys[Math.floor(Math.random() * trueTraitKeys.length)];
  io.emit("host:leak_intel", { name, phrase: TRAIT_PHRASES[traitKey] || traitKey });
}

// Penalty for a failed "Interrogation" wager: 2 of the player's own eliminated cards un-flip.
function resurrectCards(name) {
  const board = state.eliminated[name];
  const eliminatedIndexes = [];
  for (let i = 0; i < CARD_COUNT; i++) if (board[i]) eliminatedIndexes.push(i);
  const targets = shuffled(eliminatedIndexes).slice(0, 2);
  targets.forEach((i) => { board[i] = false; });
  io.emit("penalty:resurrect", { name, indices: targets });
}

function revealSuddenDeathQuestion() {
  const sd = state.suddenDeath;
  if (!sd || sd.phase !== "question") return;
  clearSuddenDeathTimeout();
  const correctIndex = suddenDeathCorrectIndexes[sd.currentIndex];
  ["neil", "gemma"].forEach((name) => {
    const correct = sd.answers[name] === correctIndex;
    if (correct) sd.scores[name] += 1;

    if (correct) {
      streaks[name] += 1;
      if (streaks[name] >= 3) {
        state.smokescreenTokens[name] += 1;
        streaks[name] = 0;
      }
    } else {
      streaks[name] = 0;
    }

    const wager = sd.wagers[name];
    if (wager === "easy" && correct) {
      state.droneTokens[name] += 1;
    } else if (wager === "hard" && correct) {
      leakIntel(name);
    } else if (wager === "hard" && !correct) {
      resurrectCards(name);
    }
  });
  sd.phase = "reveal";
  sd.revealCorrectIndex = correctIndex;
  broadcastState();
  suddenDeathTimeoutId = setTimeout(advanceSuddenDeath, SUDDEN_DEATH_REVEAL_MS);
}

function advanceSuddenDeath() {
  const sd = state.suddenDeath;
  if (!sd) return;
  clearSuddenDeathTimeout();
  if (sd.currentIndex + 1 >= sd.questions.length) {
    completeSuddenDeath();
    return;
  }
  sd.currentIndex += 1;
  sd.phase = "wager";
  sd.wagers = { neil: null, gemma: null };
  sd.answers = { neil: null, gemma: null };
  sd.revealCorrectIndex = null;
  sd.startedAt = Date.now();
  broadcastState();
  suddenDeathTimeoutId = setTimeout(forceResolveWagers, WAGER_TIMEOUT_MS);
}

function completeSuddenDeath() {
  const sd = state.suddenDeath;
  clearSuddenDeathTimeout();
  let winner = null;
  if (sd.scores.neil > sd.scores.gemma) winner = "neil";
  else if (sd.scores.gemma > sd.scores.neil) winner = "gemma";
  state.lastSuddenDeathResult = { winner, scores: { ...sd.scores }, id: Date.now() };
  if (winner) state.droneTokens[winner] += 1;
  state.suddenDeath = null;
  suddenDeathCorrectIndexes = [];
  state.view = "board";
  broadcastState();
}

function resetRoundState() {
  state.eliminated = {
    neil: new Array(CARD_COUNT).fill(false),
    gemma: new Array(CARD_COUNT).fill(false)
  };
  state.timeRemaining = START_TIME;
  state.running = false;
  stopTicking();
  secrets.neil = null;
  secrets.gemma = null;
  state.secretsLocked = { neil: false, gemma: false };
  state.activeTurn = null;
  state.matchResult = null;
  clearSuddenDeathTimeout();
  suddenDeathCorrectIndexes = [];
  state.suddenDeath = null;
  state.lastSuddenDeathResult = null;
  state.droneTokens = { neil: 0, gemma: 0 };
  state.smokescreenTokens = { neil: 0, gemma: 0 };
  state.fogged = { neil: false, gemma: false };
  streaks.neil = 0;
  streaks.gemma = 0;
  clearTimeout(fogTimeouts.neil);
  clearTimeout(fogTimeouts.gemma);
  fogTimeouts.neil = null;
  fogTimeouts.gemma = null;
}

// Fires the moment both secrets are locked in: the coin toss winner takes the first turn.
function startMatch() {
  state.view = "board";
  state.activeTurn = state.coinResult;
}

function broadcastState() {
  io.emit("state:update", state);
}

function stopTicking() {
  clearInterval(tickInterval);
  tickInterval = null;
}

function startTicking() {
  if (tickInterval) return;
  tickInterval = setInterval(() => {
    state.timeRemaining = Math.max(0, state.timeRemaining - 1);
    if (state.timeRemaining <= 0) {
      state.running = false;
      stopTicking();
    }
    broadcastState();
  }, 1000);
}

io.on("connection", (socket) => {
  // New connections immediately sync to whatever view the group is on.
  socket.emit("state:update", state);

  socket.on("view:enterClash", () => {
    state.view = "coinToss";
    state.coinResult = null;
    state.theme = null;
    broadcastState();
  });

  socket.on("theme:select", (theme) => {
    if (!THEMES.includes(theme)) return;
    state.theme = theme;
    broadcastState();
  });

  socket.on("coin:flip", () => {
    state.coinResult = Math.random() < 0.5 ? "neil" : "gemma";
    broadcastState();
  });

  socket.on("secretSelect:begin", () => {
    if (!state.theme) return;
    resetRoundState();
    state.view = "secretSelect";
    broadcastState();
  });

  socket.on("secret:choose", (payload) => {
    const name = payload && payload.name;
    const characterIndex = payload && payload.characterIndex;
    if (name !== "neil" && name !== "gemma") return;
    if (!Number.isInteger(characterIndex) || characterIndex < 0 || characterIndex >= CARD_COUNT) return;
    if (state.view !== "secretSelect") return;
    if (state.secretsLocked[name]) return;

    secrets[name] = characterIndex;
    state.secretsLocked[name] = true;
    if (state.secretsLocked.neil && state.secretsLocked.gemma) {
      startMatch();
    }
    broadcastState();
  });

  socket.on("card:toggle", (payload) => {
    const name = payload && payload.name;
    const index = payload && payload.index;
    if (name !== "neil" && name !== "gemma") return;
    if (!Number.isInteger(index) || index < 0 || index >= CARD_COUNT) return;
    // A player may only flip cards on their own independent board.
    state.eliminated[name][index] = !state.eliminated[name][index];
    broadcastState();
  });

  socket.on("turn:end", (payload) => {
    const name = payload && payload.name;
    if (state.view !== "board" || !state.activeTurn) return;
    if (name !== state.activeTurn) return;
    state.activeTurn = opponentOf(state.activeTurn);
    broadcastState();
  });

  // Host-only override: immediately hands the turn to the other player.
  socket.on("turn:force_swap", () => {
    if (state.view !== "board" || !state.activeTurn) return;
    state.activeTurn = opponentOf(state.activeTurn);
    broadcastState();
  });

  // Host-triggered Sudden Death Trivia: pauses the board and shifts every
  // connected screen into the trivia_sudden_death state for a 10-question race.
  socket.on("suddenDeath:start", () => {
    startSuddenDeath();
  });

  // The Interrogation Room wager: each player independently plays it safe
  // or goes for the hard interrogation before the question is revealed.
  socket.on("trivia:wager", (payload) => {
    const name = payload && payload.name;
    const choice = payload && payload.choice;
    if (name !== "neil" && name !== "gemma") return;
    if (choice !== "easy" && choice !== "hard") return;
    const sd = state.suddenDeath;
    if (!sd || sd.phase !== "wager") return;
    if (sd.wagers[name]) return;
    sd.wagers[name] = choice;
    io.emit("wager:chosen", { name, choice });
    broadcastState();
    if (sd.wagers.neil && sd.wagers.gemma) beginQuestionPhase();
  });

  socket.on("suddenDeath:answer", (payload) => {
    const name = payload && payload.name;
    const selectedIndex = payload && payload.selectedIndex;
    if (name !== "neil" && name !== "gemma") return;
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 3) return;
    const sd = state.suddenDeath;
    if (!sd || sd.phase !== "question") return;
    if (sd.answers[name] !== null) return; // one answer per question, no changing your mind
    sd.answers[name] = selectedIndex;
    broadcastState();
    if (sd.answers.neil !== null && sd.answers.gemma !== null) revealSuddenDeathQuestion();
  });

  // Recon Drone bonus: consumes one charge to auto-eliminate 3 random
  // still-active cards on the deployer's own board, skipping the
  // opponent's actual secret character.
  socket.on("drone:deploy", (payload) => {
    const name = payload && payload.name;
    if (name !== "neil" && name !== "gemma") return;
    if (!state.droneTokens[name]) return;
    const opponent = opponentOf(name);
    const secretIndex = secrets[opponent];
    const board = state.eliminated[name];
    const candidates = [];
    for (let i = 0; i < CARD_COUNT; i++) {
      if (!board[i] && i !== secretIndex) candidates.push(i);
    }
    const targets = shuffled(candidates).slice(0, 3);
    targets.forEach((i) => { board[i] = true; });
    state.droneTokens[name] -= 1;
    io.emit("drone:deployed", { name, indices: targets });
    broadcastState();
  });

  // Smokescreen sabotage: consumes one token to fog the opponent's own
  // gameBoard for 15 seconds.
  socket.on("sabotage:smokescreen", (payload) => {
    const name = payload && payload.name;
    if (name !== "neil" && name !== "gemma") return;
    if (!state.smokescreenTokens[name]) return;
    state.smokescreenTokens[name] -= 1;
    const target = opponentOf(name);
    state.fogged[target] = true;
    io.emit("sabotage:smokescreen", { by: name, target });
    broadcastState();
    clearTimeout(fogTimeouts[target]);
    fogTimeouts[target] = setTimeout(() => {
      state.fogged[target] = false;
      broadcastState();
    }, FOG_DURATION_MS);
  });

  socket.on("guess:submit", (payload) => {
    const guesser = payload && payload.guesser;
    const characterIndex = payload && payload.characterIndex;
    const validGuesser = guesser === "neil" || guesser === "gemma";
    if (!validGuesser) return;
    if (!Number.isInteger(characterIndex) || characterIndex < 0 || characterIndex >= CARD_COUNT) return;
    if (state.view !== "board") return;

    const opponent = opponentOf(guesser);
    const correct = characterIndex === secrets[opponent];

    if (correct) {
      state.score[guesser] += 1;
      state.matchResult = {
        winner: guesser,
        loser: opponent,
        correct: true,
        guesser,
        guessedIndex: characterIndex,
        secretIndex: secrets[opponent]
      };
      state.running = false;
      stopTicking();
      state.view = "matchOver";
      broadcastState();
      return;
    }

    // Wrong guess: game over, opponent wins outright.
    state.score[opponent] += 1;
    state.matchResult = {
      winner: opponent,
      loser: guesser,
      correct: false,
      guesser,
      guessedIndex: characterIndex,
      secretIndex: secrets[opponent]
    };
    state.running = false;
    stopTicking();
    state.view = "matchOver";
    broadcastState();
  });

  socket.on("match:nextRound", () => {
    if (!state.theme) return;
    resetRoundState();
    state.view = "secretSelect";
    broadcastState();
  });

  socket.on("timer:start", () => {
    if (state.timeRemaining <= 0) return;
    state.running = true;
    startTicking();
    broadcastState();
  });

  socket.on("timer:pause", () => {
    state.running = false;
    stopTicking();
    broadcastState();
  });

  socket.on("timer:reset", () => {
    state.running = false;
    stopTicking();
    state.timeRemaining = START_TIME;
    broadcastState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Identity Clash server running at http://localhost:${PORT}`);
});
