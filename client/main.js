// 2D Soccer Game (Top-Down)
// Completely replaces previous 3D code
import './style.css';
import { DiscordSDK, Events } from "@discord/embedded-app-sdk";

// Game constants
const GOAL_SCORE = 5;
const FIELD_WIDTH = 1800;
const FIELD_HEIGHT = 1000;
const GOAL_WIDTH = 220;
const GOAL_HEIGHT = 260;
const PLAYER_SIZE = 30;
const BALL_BOUNCE = 0.85;
const BALL_SIZE = 22;
const PLAYER_SPEED = 1.25;
const PLAYER_RUN_SPEED = 2.0;
const PLAYER_HOP_HEIGHT = 6;
const PLAYER_HOP_FREQ = 0.18;
const DIRT_TRAIL_LENGTH = 10;
const BALL_FRICTION = 0.985;
const PLAYER_FRICTION = 0.85;
const KICK_STRENGTH = 7.5;
const AI_SPEED = 2.0;
const COLORS = {
  field: '#a6e060',
  line: '#d6f7b6',
  ball: '#fff',
  player: '#e74c3c',
  player2: '#3498db',
  controlled: '#fff',
  ai: '#e74c3c',
  ai2: '#3498db',
  goal: '#fff',
  score: '#d6f7b6',
};

const CHARACTERS = [
  "Isagi Yoichi",
  "Itoshi Rin",
  "Meguru Bachira",
  "Oliver Aiku",
  "Gin Gagamaru",
  "Seishirou Nagi"
];

const CHARACTER_AVATARS = {
  "Isagi Yoichi": "/media/characters/Isagi_Yoichi.jpeg",
  "Itoshi Rin": "/media/characters/Itoshi_Rin.png",
  "Meguru Bachira": "/media/characters/Meguru_Bachira.png",
  "Oliver Aiku": "/media/characters/Oliver_Aiku.png",
  "Gin Gagamaru": "/media/characters/Gin_Gagamaru.png",
  "Seishirou Nagi": "/media/characters/Seishiro_Nagi.png"
};

const isDiscord = window.location.hostname.endsWith("discordsays.com");
const CLIENT_ID = "1396595218211668049";
const discordSdk = new DiscordSDK(CLIENT_ID);
let instanceId = isDiscord ? discordSdk.instanceId : "local-instance";
console.log("[DiscordSDK] instanceId:", instanceId);

let myUserId = null;
let myUsername = null;
let myAvatar = null;

async function authenticateDiscordUser() {
  if (isDiscord) {
    await discordSdk.ready();
    // Use OAuth2 implicit grant or other method to get access token if needed
    // For demo, try to authenticate anonymously
    try {
      const { user } = await discordSdk.commands.authenticate({});
      myUserId = user.id;
      myUsername = user.global_name ?? `${user.username}#${user.discriminator}`;
      if (user.avatar) {
        myAvatar = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`;
      } else {
        const defaultAvatarIndex = (BigInt(user.id) >> 22n) % 6n;
        myAvatar = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
      }
    } catch (e) {
      // Fallback if authentication fails
      myUserId = Math.random().toString(36).slice(2);
      myUsername = "Player" + Math.floor(Math.random() * 1000);
      myAvatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
  } else {
    myUserId = Math.random().toString(36).slice(2);
    myUsername = "Player" + Math.floor(Math.random() * 1000);
    myAvatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
  }
}

// Lobby state
let lobby = null;
let myTeam = null;
let myCharacter = null;

// For local dev, use in-memory state
let localState = {
  teams: { left: [], right: [] },
  started: false,
  selectedTeams: { left: 0, right: 1 },
};

// --- State Sync Functions ---
async function setLobbyState(newState) {
  lobby = newState;
  if (isDiscord) {
    await discordSdk.commands.setActivityInstanceState(lobby);
  } else {
    localState = { ...newState };
    onLobbyState(localState);
  }
}

function onLobbyState(state) {
  lobby = state;
  if (lobby.started) {
    startGameWithTeams();
  } else {
    renderLobby();
  }
}

// --- Subscribe to state updates ---
if (isDiscord) {
  discordSdk.subscribe('ACTIVITY_INSTANCE_STATE_UPDATE', ({ state }) => {
    if (state) onLobbyState(state);
  });
} else {
  // For local dev, just use localState
  onLobbyState(localState);
}

// --- UI and Lobby Logic ---
function getDiscordUser() {
  return {
    username: myUsername,
    avatar: myAvatar,
    id: myUserId
  };
}

function joinTeam(team, user) {
  if (!lobby) return;
  ["left", "right"].forEach(t => {
    lobby.teams[t] = lobby.teams[t].filter(p => p.id !== user.id);
  });
  if (lobby.teams[team].length < 4) {
    lobby.teams[team].push({ name: user.username, avatar: user.avatar, id: user.id, character: null });
  }
  setLobbyState({ ...lobby });
  myTeam = team;
}

function selectCharacter(team, character, userId) {
  if (!lobby) return;
  let player = lobby.teams[team].find(p => p.id === userId);
  if (player) player.character = character;
  setLobbyState({ ...lobby });
  myCharacter = character;
}

function startGame() {
  if (!lobby) return;
  lobby.started = true;
  setLobbyState({ ...lobby });
}

const TEAM_LIST = [
  { name: "Bastard Munchen", logo: "/media/teams/b_munchen_logo.png" },
  { name: "Manshine City", logo: "/media/teams/m_city_logo.png" },
  { name: "Ubers", logo: "/media/teams/ubers_logo.png" },
  { name: "FC Barcha", logo: "/media/teams/fc_barcha_logo.png" },
  { name: "Re Al", logo: "/media/teams/re_al_logo.png" },
  { name: "PxG", logo: "/media/teams/pxg_logo.png" }
];

let selectedTeams = null; // { left: teamObj, right: teamObj }
// Placeholder Discord info (replace with real info from Discord SDK or OAuth)

// Always show the lobby with two teams, allow changing teams with arrows, and joining either team.
selectedTeams = { left: TEAM_LIST[0], right: TEAM_LIST[1] };
let teamIdx = { left: 0, right: 1 };

function renderLobby() {
  document.body.innerHTML = `
    <div class="lobby-container">
      <div class="lobby-header">JOIN A TEAM</div>
      <div class="lobby-main">
        <div class="lobby-team">
          <button class="team-arrow fancy-arrow" id="leftTeamPrev"><span>&#8592;</span></button>
          <div>
            <img src="${TEAM_LIST[teamIdx.left].logo}" class="team-flag-large">
            <div class="lobby-team-name">${TEAM_LIST[teamIdx.left].name}</div>
          </div>
          <button class="team-arrow fancy-arrow" id="leftTeamNext"><span>&#8594;</span></button>
          <div class="lobby-slots">
            ${renderSlots("left")}
          </div>
        </div>
        <div class="lobby-center">
          <div class="lobby-logo">Bobble<br>Lock</div>
        </div>
        <div class="lobby-team">
          <button class="team-arrow fancy-arrow" id="rightTeamPrev"><span>&#8592;</span></button>
          <div>
            <img src="${TEAM_LIST[teamIdx.right].logo}" class="team-flag-large">
            <div class="lobby-team-name right">${TEAM_LIST[teamIdx.right].name}</div>
          </div>
          <button class="team-arrow fancy-arrow" id="rightTeamNext"><span>&#8594;</span></button>
          <div class="lobby-slots">
            ${renderSlots("right")}
          </div>
        </div>
      </div>
      <div class="character-select-row">
        ${renderCharacterCircles()}
      </div>
      <button class="lobby-start-btn" id="startBtn" ${lobby.teams.left.length === 0 || lobby.teams.right.length === 0 ? "disabled" : ""}>Start Game</button>
    </div>
  `;
  document.getElementById('leftTeamPrev').onclick = () => {
    teamIdx.left = (teamIdx.left - 1 + TEAM_LIST.length) % TEAM_LIST.length;
    if (teamIdx.left === teamIdx.right) teamIdx.left = (teamIdx.left - 1 + TEAM_LIST.length) % TEAM_LIST.length;
    selectedTeams.left = TEAM_LIST[teamIdx.left];
    renderLobby();
  };
  document.getElementById('leftTeamNext').onclick = () => {
    teamIdx.left = (teamIdx.left + 1) % TEAM_LIST.length;
    if (teamIdx.left === teamIdx.right) teamIdx.left = (teamIdx.left + 1) % TEAM_LIST.length;
    selectedTeams.left = TEAM_LIST[teamIdx.left];
    renderLobby();
  };
  document.getElementById('rightTeamPrev').onclick = () => {
    teamIdx.right = (teamIdx.right - 1 + TEAM_LIST.length) % TEAM_LIST.length;
    if (teamIdx.right === teamIdx.left) teamIdx.right = (teamIdx.right - 1 + TEAM_LIST.length) % TEAM_LIST.length;
    selectedTeams.right = TEAM_LIST[teamIdx.right];
    renderLobby();
  };
  document.getElementById('rightTeamNext').onclick = () => {
    teamIdx.right = (teamIdx.right + 1) % TEAM_LIST.length;
    if (teamIdx.right === teamIdx.left) teamIdx.right = (teamIdx.right + 1) % TEAM_LIST.length;
    selectedTeams.right = TEAM_LIST[teamIdx.right];
    renderLobby();
  };
  document.querySelectorAll(".lobby-slot.join").forEach(btn => {
    btn.onclick = () => {
      const team = btn.dataset.team;
      const user = getDiscordUser();
      joinTeam(team, user);
    };
  });
  document.querySelectorAll(".character-circle").forEach(circle => {
    if (!circle.classList.contains('disabled')) {
      circle.onclick = () => {
        const character = circle.dataset.character;
        selectCharacter(myTeam, character, myUserId);
      };
    }
  });
  document.getElementById("startBtn").onclick = () => {
    startGame();
  };
}

function renderSlots(team) {
  let slots = lobby.teams[team];
  let html = "";
  for (let i = 0; i < 4; i++) {
    if (slots[i]) {
      html += `<div class="lobby-slot filled">
        <img src="${slots[i].avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="player-avatar">
        <div class="player-username">${slots[i].name}</div>
      </div>`;
    } else if (!lobby.teams.left.concat(lobby.teams.right).find(p => p.id === myUserId)) {
      html += `<div class="lobby-slot join" data-team="${team}">+</div>`;
    } else {
      html += `<div class="lobby-slot"></div>`;
    }
  }
  return html;
}

function renderCharacterCircles() {
  if (!myTeam) return '';
  const taken = lobby.teams[myTeam].map(p => p.character);
  return CHARACTERS.map(char => {
    const isTaken = taken.includes(char) && myCharacter !== char;
    const isMe = myCharacter === char;
    return `<div class="character-circle${isTaken ? ' disabled' : ''}${isMe ? ' selected' : ''}" data-character="${char}">
      <img src="${CHARACTER_AVATARS[char] || ''}" class="char-avatar-img" alt="${char}">
      <span class="char-label">${char}</span>
    </div>`;
  }).join('');
}

function charSelectDropdown(team) {
  // Only show characters not already picked on this team
  const taken = lobby.teams[team].map(p => p.character);
  return `<div class='char-select-fancy'><span class='char-avatar-placeholder'></span><select class='lobby-char-select'><option value=''>Pick Character</option>${CHARACTERS.filter(c => !taken.includes(c)).map(c => `<option value='${c}'>${c}</option>`).join("")}</select></div>`;
}

function fancyCharSelect(character, isMe) {
  // Placeholder avatar, will be replaced with real images later
  return `<div class='char-select-fancy'><span class='char-avatar-placeholder'></span><span class='char-name${isMe ? ' me' : ''}'>${character}</span></div>`;
}

function startGameWithTeams() {
  document.body.innerHTML = "";
  document.body.appendChild(canvas);
}

function startLobbyFlow() {
  // This is your main entry point for the lobby
  // socket.emit("request_lobby_state"); // or whatever triggers the lobby state fetch
}

// --- Socket.IO connection setup (already handled above) ---

// --- InstanceId logic for Discord Activity and local/dev ---
// --- Enhanced Debug Statements ---
console.log('[DEBUG] Hostname:', window.location.hostname);
console.log('[DEBUG] DiscordSDK:', window.DiscordSDK);

// --- Main Entry Point ---
(async function main() {
  await authenticateDiscordUser();
  // Now you can safely use myUserId, myUsername, myAvatar
  // The rest of your game logic, rendering, and controls remain unchanged
})();

const canvas = document.createElement('canvas');
canvas.width = FIELD_WIDTH;
canvas.height = FIELD_HEIGHT;
canvas.style.background = COLORS.field;
document.body.innerHTML = '';
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

// Game State
let player = {
  x: FIELD_WIDTH * 0.25,
  y: FIELD_HEIGHT / 2,
  vx: 0,
  vy: 0,
  color: COLORS.player,
  controlled: true,
  kicking: false,
  kickTimer: 0,
  hopPhase: 0,
  dirtTrail: [],
  angle: 0, // Added for dribbling
};
let aiPlayers = [
  { x: FIELD_WIDTH * 0.75, y: FIELD_HEIGHT / 2 - 60, vx: 0, vy: 0, color: COLORS.ai2, hopPhase: 0, dirtTrail: [], angle: 0 },
  { x: FIELD_WIDTH * 0.75, y: FIELD_HEIGHT / 2 + 60, vx: 0, vy: 0, color: COLORS.ai2, hopPhase: 0, dirtTrail: [], angle: 0 },
];
let ball = {
  x: FIELD_WIDTH / 2,
  y: FIELD_HEIGHT / 2,
  vx: 0,
  vy: 0,
  z: 0, // vertical height
  vz: 0, // vertical velocity
};
const BALL_GRAVITY = -0.7;
const BALL_BOUNCE_Z = 0.7;
let keys = {};
let score = { left: 0, right: 0 };
let goalAnim = {
  active: false,
  color: '',
  textX: FIELD_WIDTH,
  team: '',
  timer: 0,
};
let gameOver = false;

let mouse = { x: 0, y: 0, left: false, right: false };
let possession = null; // player or ai object who has the ball
let powerShot = { charging: false, power: 0, max: 32 };
let passAim = { aiming: false, target: { x: 0, y: 0 } };
let tackleAnim = { active: false, x: 0, y: 0, timer: 0 };

// Controls
window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  // Only Space triggers kick animation
  if (e.code === 'Space') {
    player.kicking = true;
    player.kickTimer = 8; // frames
  }
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
// Remove canvas.addEventListener for mouse events, use window instead
window.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
  mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
});
window.addEventListener('mousedown', e => {
  if (e.button === 0) { // left
    mouse.left = true;
    if (possession === player) {
      powerShot.charging = true;
      powerShot.power = 0;
    }
  }
  if (e.button === 2) { // right
    mouse.right = true;
    if (possession === player) {
      passAim.aiming = true;
      passAim.target.x = mouse.x;
      passAim.target.y = mouse.y;
    }
  }
});
window.addEventListener('mouseup', e => {
  if (e.button === 0) { // left
    mouse.left = false;
    if (possession === player && powerShot.charging) {
      // Power shot (reduced strength)
      let dx = mouse.x - player.x;
      let dy = mouse.y - player.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        dx /= dist; dy /= dist;
        ball.vx = dx * (2.5 + powerShot.power * 0.25); // much less powerful
        ball.vy = dy * (2.5 + powerShot.power * 0.25);
        ball.vz = 5 + powerShot.power * 0.2;
      }
      possession = null;
      powerShot.charging = false;
      powerShot.power = 0;
    }
  }
  if (e.button === 2) { // right
    mouse.right = false;
    if (possession === player && passAim.aiming) {
      // Pass (works while moving)
      let dx = passAim.target.x - player.x;
      let dy = passAim.target.y - player.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        dx /= dist; dy /= dist;
        ball.vx = dx * 4.5;
        ball.vy = dy * 4.5;
        ball.vz = 2.5;
        possession = null;
      }
      passAim.aiming = false;
    }
  }
});
window.addEventListener('contextmenu', e => e.preventDefault());

function resetPositions() {
  player.x = FIELD_WIDTH * 0.25;
  player.y = FIELD_HEIGHT / 2;
  player.vx = player.vy = 0;
  aiPlayers[0].x = FIELD_WIDTH * 0.75;
  aiPlayers[0].y = FIELD_HEIGHT / 2 - 60;
  aiPlayers[0].vx = aiPlayers[0].vy = 0;
  aiPlayers[1].x = FIELD_WIDTH * 0.75;
  aiPlayers[1].y = FIELD_HEIGHT / 2 + 60;
  aiPlayers[1].vx = aiPlayers[1].vy = 0;
  ball.x = FIELD_WIDTH / 2;
  ball.y = FIELD_HEIGHT / 2;
  ball.vx = ball.vy = 0;
  ball.z = 0;
  ball.vz = 0;
}

function drawField() {
  ctx.fillStyle = COLORS.field;
  ctx.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 4;
  // Outer lines
  ctx.strokeRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
  // Center line
  ctx.beginPath();
  ctx.moveTo(FIELD_WIDTH / 2, 0);
  ctx.lineTo(FIELD_WIDTH / 2, FIELD_HEIGHT);
  ctx.stroke();
  // Center circle
  ctx.beginPath();
  ctx.arc(FIELD_WIDTH / 2, FIELD_HEIGHT / 2, 90, 0, 2 * Math.PI);
  ctx.stroke();
  // Penalty boxes
  ctx.strokeRect(0, FIELD_HEIGHT / 2 - GOAL_HEIGHT / 2, 160, GOAL_HEIGHT);
  ctx.strokeRect(FIELD_WIDTH - 160, FIELD_HEIGHT / 2 - GOAL_HEIGHT / 2, 160, GOAL_HEIGHT);
  // Goal areas
  ctx.strokeRect(0, FIELD_HEIGHT / 2 - GOAL_HEIGHT / 4, 80, GOAL_HEIGHT / 2);
  ctx.strokeRect(FIELD_WIDTH - 80, FIELD_HEIGHT / 2 - GOAL_HEIGHT / 4, 80, GOAL_HEIGHT / 2);
  // Draw left goal net
  drawGoalNet(0, FIELD_HEIGHT / 2, true);
  // Draw right goal net
  drawGoalNet(FIELD_WIDTH, FIELD_HEIGHT / 2, false);
}
function drawGoalNet(x, y, left) {
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 8;
  // Posts
  ctx.beginPath();
  ctx.moveTo(x, y - GOAL_WIDTH / 2);
  ctx.lineTo(x, y + GOAL_WIDTH / 2);
  ctx.stroke();
  // Crossbar
  ctx.beginPath();
  ctx.moveTo(x, y - GOAL_WIDTH / 2);
  ctx.lineTo(left ? x + 40 : x - 40, y - GOAL_WIDTH / 2);
  ctx.lineTo(left ? x + 40 : x - 40, y + GOAL_WIDTH / 2);
  ctx.lineTo(x, y + GOAL_WIDTH / 2);
  ctx.stroke();
  // Net (vertical lines)
  ctx.lineWidth = 2;
  for (let i = 1; i <= 5; ++i) {
    ctx.beginPath();
    ctx.moveTo(left ? x + i * 8 : x - i * 8, y - GOAL_WIDTH / 2 + i * 8);
    ctx.lineTo(left ? x + 40 : x - 40, y - GOAL_WIDTH / 2 + i * 8);
    ctx.stroke();
  }
  // Net (horizontal lines)
  for (let i = 1; i <= 5; ++i) {
    ctx.beginPath();
    ctx.moveTo(left ? x : x, y - GOAL_WIDTH / 2 + i * (GOAL_WIDTH / 6));
    ctx.lineTo(left ? x + 40 : x - 40, y - GOAL_WIDTH / 2 + i * (GOAL_WIDTH / 6));
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayers() {
  // Player
  drawPlayer(player);
  // AI
  aiPlayers.forEach(ai => drawPlayer(ai));
}
function drawPlayer(p) {
  // Dirt trail
  if (p.dirtTrail && p.dirtTrail.length > 0) {
    for (let i = 0; i < p.dirtTrail.length; ++i) {
      ctx.save();
      ctx.globalAlpha = 0.15 * (1 - i / DIRT_TRAIL_LENGTH);
      ctx.fillStyle = '#bfa76a';
      ctx.beginPath();
      ctx.arc(p.dirtTrail[i].x, p.dirtTrail[i].y, PLAYER_SIZE / 2.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }
  }
  // Hopping animation
  let hop = Math.abs(Math.sin(p.hopPhase)) * PLAYER_HOP_HEIGHT;
  ctx.save();
  if (p.kicking && p.kickTimer > 0) {
    ctx.fillStyle = '#fff700';
  } else {
    ctx.fillStyle = p.color;
  }
  ctx.fillRect(p.x - PLAYER_SIZE / 2, p.y - PLAYER_SIZE / 2 - hop, PLAYER_SIZE, PLAYER_SIZE);
  ctx.strokeStyle = COLORS.controlled;
  ctx.lineWidth = 2;
  if (p.controlled) ctx.strokeRect(p.x - PLAYER_SIZE / 2, p.y - PLAYER_SIZE / 2 - hop, PLAYER_SIZE, PLAYER_SIZE);
  ctx.restore();
}

function drawBall() {
  // Draw shadow
  let shadowScale = 1 - Math.min(ball.z / 60, 0.7);
  let shadowAlpha = 0.25 + 0.5 * (1 - Math.min(ball.z / 60, 1));
  ctx.save();
  ctx.globalAlpha = shadowAlpha;
  ctx.beginPath();
  ctx.ellipse(ball.x, ball.y + BALL_SIZE / 2, (BALL_SIZE / 2) * shadowScale * 1.2, (BALL_SIZE / 4) * shadowScale, 0, 0, 2 * Math.PI);
  ctx.fillStyle = '#222';
  ctx.fill();
  ctx.restore();
  // Draw ball (with vertical offset)
  ctx.save();
  ctx.beginPath();
  ctx.arc(ball.x, ball.y - ball.z, BALL_SIZE / 2, 0, 2 * Math.PI);
  ctx.fillStyle = COLORS.ball;
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.restore();
}

function drawScore() {
  ctx.font = '48px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.score;
  ctx.fillText(score.left, FIELD_WIDTH * 0.25, 60);
  ctx.fillText(score.right, FIELD_WIDTH * 0.75, 60);
  // No timer
}

function updatePlayer() {
  let dx = 0, dy = 0;
  let running = keys['shift'];
  if (keys['w'] || keys['arrowup']) dy -= 1;
  if (keys['s'] || keys['arrowdown']) dy += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;
  let speed = running ? PLAYER_RUN_SPEED : PLAYER_SPEED;
  if (dx !== 0 || dy !== 0) {
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len; dy /= len;
    player.vx += dx * speed * 0.5;
    player.vy += dy * speed * 0.5;
    player.angle = Math.atan2(dy, dx);
    player.hopPhase += PLAYER_HOP_FREQ * (running ? 1.7 : 1);
    if (running) {
      player.dirtTrail.unshift({ x: player.x, y: player.y });
      if (player.dirtTrail.length > DIRT_TRAIL_LENGTH) player.dirtTrail.pop();
    } else {
      player.dirtTrail = [];
    }
  } else {
    player.hopPhase = 0;
    player.dirtTrail = [];
  }
  // Friction
  player.vx *= PLAYER_FRICTION;
  player.vy *= PLAYER_FRICTION;
  player.x += player.vx;
  player.y += player.vy;
  // Clamp to field
  player.x = Math.max(PLAYER_SIZE / 2, Math.min(FIELD_WIDTH - PLAYER_SIZE / 2, player.x));
  player.y = Math.max(PLAYER_SIZE / 2, Math.min(FIELD_HEIGHT - PLAYER_SIZE / 2, player.y));
  // Kicking animation timer
  if (player.kickTimer > 0) {
    player.kickTimer--;
    if (player.kickTimer === 0) player.kicking = false;
  }
}
function updateAI() {
  aiPlayers.forEach(ai => {
    // Simple AI: move toward ball or tackle
    let dx = (possession && possession !== ai) ? possession.x - ai.x : ball.x - ai.x;
    let dy = (possession && possession !== ai) ? possession.y - ai.y : ball.y - ai.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let running = dist > 80;
    let speed = running ? PLAYER_RUN_SPEED : PLAYER_SPEED;
    if (dist > 2) {
      dx /= dist; dy /= dist;
      ai.vx += dx * speed * 0.5;
      ai.vy += dy * speed * 0.5;
      ai.angle = Math.atan2(dy, dx);
      ai.hopPhase += PLAYER_HOP_FREQ * (running ? 1.7 : 1);
      if (running) {
        ai.dirtTrail.unshift({ x: ai.x, y: ai.y });
        if (ai.dirtTrail.length > DIRT_TRAIL_LENGTH) ai.dirtTrail.pop();
      } else {
        ai.dirtTrail = [];
      }
    } else {
      ai.hopPhase = 0;
      ai.dirtTrail = [];
    }
    ai.vx *= PLAYER_FRICTION;
    ai.vy *= PLAYER_FRICTION;
    ai.x += ai.vx;
    ai.y += ai.vy;
    ai.x = Math.max(PLAYER_SIZE / 2, Math.min(FIELD_WIDTH - PLAYER_SIZE / 2, ai.x));
    ai.y = Math.max(PLAYER_SIZE / 2, Math.min(FIELD_HEIGHT - PLAYER_SIZE / 2, ai.y));
    // Tackle: if close to player with ball and left mouse is pressed, steal ball
    if (possession === player && dist < PLAYER_SIZE && mouse.left && !powerShot.charging) {
      possession = ai;
      ball.vx = dx * 4;
      ball.vy = dy * 4;
      ball.vz = 6;
    }
  });
}
function updateBall() {
  // Friction
  ball.vx *= BALL_FRICTION;
  ball.vy *= BALL_FRICTION;
  ball.x += ball.vx;
  ball.y += ball.vy;
  // Vertical physics
  ball.vz += BALL_GRAVITY;
  ball.z += ball.vz;
  if (ball.z < 0) {
    ball.z = 0;
    if (Math.abs(ball.vz) > 1.5) {
      ball.vz *= -BALL_BOUNCE_Z;
    } else {
      ball.vz = 0;
    }
  }
  // Bounce off walls (except goals)
  if (ball.x < BALL_SIZE / 2 && (ball.y < FIELD_HEIGHT / 2 - GOAL_WIDTH / 2 || ball.y > FIELD_HEIGHT / 2 + GOAL_WIDTH / 2)) {
    ball.x = BALL_SIZE / 2;
    ball.vx *= -BALL_BOUNCE;
  }
  if (ball.x > FIELD_WIDTH - BALL_SIZE / 2 && (ball.y < FIELD_HEIGHT / 2 - GOAL_WIDTH / 2 || ball.y > FIELD_HEIGHT / 2 + GOAL_WIDTH / 2)) {
    ball.x = FIELD_WIDTH - BALL_SIZE / 2;
    ball.vx *= -BALL_BOUNCE;
  }
  if (ball.y < BALL_SIZE / 2) {
    ball.y = BALL_SIZE / 2;
    ball.vy *= -BALL_BOUNCE;
  }
  if (ball.y > FIELD_HEIGHT - BALL_SIZE / 2) {
    ball.y = FIELD_HEIGHT - BALL_SIZE / 2;
    ball.vy *= -BALL_BOUNCE;
  }
}
function handleCollisions() {
  // Player-ball collision and possession
  let dx = ball.x - player.x;
  let dy = ball.y - player.y;
  let dist = Math.sqrt(dx * dx + dy * dy);
  if (!possession && dist < (PLAYER_SIZE + BALL_SIZE) / 2 && ball.z < 10) {
    possession = player;
    ball.vx = ball.vy = ball.vz = 0;
    ball.z = 0;
  }
  // AI-ball collision and possession
  aiPlayers.forEach(ai => {
    let dx = ball.x - ai.x;
    let dy = ball.y - ai.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (!possession && dist < (PLAYER_SIZE + BALL_SIZE) / 2 && ball.z < 10) {
      possession = ai;
      ball.vx = ball.vy = ball.vz = 0;
      ball.z = 0;
    }
  });
  // Player dribbling
  if (possession === player) {
    let angle = player.angle || 0;
    ball.x = player.x + Math.cos(angle) * (PLAYER_SIZE * 0.7);
    ball.y = player.y + Math.sin(angle) * (PLAYER_SIZE * 0.7);
    ball.z = 0;
    // Power shot charging
    if (powerShot.charging) {
      powerShot.power = Math.min(powerShot.power + 1, powerShot.max);
    }
    // Pass aiming
    if (passAim.aiming) {
      passAim.target.x = mouse.x;
      passAim.target.y = mouse.y;
    }
  }
  // AI dribbling
  aiPlayers.forEach(ai => {
    if (possession === ai) {
      let angle = ai.angle || 0;
      ball.x = ai.x + Math.cos(angle) * (PLAYER_SIZE * 0.7);
      ball.y = ai.y + Math.sin(angle) * (PLAYER_SIZE * 0.7);
      ball.z = 0;
    }
  });
  // Player-player collision (solid)
  aiPlayers.forEach(ai => {
    let dx = ai.x - player.x;
    let dy = ai.y - player.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < PLAYER_SIZE) {
      let overlap = PLAYER_SIZE - dist;
      dx /= dist; dy /= dist;
      ai.x += dx * overlap * 0.5;
      ai.y += dy * overlap * 0.5;
      player.x -= dx * overlap * 0.5;
      player.y -= dy * overlap * 0.5;
      // Exchange some velocity
      let tempVx = ai.vx;
      let tempVy = ai.vy;
      ai.vx = player.vx * 0.5;
      ai.vy = player.vy * 0.5;
      player.vx = tempVx * 0.5;
      player.vy = tempVy * 0.5;
    }
  });
  // AI-AI collision (solid)
  for (let i = 0; i < aiPlayers.length; ++i) {
    for (let j = i + 1; j < aiPlayers.length; ++j) {
      let ai1 = aiPlayers[i], ai2 = aiPlayers[j];
      let dx = ai2.x - ai1.x;
      let dy = ai2.y - ai1.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PLAYER_SIZE) {
        let overlap = PLAYER_SIZE - dist;
        dx /= dist; dy /= dist;
        ai1.x -= dx * overlap * 0.5;
        ai1.y -= dy * overlap * 0.5;
        ai2.x += dx * overlap * 0.5;
        ai2.y += dy * overlap * 0.5;
        // Exchange some velocity
        let tempVx = ai1.vx;
        let tempVy = ai1.vy;
        ai1.vx = ai2.vx * 0.5;
        ai1.vy = ai2.vy * 0.5;
        ai2.vx = tempVx * 0.5;
        ai2.vy = tempVy * 0.5;
      }
    }
  }
  // Player can tackle AI with the ball
  aiPlayers.forEach(ai => {
    if (possession === ai) {
      let dx = ai.x - player.x;
      let dy = ai.y - player.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PLAYER_SIZE * 1.2 && mouse.left && !powerShot.charging) {
        console.log('Tackle! Player steals from AI.');
        possession = player;
        ball.vx = -dx / dist * 4;
        ball.vy = -dy / dist * 4;
        ball.vz = 6;
        tackleAnim.active = true;
        tackleAnim.x = ai.x;
        tackleAnim.y = ai.y;
        tackleAnim.timer = 12;
      }
    }
  });
}
function checkGoal() {
  // Left goal
  if (ball.x < 0 && ball.y > FIELD_HEIGHT / 2 - GOAL_WIDTH / 2 && ball.y < FIELD_HEIGHT / 2 + GOAL_WIDTH / 2) {
    score.right++;
    triggerGoalAnim('right', player.controlled ? getDiscordUser().username : 'AI');
    resetPositions();
  }
  // Right goal
  if (ball.x > FIELD_WIDTH && ball.y > FIELD_HEIGHT / 2 - GOAL_WIDTH / 2 && ball.y < FIELD_HEIGHT / 2 + GOAL_WIDTH / 2) {
    score.left++;
    triggerGoalAnim('left', player.controlled ? getDiscordUser().username : 'AI');
    resetPositions();
  }
}
function triggerGoalAnim(team, scorerName) {
  goalAnim.active = true;
  goalAnim.color = team === 'left' ? COLORS.player : COLORS.player2;
  goalAnim.textX = FIELD_WIDTH;
  goalAnim.team = team;
  goalAnim.timer = 60;
  goalAnim.scorer = scorerName;
  GOAL_SOUND.currentTime = 0;
  GOAL_SOUND.play();
}
function drawGoalAnim() {
  if (!goalAnim.active) return;
  ctx.save();
  ctx.font = 'bold 96px Fredoka One, Arial Rounded MT Bold, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = goalAnim.color;
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 16;
  ctx.fillText('GOAL', FIELD_WIDTH / 2, FIELD_HEIGHT / 2);
  ctx.font = 'bold 40px Fredoka One, Arial Rounded MT Bold, Arial, sans-serif';
  ctx.shadowBlur = 8;
  if (goalAnim.scorer) {
    ctx.fillText(`By ${goalAnim.scorer}`, FIELD_WIDTH / 2, FIELD_HEIGHT / 2 + 60);
  }
  ctx.restore();
  goalAnim.timer--;
  if (goalAnim.timer <= 0) goalAnim.active = false;
}

function updateTimer() { /* no-op, removed timer */ }

function drawPowerIndicator() {
  if (possession === player && powerShot.charging) {
    // Power bar
    let pct = powerShot.power / powerShot.max;
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#fff700';
    ctx.fillRect(player.x - 30, player.y - 50, 60 * pct, 10);
    ctx.strokeStyle = '#333';
    ctx.strokeRect(player.x - 30, player.y - 50, 60, 10);
    ctx.restore();
    // Power shot arrow
    let dx = mouse.x - player.x;
    let dy = mouse.y - player.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      dx /= dist; dy /= dist;
      let len = 60 + 40 * pct;
      let arrowX = player.x + dx * len;
      let arrowY = player.y + dy * len;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ff6b35';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(arrowX, arrowY);
      ctx.stroke();
      // Arrow head
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX - 15 * dx - 7 * dy, arrowY - 15 * dy + 7 * dx);
      ctx.lineTo(arrowX - 15 * dx + 7 * dy, arrowY - 15 * dy - 7 * dx);
      ctx.closePath();
      ctx.fillStyle = '#ff6b35';
      ctx.fill();
      ctx.restore();
    }
  }
  if (possession === player && passAim.aiming) {
    // Improved pass arrow
    let dx = passAim.target.x - player.x;
    let dy = passAim.target.y - player.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0) {
      dx /= dist; dy /= dist;
      let len = Math.min(dist, 120);
      let arrowX = player.x + dx * len;
      let arrowY = player.y + dy * len;
      ctx.save();
      ctx.globalAlpha = 0.7;
      let grad = ctx.createLinearGradient(player.x, player.y, arrowX, arrowY);
      grad.addColorStop(0, '#4fc3f7');
      grad.addColorStop(1, '#1976d2');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(arrowX, arrowY);
      ctx.stroke();
      // Arrow head
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX - 18 * dx - 8 * dy, arrowY - 18 * dy + 8 * dx);
      ctx.lineTo(arrowX - 18 * dx + 8 * dy, arrowY - 18 * dy - 8 * dx);
      ctx.closePath();
      ctx.fillStyle = '#1976d2';
      ctx.fill();
      ctx.restore();
    }
  }
}
function drawTackleAnim() {
  if (tackleAnim.active && tackleAnim.timer > 0) {
    ctx.save();
    ctx.globalAlpha = 0.7 * (tackleAnim.timer / 12);
    ctx.strokeStyle = '#fff700';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(tackleAnim.x, tackleAnim.y, PLAYER_SIZE * 0.8, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
    tackleAnim.timer--;
    if (tackleAnim.timer <= 0) tackleAnim.active = false;
  }
}

function gameLoop() {
  drawField();
  drawPlayers();
  drawBall();
  drawScore();
  drawGoalAnim();
  drawPowerIndicator();
  drawTackleAnim();
  if (!goalAnim.active && score.left < GOAL_SCORE && score.right < GOAL_SCORE) {
    updatePlayer();
    updateAI();
    updateBall();
    handleCollisions();
    checkGoal();
  }
  if (score.left >= GOAL_SCORE || score.right >= GOAL_SCORE) {
    setTimeout(() => { alert('Game Over! Final Score: ' + score.left + ' - ' + score.right); location.reload(); }, 500);
    return;
  }
  requestAnimationFrame(gameLoop);
}

resetPositions();
gameLoop();
