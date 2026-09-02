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
        code, hostId: client.playerId,
        seats: { S: client.playerId, N: null, E: null, W: null },
        scores: { NS: 0, EW: 0 }, targetScore: 500, handNumber: 0
      };
      rooms.set(code, room);
      client.roomCode = code;
      client.seat = "S";
      return send(ws, "ROOM_CREATED", { roomCode: code, seat: "S", seats: room.seats });
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
      return broadcast(room, "PLAYER_JOINED", {
        roomCode: code, playerId: client.playerId,
        seat, seats: { ...room.seats }
      });
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
      if (seat === "S") room.hostId = client.playerId;
      return broadcast(room, "PLAYER_JOINED", {
        roomCode: code, playerId: client.playerId,
        seat, seats: { ...room.seats }
      });
    }

    const room = rooms.get(client.roomCode);
    if (!room) return send(ws, "ERROR", { message: "No active room" });

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
      const playedCard = hand.splice(cardIndex, 1)[0];
      room.currentTrick.push({ seat: client.seat, card: playedCard });
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
        seat: client.seat, card: playedCard,
        nextTurn: room.playTurn, tricks: room.tricks, bids: room.bids
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
      broadcast(room, "PLAYER_DISCONNECTED", { seat: client.seat, seats: room.seats });
    }
  });
});

server.listen(PORT, "0.0.0.0", () => console.log(`Spades Got Real listening on port ${PORT}`));
