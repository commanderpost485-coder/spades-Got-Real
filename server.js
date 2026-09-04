const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 10000;
const rooms = new Map();
const clients = new Map();
const BID_NEXT = { E: "N", N: "W", W: "S", S: null };
const PLAY_NEXT = { E: "N", N: "W", W: "S", S: "E" };
const PRIVATE_AVATARS = new Set([
  "avatar-south.png",
  "avatar-charly-sunglasses.png",
  "avatar-charly-hoodie.png"
]);

function isLillyName(name = "") {
  return ["lilly", "charly", "charleen"].includes(
    String(name).trim().toLowerCase()
  );
}

function cleanAvatar(file, playerName) {
  const avatar = String(file || "").replace(/[^a-z0-9_.-]/gi, "");
  if (!avatar) return "avatar-pj-photo.png";
  if (PRIVATE_AVATARS.has(avatar) && !isLillyName(playerName)) {
    return "avatar-pj-photo.png";
  }
  return avatar;
}
const TABLE_TALK = `
Let’s see how high you wanna go—jump, Judy, jump!
Get that weak shit off the table!
Time to run them spades!
Go play at the children’s table—you’re not ready for grown folk!
Time to ride that train to Boston!
We not trying to stop no floods—bid your damn hand!
Y’all picked the wrong table today!
This ain’t a game—this is a lesson!
Somebody call for backup!
We cookin’ now!
Keep dealing—I ain’t done yet!
Y’all just spectators at this point!
Sit back and watch how it’s done!
This table belongs to me!
Ain’t nobody safe!
I came to collect books, not feelings!
Another one! Keep ’em coming!
Y’all brought cards to a beatdown!
I’m handing out lessons for free!
Who’s next?!
Talk yo ish now!
BADAZZ SPADES in full effect!
MuthaSpades came to work!
Don’t get quiet now—keep that same energy!
I know somebody mad over there!
Pack it up—this table is closed!
Friendly fire!
Wrong enemy, partner!
You just robbed your own house!
Save that smoke for the other team!
Partner, why you cutting MuthaSpades?!
Class is in session—bring dat ass and let the whoppings commence!
Partner, we wear the same jersey!
Why are you fighting me and helping them?
That was our book, partner!
You just set your own teammate!
Partner, put the knife down!
Stop cutting your partner!
We have enough enemies across the table!
Partner, whose side are you on?
That card had our name on it!
You stole my book and gave them the next one!
Partner, read the table!
You cut me like I owed you money!
Quit shooting at your own team!
That was not the time to get fancy!
Partner, you just opened the door for them!
You threw away a guaranteed book!
Partner, I was already winning that!
Why waste a spade on your own partner?
You burned a spade for nothing!
That play hurt us more than them!
Partner, please pay attention!
You just helped the enemy!
Keep playing like that and we both going down!
That was a donation to the other team!
You took my book and handed them control!
Partner, I need you over here with me!
That card belonged in somebody else’s trick!
We are partners, not opponents!
You cutting me again? That’s personal!
I can’t fight three people at this table!
Partner, stop making their job easy!
Thank you for the gift!
That book belongs to us now!
Come get this work!
You should have stayed home today!
Don’t look at your partner—this was your fault!
That card couldn’t save you!
You played yourself!
Your bid is looking real suspicious!
All that talking and no books!
Where did your confidence go?
We about to set y’all!
Your books are drying up!
I hope you counted correctly!
That nil is in danger!
We see that nil hiding over there!
Your partner cannot save you!
You better protect that bid!
That book just changed addresses!
We taking everything that isn’t nailed down!
That little card was cute!
You thought that was going to win?
Not at this table!
Your high card just got introduced to a higher one!
That ace had a short life!
Your king just got dethroned!
The queen said move over!
That joker came to collect!
We pulling every spade out of your hand!
Your bid is about to become a wish!
You are one book away from trouble!
The set is coming—can you feel it?
Keep smiling; the scorekeeper knows the truth!
No mercy at the MuthaSpades table!
Y’all are officially on bag patrol!
Stop collecting bags and start collecting books!
That bid was pure fiction!
You ordered books we don’t have in stock!
The enemy is getting nervous!
Don’t blame the cards—blame that play!
That was a rookie move at a grown-folks table!
You talked big and played small!
We came for the win and stayed for the lesson!
MuthaSpades just shut that down!
`.trim().split("\n");

function id(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function roomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createDeck() {
  const deck = [];
  for (const suit of ["S", "H", "D", "C"]) {
    for (const rank of ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]) {
      deck.push({ suit, rank });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function send(ws, type, payload = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, payload }));
}

function broadcast(room, type, payload = {}) {
  const sent = new Set();
  for (const playerId of Object.values(room.seats)) {
    if (!playerId || sent.has(playerId)) continue;
    sent.add(playerId);
    const player = clients.get(playerId);
    if (player) send(player.ws, type, payload);
  }
}
function broadcastTableTalk(room) {
  let message;

  do {
    message =
      TABLE_TALK[Math.floor(Math.random() * TABLE_TALK.length)];
  } while (message === room.lastTableTalk);

  room.lastTableTalk = message;
  broadcast(room, "TABLE_TALK", { message });
}
function getTalkChoices(room) {
  return TABLE_TALK
    .filter(message => message !== room.lastTableTalk)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
}
function seatClient(room, seat) {
  return clients.get(room.seats[seat]);
}

function sendHand(room, seat, allowBid = false) {
  const player = seatClient(room, seat);
  if (player) send(player.ws, "HAND_DEALT", { seat, cards: room.hands[seat], allowBid });
}

function promptBidder(room) {
  if (!room.bidTurn) {
    room.playTurn = "E";
    for (const seat of ["N", "E", "S", "W"]) sendHand(room, seat, false);
    broadcast(room, "BIDDING_COMPLETE", {
      bids: room.bids,
      playTurn: room.playTurn,
      tricks: room.tricks,
      scores: room.scores,
      targetScore: room.targetScore
    });
    return;
  }
  broadcast(room, "BID_TURN", { seat: room.bidTurn, bids: room.bids });
  const player = seatClient(room, room.bidTurn);
  if (player) send(player.ws, "NIL_PROMPT", { seat: room.bidTurn });
}

function advanceBid(room) {
  room.bidTurn = BID_NEXT[room.bidTurn];
  promptBidder(room);
}

function startHand(room) {
  const deck = createDeck();
  room.hands = {
    N: deck.slice(0, 13), E: deck.slice(13, 26),
    W: deck.slice(26, 39), S: deck.slice(39, 52)
  };
  room.nilChoices = {};
  room.bids = {};
  room.tricks = { N: 0, E: 0, S: 0, W: 0 };
  room.currentTrick = [];
  room.bidTurn = "E";
  room.playTurn = null;
  room.handNumber = (room.handNumber || 0) + 1;
  broadcast(room, "HAND_STARTED", {
    handNumber: room.handNumber, scores: room.scores,
    targetScore: room.targetScore, bidTurn: room.bidTurn
  });
  promptBidder(room);
}

function numericBid(value) {
  if (value === "NIL") return 0;
  const bid = Number(value);
  return Number.isFinite(bid) ? bid : 0;
}

function finishHand(room) {
  const nsTricks = room.tricks.N + room.tricks.S;
  const ewTricks = room.tricks.E + room.tricks.W;
  const nsBid = numericBid(room.bids.N) + numericBid(room.bids.S);
  const ewBid = numericBid(room.bids.E) + numericBid(room.bids.W);
  const nilScore = seat => room.bids[seat] === "NIL" ? (room.tricks[seat] === 0 ? 100 : -100) : 0;
  const nsRegular = nsTricks >= nsBid ? nsBid * 10 + (nsTricks - nsBid) : -(nsBid * 10);
  const ewRegular = ewTricks >= ewBid ? ewBid * 10 + (ewTricks - ewBid) : -(ewBid * 10);
  const handScore = {
    NS: nsRegular + nilScore("N") + nilScore("S"),
    EW: ewRegular + nilScore("E") + nilScore("W")
  };
  room.scores.NS += handScore.NS;
  room.scores.EW += handScore.EW;
  const gameOver = room.scores.NS >= room.targetScore || room.scores.EW >= room.targetScore;
  const winner = room.scores.NS === room.scores.EW ? "Tie" : room.scores.NS > room.scores.EW ? "North/South" : "East/West";
  broadcast(room, "HAND_OVER", {
    tricks: room.tricks, bids: room.bids, handScore,
    totalScore: room.scores, targetScore: room.targetScore,
    gameOver, winner
  });
}

function sendGameState(room, client) {
  const totalTricks = room.tricks
    ? Object.values(room.tricks).reduce((sum, value) => sum + value, 0)
    : 0;

  let phase = "LOBBY";

  if (room.hands) {
    if (totalTricks === 13) phase = "HAND_OVER";
    else if (room.bidTurn) phase = "BIDDING";
    else phase = "PLAYING";
  }

  send(client.ws, "GAME_STATE", {
    roomCode: room.code,
    seat: client.seat,
    seats: { ...room.seats },
    avatars: { ...(room.avatars || {}) },
playerNames: { ...(room.playerNames || {}) },
    isHost: client.playerId === room.hostId,
    phase: phase,
    handNumber: room.handNumber || 0,
    scores: room.scores,
    targetScore: room.targetScore,
    bids: room.bids || {},
    tricks: room.tricks || { N: 0, E: 0, S: 0, W: 0 },
    bidTurn: room.bidTurn || null,
    playTurn: room.playTurn || null,
    nilChoice: room.nilChoices
      ? room.nilChoices[client.seat]
      : null,
    cards: room.hands
      ? room.hands[client.seat]
      : [],
    currentTrick: room.currentTrick || []
  });
}
const INDEX = path.join(__dirname, "index.html");
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url === "/" || req.url === "/index.html" || req.url.startsWith("/?")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(fs.readFileSync(INDEX));
  }
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, service: "spades-got-real" }));
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

const wss = new WebSocket.Server({ server });
wss.on("connection", ws => {
  const client = { ws, playerId: null, roomCode: null, seat: null };
  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch { return send(ws, "ERROR", { message: "Invalid JSON" }); }
    const { type, payload = {}, playerId } = msg;

    if (type === "AUTH") {
      client.playerId = playerId || id("player");
      clients.set(client.playerId, client);
      return send(ws, "AUTH_OK", { playerId: client.playerId });
    }
    if (!client.playerId) return send(ws, "ERROR", { message: "Authenticate first" });

    if (type === "CREATE_ROOM") {
      let code = roomCode();
      while (rooms.has(code)) code = roomCode();
      const room = {
  code,
  hostId: client.playerId,
  seats: { S: client.playerId, N: null, E: null, W: null },
  scores: { NS: 0, EW: 0 },
  targetScore: 500,
  handNumber: 0,
  avatars: {
    S: cleanAvatar(payload.avatar, payload.playerName),
    N: null,
    E: null,
    W: null
  },
  playerNames: {
    S: String(payload.playerName || "Lilly"),
    N: null,
    E: null,
    W: null
  }
};
      rooms.set(code, room);
      client.roomCode = code;
      client.seat = "S";
      return send(ws, "ROOM_CREATED", {
  roomCode: code,
  seat: "S",
  seats: room.seats,
  avatars: { ...room.avatars },
  playerNames: { ...room.playerNames }
});
    }

    if (type === "JOIN_ROOM") {
      const code = String(payload.roomCode || "").toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(ws, "ERROR", { message: "Room not found" });
      const seat = ["E", "N", "W"].find(value => !room.seats[value]);
      if (!seat) return send(ws, "ERROR", { message: "Room full" });
      room.seats[seat] = client.playerId;
      client.roomCode = code;
      client.seat = seat;
      room.seats[seat] = client.playerId;

room.avatars = room.avatars || { S: null, N: null, E: null, W: null };
room.playerNames = room.playerNames || { S: null, N: null, E: null, W: null };
room.avatars[seat] = cleanAvatar(payload.avatar, payload.playerName);
room.playerNames[seat] = String(payload.playerName || seat);
      
  broadcast(room, "PLAYER_JOINED", {
  roomCode: code,
  playerId: client.playerId,
  seat,
  seats: { ...room.seats },
  avatars: { ...room.avatars },
  playerNames: { ...room.playerNames }
});
  sendGameState(room, client);
return;
    }

    if (type === "REJOIN_ROOM") {
      const code = String(payload.roomCode || "").toUpperCase();
      const seat = payload.seat;
      const room = rooms.get(code);
      if (!room) return send(ws, "ERROR", { message: "Room not found" });
      if (!["N", "E", "S", "W"].includes(seat)) return send(ws, "ERROR", { message: "Invalid seat" });
      room.seats[seat] = client.playerId;
      client.roomCode = code;
      client.seat = seat;
      room.avatars = room.avatars || { S: null, N: null, E: null, W: null };
room.playerNames = room.playerNames || { S: null, N: null, E: null, W: null };
room.avatars[seat] = room.avatars[seat] || cleanAvatar(payload.avatar, payload.playerName);
room.playerNames[seat] = room.playerNames[seat] || String(payload.playerName || seat);
      if (seat === "S") room.hostId = client.playerId;
broadcast(room, "PLAYER_JOINED", {
  roomCode code, 
  playerId:
  client.playerId,
seat,
seats: { ...room.seats },
avatars: { ...room.avatars },
playerNames: { ...room.playerNames }
    });
    sendGameState(room, client);
    return;
    }

    const room = rooms.get(client.roomCode);
    if (!room) return send(ws, "ERROR", { message: "No active room" });
if (type === "GET_TALK_CHOICES") {
  return send(ws, "TABLE_TALK_CHOICES", {
    choices: getTalkChoices(room)
  });
}

if (type === "SEND_TABLE_TALK") {
  const message =
  String(payload.message || "").trim();

if (
  !message ||
  (!TABLE_TALK.includes(message) && message.length > 80)
) {
  return send(ws, "ERROR", {
    message: "Saying must be 1 to 80 characters"
  });
}
  room.lastTableTalk = message;
  broadcast(room, "TABLE_TALK", { message });
  return;
}
    if (type === "START_GAME" || type === "NEW_MATCH") {
      if (client.playerId !== room.hostId) return send(ws, "ERROR", { message: "Only the host can start" });
      if (!room.seats.N || !room.seats.E || !room.seats.S || !room.seats.W) {
        return send(ws, "ERROR", { message: "All four players are required" });
      }
      const target = Number(payload.targetScore);
      room.targetScore = [500, 750, 1000].includes(target) ? target : 500;
      room.scores = { NS: 0, EW: 0 };
      room.handNumber = 0;
      broadcast(room, "GAME_STARTED", { roomCode: room.code, targetScore: room.targetScore });
      startHand(room);
      return;
    }

    if (type === "NEXT_HAND") {
      if (client.playerId !== room.hostId) return send(ws, "ERROR", { message: "Only the host can start the next hand" });
      if (room.scores.NS >= room.targetScore || room.scores.EW >= room.targetScore) {
        return send(ws, "ERROR", { message: "Match is over. Start a new match." });
      }
      startHand(room);
      return;
    }

    if (payload.seat && payload.seat !== client.seat) return send(ws, "ERROR", { message: "Seat ownership mismatch" });

    if (type === "NIL_CHOICE") {
      if (client.seat !== room.bidTurn) return send(ws, "ERROR", { message: `${room.bidTurn} bids first` });
      if (!["NIL", "SEE_CARDS"].includes(payload.choice)) return send(ws, "ERROR", { message: "Invalid choice" });
      room.nilChoices[client.seat] = payload.choice;
      if (payload.choice === "NIL") {
        room.bids[client.seat] = "NIL";
        send(ws, "NIL_LOCKED", { seat: client.seat });
        broadcast(room, "BID_SUBMITTED", { seat: client.seat, bid: "NIL", bids: room.bids });
        advanceBid(room);
      } else {
        sendHand(room, client.seat, true);
      }
      return;
    }

    if (type === "BID_SUBMITTED") {
      if (client.seat !== room.bidTurn) return send(ws, "ERROR", { message: `${room.bidTurn} bids first` });
      if (room.nilChoices[client.seat] !== "SEE_CARDS") return send(ws, "ERROR", { message: "Choose NIL or PLAY first" });
      const bid = Number(payload.bid);
      if (!Number.isInteger(bid) || bid < 0 || bid > 13) return send(ws, "ERROR", { message: "Invalid bid" });
      room.bids[client.seat] = bid;
      broadcast(room, "BID_SUBMITTED", { seat: client.seat, bid, bids: room.bids });
      advanceBid(room);
      return;
    }

    if (type === "CARD_PLAYED") {
      if (room.bidTurn) return send(ws, "ERROR", { message: "Bidding is not finished" });
      if (client.seat !== room.playTurn) return send(ws, "ERROR", { message: `It is ${room.playTurn}'s turn` });
      const hand = room.hands[client.seat];
      const cardIndex = hand.findIndex(card => card.rank === payload.card.rank && card.suit === payload.card.suit);
      if (cardIndex === -1) return send(ws, "ERROR", { message: "Card not in your hand" });
      if (room.currentTrick.length) {
        const leadSuit = room.currentTrick[0].card.suit;
        const hasLeadSuit = hand.some(card => card.suit === leadSuit);
        if (hasLeadSuit && payload.card.suit !== leadSuit) return send(ws, "ERROR", { message: "You must follow suit" });
}
        
        const playedCard =
  hand.splice(cardIndex, 1)[0];

const playStyle =
  payload.playStyle === "throw" ? "throw" : "normal";

room.currentTrick.push({ seat:
  client.seat, card: playedCard });
      let handOver = false;
      if (room.currentTrick.length < 4) {
        room.playTurn = PLAY_NEXT[client.seat];
      } else {
        const leadSuit = room.currentTrick[0].card.suit;
        const values = { "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14 };
        let winner = room.currentTrick[0];
        for (const play of room.currentTrick.slice(1)) {
          const winnerSuit = winner.card.suit;
          const playSuit = play.card.suit;
          if ((winnerSuit === "S" && playSuit === "S" && values[play.card.rank] > values[winner.card.rank]) ||
              (winnerSuit !== "S" && playSuit === "S") ||
              (winnerSuit !== "S" && playSuit === leadSuit && values[play.card.rank] > values[winner.card.rank])) winner = play;
        }
        room.tricks[winner.seat]++;
        room.playTurn = winner.seat;
        room.currentTrick = [];
        handOver = Object.values(room.tricks).reduce((sum, value) => sum + value, 0) === 13;
      }
      sendHand(room, client.seat, false);
      broadcast(room, "CARD_PLAYED", {
      seat: client.seat,
      card: playedCard,
      playStyle,
      nextTurn: room.playTurn,
      tricks: room.tricks,
      bids: room.bids
      });
      if (handOver) finishHand(room);
return;
}

send(ws, "ERROR", { message: "Unknown action" });
});

  ws.on("close", () => {
    if (client.playerId) clients.delete(client.playerId);
    const room = rooms.get(client.roomCode);
    if (room && client.seat && room.seats[client.seat] === client.playerId) {
      room.seats[client.seat] = null;
      broadcast(room, "PLAYER_DISCONNECTED", {
  seat: client.seat,
  seats: room.seats,
  avatars: { ...(room.avatars || {}) },
  playerNames: { ...(room.playerNames || {}) }
});
  });
});

server.listen(PORT, "0.0.0.0", () => console.log(`Spades Got Real listening on port ${PORT}`));
