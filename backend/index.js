const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST"],
  },
});

// Game state storage
const rooms = new Map();
const players = new Map();

// Word lists for different roles
const WORD_PAIRS = [
  { shadow: "Vampire", signal: "Garlic" },
  { shadow: "Alien", signal: "Spaceship" },
  { shadow: "Impostor", signal: "Crewmate" },
  { shadow: "Werewolf", signal: "Silver" },
  { shadow: "Robot", signal: "Human" },
  { shadow: "Ghost", signal: "Séance" },
  { shadow: "Spy", signal: "Password" },
  { shadow: "Doppelganger", signal: "Mirror" },
];

const generateRoomCode = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Create a new room
  socket.on("createRoom", (playerName) => {
    const roomCode = generateRoomCode();

    rooms.set(roomCode, {
      code: roomCode,
      players: new Map(),
      gameState: "lobby",
      round: 1,
      maxPlayers: 6,
      hostId: socket.id,
      wordPair: null,
      votes: new Map(),
      revealedPlayers: new Set(),
    });

    const player = {
      id: socket.id,
      name: playerName,
      room: roomCode,
      role: null,
      word: null,
      isReady: false,
      score: 0,
    };

    players.set(socket.id, player);
    rooms.get(roomCode).players.set(socket.id, player);

    socket.join(roomCode);
    socket.emit("roomCreated", { roomCode, player });
    io.to(roomCode).emit("roomUpdated", getRoomData(roomCode));
  });

  // Join existing room
  socket.on("joinRoom", ({ roomCode, playerName }) => {
    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit("error", "Room not found");
      return;
    }

    if (room.players.size >= room.maxPlayers) {
      socket.emit("error", "Room is full");
      return;
    }

    if (room.gameState !== "lobby") {
      socket.emit("error", "Game already in progress");
      return;
    }

    const player = {
      id: socket.id,
      name: playerName,
      room: roomCode,
      role: null,
      word: null,
      isReady: false,
      score: 0,
    };

    players.set(socket.id, player);
    room.players.set(socket.id, player);

    socket.join(roomCode);
    socket.emit("roomJoined", { roomCode, player });
    io.to(roomCode).emit("roomUpdated", getRoomData(roomCode));
  });

  // Start game
  socket.on("startGame", () => {
    const player = players.get(socket.id);
    if (!player) return;

    const room = rooms.get(player.room);
    if (!room || room.hostId !== socket.id) return;

    // Assign roles and words
    const playersArray = Array.from(room.players.values());
    const shadowPlayerIndex = Math.floor(Math.random() * playersArray.length);
    const wordPair = WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];

    room.wordPair = wordPair;
    room.gameState = "assigning";

    // Assign roles and words
    playersArray.forEach((p, index) => {
      if (index === shadowPlayerIndex) {
        p.role = "shadow";
        p.word = wordPair.shadow;
      } else {
        p.role = "signal";
        p.word = wordPair.signal;
      }
      p.isReady = false;
      room.players.set(p.id, p);
      players.set(p.id, p);
    });

    // Notify players of their roles
    playersArray.forEach((p) => {
      io.to(p.id).emit("roleAssigned", {
        role: p.role,
        word: p.word,
        players: getRoomData(player.room).players.map((player) => ({
          id: player.id,
          name: player.name,
          isReady: player.isReady,
        })),
      });
    });

    io.to(player.room).emit("gameStarted", getRoomData(player.room));
  });

  // Player ready for discussion
  socket.on("playerReady", () => {
    const player = players.get(socket.id);
    if (!player) return;

    const room = rooms.get(player.room);
    if (!room) return;

    player.isReady = true;
    room.players.set(socket.id, player);

    // Check if all players are ready
    const allReady = Array.from(room.players.values()).every((p) => p.isReady);

    if (allReady) {
      room.gameState = "discussion";
      room.votes.clear();
      io.to(player.room).emit("discussionStarted", getRoomData(player.room));
    } else {
      io.to(player.room).emit("roomUpdated", getRoomData(player.room));
    }
  });

  // Submit vote
  socket.on("submitVote", (targetPlayerId) => {
    const player = players.get(socket.id);
    if (!player) return;

    const room = rooms.get(player.room);
    if (!room || room.gameState !== "discussion") return;

    room.votes.set(socket.id, targetPlayerId);

    // Check if all votes are in
    if (room.votes.size === room.players.size) {
      room.gameState = "results";
      calculateResults(room);
      io.to(player.room).emit("roundResults", getRoomData(player.room));
    } else {
      io.to(player.room).emit("voteReceived", {
        voterId: socket.id,
        remainingVotes: room.players.size - room.votes.size,
      });
    }
  });

  // Next round
  socket.on("nextRound", () => {
    const player = players.get(socket.id);
    if (!player) return;

    const room = rooms.get(player.room);
    if (!room || room.hostId !== socket.id) return;

    room.round++;
    room.gameState = "lobby";
    room.revealedPlayers.clear();
    room.votes.clear();

    // Reset player states
    room.players.forEach((p) => {
      p.role = null;
      p.word = null;
      p.isReady = false;
    });

    io.to(player.room).emit("roundAdvanced", getRoomData(player.room));
  });

  // Reveal role
  socket.on("revealRole", (targetPlayerId) => {
    const player = players.get(socket.id);
    if (!player) return;

    const room = rooms.get(player.room);
    if (!room || room.hostId !== socket.id) return;

    room.revealedPlayers.add(targetPlayerId);
    io.to(player.room).emit("roleRevealed", {
      playerId: targetPlayerId,
      revealedPlayers: Array.from(room.revealedPlayers),
    });
  });

  // Leave room
  socket.on("leaveRoom", () => {
    const player = players.get(socket.id);
    if (!player) return;

    const room = rooms.get(player.room);
    if (!room) return;

    room.players.delete(socket.id);
    players.delete(socket.id);

    socket.leave(player.room);

    // If room is empty, delete it
    if (room.players.size === 0) {
      rooms.delete(player.room);
    } else {
      // Assign new host if needed
      if (room.hostId === socket.id) {
        const newHost = room.players.keys().next().value;
        room.hostId = newHost;
      }
      io.to(player.room).emit("roomUpdated", getRoomData(player.room));
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    const player = players.get(socket.id);
    if (!player) return;

    const room = rooms.get(player.room);
    if (!room) return;

    room.players.delete(socket.id);
    players.delete(socket.id);

    // If room is empty, delete it
    if (room.players.size === 0) {
      rooms.delete(player.room);
    } else {
      // Assign new host if needed
      if (room.hostId === socket.id) {
        const newHost = room.players.keys().next().value;
        room.hostId = newHost;
      }
      io.to(player.room).emit("roomUpdated", getRoomData(player.room));
    }

    console.log("User disconnected:", socket.id);
  });

  // Helper functions
  const getRoomData = (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return null;

    return {
      code: room.code,
      players: Array.from(room.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        isReady: p.isReady,
        score: p.score,
        role:
          room.gameState === "results" || room.revealedPlayers.has(p.id)
            ? p.role
            : null,
        word:
          room.gameState === "results" || room.revealedPlayers.has(p.id)
            ? p.word
            : null,
      })),
      gameState: room.gameState,
      round: room.round,
      maxPlayers: room.maxPlayers,
      hostId: room.hostId,
      wordPair: room.gameState === "results" ? room.wordPair : null,
      votes: room.votes.size,
      revealedPlayers: Array.from(room.revealedPlayers),
    };
  };

  const calculateResults = (room) => {
    const voteCount = new Map();

    // Count votes
    room.votes.forEach((targetId) => {
      voteCount.set(targetId, (voteCount.get(targetId) || 0) + 1);
    });

    // Find player with most votes
    let maxVotes = 0;
    let eliminatedPlayerId = null;

    voteCount.forEach((votes, playerId) => {
      if (votes > maxVotes) {
        maxVotes = votes;
        eliminatedPlayerId = playerId;
      }
    });

    // Determine if shadow was caught
    const eliminatedPlayer = room.players.get(eliminatedPlayerId);
    const shadowCaught = eliminatedPlayer && eliminatedPlayer.role === "shadow";

    // Update scores
    room.players.forEach((player) => {
      if (shadowCaught && player.role === "signal") {
        player.score += 100;
      } else if (!shadowCaught && player.role === "shadow") {
        player.score += 200;
      }
    });

    room.results = {
      eliminatedPlayerId,
      shadowCaught,
      voteCount: Array.from(voteCount.entries()),
    };
  };
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
