const ttlSeconds = 60 * 60 * 12;
const characterInfo = { Nova: ['star earrings', 'microphone', 'music'], Milo: ['striped tee', 'skateboard', 'sport'], Zuri: ['round glasses', 'camera', 'creative'], Theo: ['cap', 'backpack', 'travel'], Pia: ['flower clip', 'tote bag', 'nature'], Remy: ['headphones', 'hoodie', 'music'] };
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const characters = new Set(Object.keys(characterInfo));

function id() { return crypto.randomUUID().replaceAll('-', '').slice(0, 12); }
function key(gameId) { return `guess-who:${gameId}`; }
async function redis(command, ...args) {
  const response = await fetch(`${redisUrl}/${command}/${args.map(encodeURIComponent).join('/')}`, { headers: { Authorization: `Bearer ${redisToken}` } });
  if (!response.ok) throw new Error('The game service is unavailable.');
  const payload = await response.json();
  return payload.result;
}
async function read(gameId) { const value = await redis('get', key(gameId)); return value ? JSON.parse(value) : null; }
async function save(game) { await redis('set', key(game.id), JSON.stringify(game), 'EX', ttlSeconds); }
function message(text, type = 'system') { return { text, type, at: Date.now() }; }
function playerFor(game, deviceId) { return Object.entries(game.players).find(([, value]) => value === deviceId)?.[0]; }
function view(game, player) {
  const copy = structuredClone(game);
  copy.ready = Boolean(game.secrets[1] && game.secrets[2]);
  if (player) delete copy.secrets[player === '1' ? '2' : '1'];
  else delete copy.secrets;
  return { game: copy, player: player ? Number(player) : null };
}
function reject(message, status = 400) { const error = new Error(message); error.status = status; throw error; }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  if (!redisUrl || !redisToken) return res.status(503).json({ error: 'Multiplayer is not configured yet.' });
  try {
    const { action, gameId, deviceId, boardName, payload = {} } = req.body || {};
    if (!deviceId) reject('This phone needs a device identity. Reload and try again.');
    if (action === 'create') {
      const game = { id: id(), boardName: boardName || 'festival', players: { 1: deviceId, 2: null }, secrets: {}, eliminated: { 1: [], 2: [] }, currentPlayer: 1, pendingQuestion: null, bonuses: { 1: 0, 2: 0 }, triviaUsed: { 1: false, 2: false }, twistUsed: { 1: false, 2: false }, encorePlayer: null, winner: null, messages: [message('Game created. Share the link with one friend.', 'system')] };
      await save(game); return res.status(201).json(view(game, '1'));
    }
    const game = await read(gameId);
    if (!game) return res.status(404).json({ error: 'This game has expired. Create a new one.' });
    let player = playerFor(game, deviceId);
    if (action === 'join') {
      if (!player && !game.players[2]) {
        const joinKey = `guess-who-join:${game.id}`;
        const joined = await redis('set', joinKey, deviceId, 'NX', 'EX', 10);
        if (joined) {
          try {
            const latest = await read(gameId);
            if (latest && !latest.players[2]) {
              latest.players[2] = deviceId;
              latest.messages.push(message('Player 2 joined from their own phone. Pick your secret!', 'system'));
              await save(latest);
              return res.json(view(latest, '2'));
            }
          } finally {
            await redis('del', joinKey);
          }
        }
        const lockTtl = await redis('ttl', joinKey);
        if (lockTtl > 10) await redis('del', joinKey);
        const latest = await read(gameId);
        player = latest && playerFor(latest, deviceId);
        if (player) return res.json(view(latest, player));
        if (latest?.players[2]) return res.status(403).json({ error: 'This is a private 1v1 game and already has two devices.' });
        return res.status(409).json({ error: 'Joining the game. Please try again.' });
      }
      if (!player) return res.status(403).json({ error: 'This is a private 1v1 game and already has two devices.' });
      return res.json(view(game, player));
    }
    if (!player) return res.status(403).json({ error: 'This phone is not one of the two players.' });
    if (action === 'state') return res.json(view(game, player));
    if (action === 'secret') {
      const secretLock = `guess-who-secret:${game.id}`;
      if (!await redis('set', secretLock, deviceId, 'NX', 'EX', 10)) reject('Your opponent is locking in. Try again in a moment.', 409);
      try {
        const latest = await read(gameId);
        const latestPlayer = latest && playerFor(latest, deviceId);
        if (!latest || !latestPlayer) reject('This phone is not one of the two players.');
        const me = Number(latestPlayer);
        if (latest.secrets[me]) reject('Your secret is already locked.');
        if (!characters.has(payload.secret)) reject('Choose a character from this board.');
        latest.secrets[me] = payload.secret;
        latest.messages.push(message(`Player ${me} locked their mystery character.`, 'system'));
        if (latest.secrets[1] && latest.secrets[2] && !latest.startedAt) {
          latest.startedAt = Date.now();
          latest.currentPlayer = 1;
          latest.messages.push(message('Both players are ready. Game on — Player 1 goes first!', 'system'));
        }
        latest.messages = latest.messages.slice(-18);
        await save(latest);
        return res.json(view(latest, latestPlayer));
      } finally {
        await redis('del', secretLock);
      }
    }
    const me = Number(player), other = me === 1 ? 2 : 1;
    if (action === 'ask') {
      if (game.currentPlayer !== me || game.pendingQuestion || !game.secrets[1] || !game.secrets[2]) reject('Wait for your turn.');
      game.pendingQuestion = { text: payload.question, asker: me }; game.messages.push(message(`P${me}: ${payload.question}`, 'self'));
    } else if (action === 'answer') {
      if (!game.pendingQuestion || game.pendingQuestion.asker !== other) reject('There is no question for you.');
      game.messages.push(message(`P${me}: ${payload.answer === 'yes' ? 'Yes!' : 'Nope.'}`, 'answer')); const asker = game.pendingQuestion.asker; game.pendingQuestion = null;
      if (game.encorePlayer === asker) { game.messages.push(message(`Encore! P${asker} asks once more.`, 'system')); game.encorePlayer = null; } else { game.currentPlayer = me; game.triviaUsed[me] = false; game.twistUsed[me] = false; }
    } else if (action === 'eliminate') {
      if (game.currentPlayer !== me || game.pendingQuestion) reject('Wait for your turn.');
      const list = new Set(game.eliminated[me]); list.has(payload.name) ? list.delete(payload.name) : list.add(payload.name); game.eliminated[me] = [...list];
    } else if (action === 'trivia') {
      if (game.currentPlayer !== me || game.pendingQuestion || game.triviaUsed[me]) reject('Trivia is unavailable right now.');
      game.triviaUsed[me] = true; if (payload.correct) { game.bonuses[me]++; game.messages.push(message(`P${me} won a bonus clue!`, 'system')); } else { game.messages.push(message('Trivia miss — the other player gets the turn.', 'system')); game.currentPlayer = other; game.triviaUsed[other] = false; game.twistUsed[other] = false; }
    } else if (action === 'clue') {
      if (game.currentPlayer !== me || game.bonuses[me] < 1 || game.pendingQuestion) reject('No clue is available.');
      const details = characterInfo[game.secrets[other]]; if (!details) reject('Both players need to lock a secret first.');
      game.bonuses[me]--; game.messages.push(message(`Bonus clue for P${me}: Their mystery character has ${details[Math.floor(Math.random() * 2)]}.`, 'system'));
    } else if (action === 'twist') {
      if (game.currentPlayer !== me || game.pendingQuestion || game.twistUsed[me]) reject('Twists are unavailable right now.');
      game.twistUsed[me] = true; if (payload.kind === 'encore') game.encorePlayer = me; if (payload.kind === 'clue') game.bonuses[me]++; const details = characterInfo[game.secrets[other]]; if (payload.kind === 'theme' && details) game.messages.push(message(`Theme reveal: Player ${other}'s secret belongs to the ${details[2]} crew.`, 'system')); game.messages.push(message(`P${me} drew a twist card.`, 'system'));
    } else if (action === 'guess') {
      if (game.currentPlayer !== me || game.pendingQuestion) reject('Wait for your turn.');
      if (!characters.has(payload.name)) reject('Choose a character from this board.');
      if (payload.name === game.secrets[other]) { game.winner = me; game.messages.push(message(`P${me} guessed correctly and won!`, 'system')); } else { game.messages.push(message(`P${me} guessed ${payload.name}. Not this time.`, 'system')); game.currentPlayer = other; game.triviaUsed[other] = false; game.twistUsed[other] = false; }
    } else reject('Unknown game action.');
    game.messages = game.messages.slice(-18); await save(game); return res.json(view(game, player));
  } catch (error) { return res.status(error.status || 500).json({ error: error.message || 'Something went wrong.' }); }
}
