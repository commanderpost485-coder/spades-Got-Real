const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require( 'fs' );
const path = require( 'path' );
const PORT = process.env.PORT || 10000;
const rooms = new Map();
const clients = new Map();

function id(prefix='id') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}
function roomCode() {
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s='';
  for(let i=0;i<6;i++) s+=chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function createDeck() {
  const suits = ["S", "H", "D", "C"];
  const ranks = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
  const deck = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}
function send(ws,type,payload={}) {
  if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type,payload}));
}
function broadcast(room,type,payload={}) {
  for(const playerId of Object.values(room.seats)) {
    if(!playerId) continue;
    const client=clients.get(playerId);
    if(client) send(client.ws,type,payload);
  }
}
const INDEX = path.join(__dirname, 'index.html' );
const server=http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  if (req.url==='/'|| req.url==='/index.html' || req.url.startsWith('/?')) {
res.writeHead(200, {'Content-Type':'text/html;charset=utf-8'});
    return res.end(fs.readFileSync (INDEX));
  }
  if(req.url==='/heath') {
  res.writeHead(200,{'content-type':'application/json'});
  return res.end(JSON.stringify({ok:true,service:'spades-got-real'}));
  }
  res.writeHead(404, {'content-type':'application/json'});
  res.end(JSON.stringify({error:'not_found'}));
});

const wss=new WebSocket.WebSocketServer({server});

wss.on('connection',ws=>{
  const client={ws,playerId:null,roomCode:null,seat:null};

  ws.on('message',raw=>{
    let msg;
    try{msg=JSON.parse(raw.toString())}
    catch{return send(ws,'ERROR',{message:'Invalid JSON'});}

    const {type,payload={},playerId}=msg;

    if(type==='AUTH'){
      client.playerId=playerId||id('player');
      clients.set(client.playerId,client);
      return send(ws,'AUTH_OK',{playerId:client.playerId});
    }

    if(!client.playerId) return send(ws,'ERROR',{message:'Authenticate first'});

    if(type==='CREATE_ROOM'){
      let code=roomCode();
      while(rooms.has(code)) code=roomCode();
      const room =
{
  code,
  hostId: client.playerId,
  seats: {S: client.playerId, N:null, E:null, W:null},
  bidTurn: "N"
};
      rooms.set(code,room);
      client.roomCode=code;
      client.seat='S';
      return send(ws,'ROOM_CREATED',{roomCode:code,seat:'S',seats:room.seats});
    }

    if(type==='JOIN_ROOM'){
      const code=String(payload.roomCode||'').toUpperCase();
      const room=rooms.get(code);
      if(!room) return send(ws,'ERROR',{message:'Room not found'});
      const seat=['N','E','W'].find(s=>!room.seats[s]);
      if(!seat) return send(ws,'ERROR',{message:'Room full'});
      room.seats[seat]=client.playerId;
      client.roomCode=code;
      client.seat=seat;
     const joinPayload = {
  roomCode: code,
  playerId: client.playerId,
  seat: seat,
  seats: { ...room.seats }
};

broadcast(room, "PLAYER_JOINED", joinPayload);
send(ws, "PLAYER_JOINED", joinPayload);
return;
    }
    if (type === 'START_GAME') {
  const room = rooms.get(client.roomCode);

  if (!room) {
    return send(ws, 'ERROR', { message: 'No active room' });
  }

  if (client.playerId !== room.hostId) {
    return send(ws, 'ERROR', { message: 'Only the host can start the game' });
  }

  if (!room.seats.N || !room.seats.E || !room.seats.S || !room.seats.W) {
    return send(ws, 'ERROR', { message: 'All four players are required' });
  }

  broadcast(room, 'GAME_STARTED', {
    roomCode: room.code
  });

  return;
}                     
if(['BID_SUBMITTED','CARD_PLAYED'].includes(type)){
  const room = rooms.get(client.roomCode);
      if(payload.seat!==client.seat) return send(ws,'ERROR',{message:'Seat ownership mismatch'});
    if (type === "BID_SUBMITTED" && client.seat !== room.bidTurn) {
  return send(ws, "ERROR", { message: "Not your turn to bid" });
}
  if (type === "CARD_PLAYED" && client.seat !== room.playTurn) {
  return send(ws, "ERROR", {
    message: "Not your turn to play"
  });
}
  if (type === "BID_SUBMITTED") {
  room.bids = room.bids || {};
  room.bids[client.seat] = payload.bid;

  const nextBid = { N: "E", E: "W", W: "S", S: null };
    room.bidTurn = nextBid[client.seat];
  if (Object.keys(room.bids).length === 4) {
  room.playTurn = "N";
    const deck = createDeck();
room.hands = {
  N: deck.slice(0, 13),
  E: deck.slice(13, 26),
  W: deck.slice(26, 39),
  S: deck.slice(39, 52)
};
    for (const seat of ["N", "E", "W", "S"]) {
  const playerId = room.seats[seat];
  const player = clients.get(playerId);

  if (player) {
    send(player.ws, "HAND_DEALT", {
      seat,
      cards: room.hands[seat]
    });
  }
}
  broadcast(room, "BIDDING_COMPLETE", { bids: room.bids });
  }
return broadcast(room,type,{...payload,serverTs:Date.now()});
} 
  });

  ws.on('close', () => {
  if (client.playerId)
    clients.delete(client.playerId);

  const room = rooms.get(client.roomCode);

  if (room && client.seat) {
    room.seats[client.seat] = null;

    broadcast(room, 'PLAYER_DISCONNECTED', {
      playerId: client.playerId,
      seat: client.seat,
      seats: room.seats
    });
  }
});
});

server.listen(PORT,'0.0.0.0',()=>{
  console.log(`Spades Got Real listening on port ${PORT}`);
});


