const ttlSeconds = 60 * 60 * 12;
const trivia = [
  { question: 'Which animal can fly?', options: ['Parrot', 'Bulldog', 'Kitten'], answer: 'Parrot' },
  { question: 'How many legs does a dog have?', options: ['2', '4', '6'], answer: '4' },
  { question: 'Which animal says meow?', options: ['Cat', 'Parrot', 'Dog'], answer: 'Cat' },
];
const characterInfo = {
  Marley: { emoji: '🐱', description: 'munchkin kitten' }, Dilly: { emoji: '🐱', description: 'munchkin kitten' }, Bruno: { emoji: '🐶', description: 'grumpy bulldog' }, Pico: { emoji: '🦜', description: 'sneaky parrot' },
  Luna: { emoji: '🐱', description: 'moon-eyed cat' }, Otis: { emoji: '🐶', description: 'beagle' }, Kiwi: { emoji: '🦜', description: 'green parrot' }, Nala: { emoji: '🐱', description: 'calico cat' },
  Winston: { emoji: '🐶', description: 'sleepy pug' }, Cleo: { emoji: '🐱', description: 'black cat' }, Rio: { emoji: '🦜', description: 'macaw' }, Mabel: { emoji: '🐶', description: 'corgi' },
  Mochi: { emoji: '🐱', description: 'fluffy kitten' }, Scout: { emoji: '🐶', description: 'terrier' }, Sunny: { emoji: '🦜', description: 'cockatiel' }, Pepper: { emoji: '🐱', description: 'tabby cat' },
  Archie: { emoji: '🐶', description: 'dachshund' }, Zazu: { emoji: '🦜', description: 'blue parrot' }, Olive: { emoji: '🐱', description: 'ginger cat' }, Teddy: { emoji: '🐶', description: 'golden pup' },
  Pippin: { emoji: '🐱', description: 'white kitten' }, Biscuit: { emoji: '🐶', description: 'basset hound' }, Jasper: { emoji: '🦜', description: 'red parrot' }, Suki: { emoji: '🐱', description: 'silver cat' },
};
const characters = new Set(Object.keys(characterInfo));
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function id() { return crypto.randomUUID().replaceAll('-', '').slice(0, 12); }
function gameKey(gameId) { return `guess-who:${gameId}`; }
function lockKey(gameId) { return `guess-who:lock:${gameId}`; }
function message(text) { return { text, at: Date.now() }; }
function reject(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
async function redis(command, ...args) {
  const response = await fetch(`${redisUrl}/${command}/${args.map(encodeURIComponent).join('/')}`, { headers: { Authorization: `Bearer ${redisToken}` } });
  if (!response.ok) throw new Error('The game service is unavailable.');
  return (await response.json()).result;
}
async function read(gameId) { const value = await redis('get', gameKey(gameId)); return value ? JSON.parse(value) : null; }
async function save(game) { await redis('set', gameKey(game.id), JSON.stringify(game), 'EX', ttlSeconds); }
function playerFor(game, deviceId) { return Object.entries(game.players).find(([, value]) => value === deviceId)?.[0]; }
function view(game, player) {
  const copy = structuredClone(game);
  if (copy.trivia?.answer) delete copy.trivia.answer;
  copy.joinedCount = game.players[2] ? 2 : 1;
  copy.ready = Boolean(game.startedAt);
  if (player) delete copy.secrets[player === '1' ? '2' : '1'];
  else delete copy.secrets;
  return { game: copy, player: player ? Number(player) : null };
}
async function withLock(gameId, work) {
  const token = crypto.randomUUID();
  if (!await redis('set', lockKey(gameId), token, 'NX', 'EX', 8)) reject('Game is syncing. Please try again.', 409);
  try { return await work(); } finally { if (await redis('get', lockKey(gameId)) === token) await redis('del', lockKey(gameId)); }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  if (!redisUrl || !redisToken) return res.status(503).json({ error: 'Multiplayer is not configured yet.' });
  try {
    const { action, gameId, deviceId, payload = {} } = req.body || {};
    if (!deviceId) reject('This phone needs a device identity. Reload and try again.');
    if (action === 'create') {
      const game = { id: id(), players: { 1: deviceId, 2: null }, secrets: {}, eliminated: { 1: [], 2: [] }, currentPlayer: null, pendingQuestion: null, trivia: null, winner: null, startedAt: null, messages: [message('Game created. Invite one friend to join.')] };
      await save(game);
      return res.status(201).json(view(game, '1'));
    }
    if (!gameId) reject('Missing game invite.');
    if (action === 'state') {
      const game = await read(gameId);
      if (!game) return res.status(404).json({ error: 'This game has expired. Create a new one.' });
      const player = playerFor(game, deviceId);
      if (!player) return res.status(403).json({ error: 'This phone is not part of this private game.' });
      return res.json(view(game, player));
    }
    const result = await withLock(gameId, async () => {
      const game = await read(gameId);
      if (!game) reject('This game has expired. Create a new one.', 404);
      let player = playerFor(game, deviceId);
      if (action === 'join') {
        if (!player && !game.players[2]) {
          game.players[2] = deviceId;
          game.messages.push(message('Player 2 joined. Both players can now choose a character.'));
          await save(game);
          return view(game, '2');
        }
        if (!player) reject('This private game already has two players.', 403);
        return view(game, player);
      }
      if (!player) reject('This phone is not part of this private game.', 403);
      const me = Number(player), other = me === 1 ? 2 : 1;
      if (action === 'secret') {
        if (!game.players[2]) reject('Waiting for Player 2 before choosing characters.');
        if (game.secrets[me]) reject('Your character is already locked.');
        if (!characters.has(payload.secret)) reject('Choose one of the four characters.');
        game.secrets[me] = payload.secret;
        game.messages.push(message(`Player ${me} locked their character.`));
        if (game.secrets[1] && game.secrets[2]) {
          game.startedAt = Date.now();
          game.currentPlayer = 1;
          game.messages.push(message('Both characters are locked. Player 1 starts!'));
        }
      } else if (action === 'ask') {
        const question = String(payload.question || '').trim();
        if (!game.startedAt || game.currentPlayer !== me || game.pendingQuestion || !question) reject('Wait for your turn to ask a question.');
        game.pendingQuestion = { asker: me, text: question.slice(0, 100) };
        game.messages.push(message(`Player ${me}: ${question.slice(0, 100)}`));
      } else if (action === 'answer') {
        if (!game.pendingQuestion || game.pendingQuestion.asker !== other || !['yes', 'no'].includes(payload.answer)) reject('There is no question for you.');
        game.messages.push(message(`Player ${me}: ${payload.answer === 'yes' ? 'Yes' : 'No'}`));
        game.pendingQuestion = null;
        game.currentPlayer = me;
      } else if (action === 'twist') {
        if (!game.startedAt || game.currentPlayer !== me || game.pendingQuestion || game.trivia) reject('Wait for your turn to send a Twist.');
        const challenge = trivia[Math.floor(Math.random() * trivia.length)];
        game.trivia = { ...challenge, sender: me, recipient: other };
        game.messages.push(message(`Player ${me} sent Player ${other} a Twist challenge!`));
      } else if (action === 'triviaAnswer') {
        if (!game.trivia || game.trivia.recipient !== me || !game.trivia.options.includes(payload.answer)) reject('There is no Twist challenge for you.');
        const correct = payload.answer === game.trivia.answer;
        game.messages.push(message(`Player ${me} answered the Twist ${correct ? 'correctly!' : 'incorrectly.'}`));
        game.trivia = null;
        if (!correct) game.currentPlayer = other;
      } else if (action === 'eliminate') {
        if (!game.startedAt || game.currentPlayer !== me || game.pendingQuestion || !characters.has(payload.name)) reject('Wait for your turn to update your board.');
        const eliminated = new Set(game.eliminated[me]);
        eliminated.has(payload.name) ? eliminated.delete(payload.name) : eliminated.add(payload.name);
        game.eliminated[me] = [...eliminated];
      } else if (action === 'guess') {
        if (!game.startedAt || game.currentPlayer !== me || game.pendingQuestion || !characters.has(payload.name)) reject('Wait for your turn to make a guess.');
        if (payload.name === game.secrets[other]) {
          game.winner = me;
          game.messages.push(message(`Player ${me} guessed correctly and wins!`));
        } else {
          game.messages.push(message(`Player ${me} guessed ${payload.name}. Not this time.`));
          game.currentPlayer = other;
        }
      } else reject('Unknown game action.');
      game.messages = game.messages.slice(-12);
      await save(game);
      return view(game, player);
    });
    return res.json(result);
  } catch (error) { return res.status(error.status || 500).json({ error: error.message || 'Something went wrong.' }); }
}
