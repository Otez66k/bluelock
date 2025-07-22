import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
dotenv.config({ path: "../.env" });

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const port = process.env.PORT || 3000;

app.use(express.json());
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

// Serve static files from client/dist
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "../client/dist")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

// --- Discord OAuth route (keep as is) ---
app.post("/api/token", async (req, res) => {
  const response = await fetch(`https://discord.com/api/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.VITE_DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code: req.body.code,
    }),
  });
  const { access_token } = await response.json();
  res.send({ access_token });
});

// --- Multiplayer state ---
const lobbies = {}; // { [instanceId]: { teams: { left: [], right: [] }, ... } }

io.on("connection", (socket) => {
  console.log(`[SOCKET CONNECTED] id=${socket.id}`);
  let instanceId = null;
  let playerId = socket.id;

  socket.on("join_instance", (id) => {
    instanceId = id;
    socket.join(instanceId);
    if (!lobbies[instanceId]) {
      lobbies[instanceId] = {
        teams: { left: [], right: [] },
        started: false,
        selectedTeams: { left: 0, right: 1 },
      };
      console.log(`[LOBBY CREATED] instanceId=${instanceId}`);
    }
    console.log(`[JOIN_INSTANCE] socket=${socket.id} instanceId=${id}`);
    io.to(instanceId).emit("lobby_state", lobbies[instanceId]);
    console.log(`[EMIT] lobby_state to instanceId=${instanceId}`, lobbies[instanceId]);
  });

  socket.on("request_lobby_state", () => {
    if (instanceId && lobbies[instanceId]) {
      io.to(instanceId).emit("lobby_state", lobbies[instanceId]);
    }
  });

  socket.on("join_team", ({ team, name, avatar, id }) => {
    if (!instanceId || !lobbies[instanceId]) return;
    // Remove from both teams first
    ["left", "right"].forEach(t => {
      lobbies[instanceId].teams[t] = lobbies[instanceId].teams[t].filter(p => p.id !== id);
    });
    // Add to selected team if space
    if (lobbies[instanceId].teams[team].length < 4) {
      lobbies[instanceId].teams[team].push({ name, avatar, id, character: null });
    }
    io.to(instanceId).emit("lobby_state", lobbies[instanceId]);
  });

  socket.on("select_character", ({ team, character }) => {
    if (!instanceId || !lobbies[instanceId]) return;
    let player = lobbies[instanceId].teams[team].find(p => p.id === playerId);
    if (player) player.character = character;
    io.to(instanceId).emit("lobby_state", lobbies[instanceId]);
  });

  socket.on("start_game", () => {
    if (!instanceId || !lobbies[instanceId]) return;
    lobbies[instanceId].started = true;
    console.log(`[GAME STARTED] instanceId=${instanceId}`);
    io.to(instanceId).emit("game_started");
  });

  socket.on("disconnect", async () => {
    if (!instanceId || !lobbies[instanceId]) return;
    ["left", "right"].forEach(t => {
      lobbies[instanceId].teams[t] = lobbies[instanceId].teams[t].filter(p => p.id !== playerId);
    });
    io.to(instanceId).emit("lobby_state", lobbies[instanceId]);
    // Wait a tick for socket.io to update room state
    setTimeout(() => {
      const room = io.sockets.adapter.rooms.get(instanceId);
      if (!room || room.size === 0) {
        console.log(`[LOBBY DELETED] instanceId=${instanceId}`);
        delete lobbies[instanceId];
      }
    }, 100);
  });
});

server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
