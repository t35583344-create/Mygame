const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (including index.html)
app.use(express.static(path.dirname(__filename)));

// Serve index.html on root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint for Railway
app.get('/health', (req, res) => {
    res.json({ status: 'ok', players: Object.keys(players).length });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ 
    server,
    perMessageDeflate: false // Отключить сжатие для лучшей производительности
});

let players = {};
let grid = Array(20).fill(null).map(() => Array(30).fill(null));
let nextPlayerId = 1;
let lastBroadcastTime = 0;
const BROADCAST_INTERVAL = 33; // ~30 обновлений в секунду (33ms) вместо 20

const playerColors = [
    '#ff69b4', '#FFD700', '#00CED1', '#00FF00',
    '#FF6347', '#FF4500', '#9370DB', '#20B2AA'
];

wss.on('connection', (ws) => {
    let playerId = null;
    let playerName = null;

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);

            switch (message.type) {
                case 'join':
                    playerId = nextPlayerId++;
                    playerName = message.name;
                    const playerColor = playerColors[(playerId - 1) % playerColors.length];

                    // Add new player
                    players[playerId] = {
                        id: playerId,
                        name: playerName,
                        x: 150 + Math.random() * 300,
                        y: 50,
                        color: playerColor,
                        ws: ws
                    };

                    // Send player ID to new client
                    ws.send(JSON.stringify({
                        type: 'yourId',
                        id: playerId
                    }));

                    // Send current grid state
                    ws.send(JSON.stringify({
                        type: 'gridUpdate',
                        grid: grid
                    }));

                    // Send all existing players to new player
                    ws.send(JSON.stringify({
                        type: 'playersList',
                        players: Object.values(players)
                            .map(p => ({ id: p.id, name: p.name, x: p.x, y: p.y, color: p.color }))
                    }));

                    // Notify all OTHER players about new player (не отправляй самому себе)
                    broadcast({
                        type: 'playerJoined',
                        playerId: playerId,
                        name: playerName,
                        x: players[playerId].x,
                        y: players[playerId].y,
                        color: playerColor
                    }, playerId);

                    console.log(`Player ${playerName} (${playerId}) joined. Total: ${Object.keys(players).length}`);
                    break;

                case 'movePlayer':
                    if (players[playerId]) {
                        players[playerId].x = message.x;
                        players[playerId].y = message.y;

                        // Broadcast player movement to all others
                        broadcast({
                            type: 'playerMove',
                            playerId: playerId,
                            x: message.x,
                            y: message.y
                        }, playerId);
                    }
                    break;

                case 'placeBlock':
                    if (message.x >= 0 && message.x < 30 && message.y >= 0 && message.y < 20) {
                        grid[message.y][message.x] = message.color;

                        broadcast({
                            type: 'blockPlaced',
                            x: message.x,
                            y: message.y,
                            color: message.color
                        }, null);
                    }
                    break;

                case 'deleteBlock':
                    if (message.x >= 0 && message.x < 30 && message.y >= 0 && message.y < 20) {
                        grid[message.y][message.x] = null;

                        broadcast({
                            type: 'blockDeleted',
                            x: message.x,
                            y: message.y
                        }, null);
                    }
                    break;
            }
        } catch (e) {
            console.error('Error processing message:', e);
        }
    });

    ws.on('close', () => {
        if (playerId && players[playerId]) {
            const playerName = players[playerId].name;
            delete players[playerId];

            broadcast({
                type: 'playerLeft',
                playerId: playerId
            }, null);

            console.log(`Player ${playerName} left. Total: ${Object.keys(players).length}`);
        }
    });

    ws.on('error', (e) => {
        console.error('WebSocket error:', e);
    });
});

function broadcast(message, excludePlayerId) {
    try {
        const data = JSON.stringify(message);
        Object.values(players).forEach((player) => {
            // Пропускаем исключённого игрока
            if (excludePlayerId && player.id === excludePlayerId) {
                return;
            }
            if (player.ws && player.ws.readyState === WebSocket.OPEN) {
                try {
                    player.ws.send(data);
                } catch (e) {
                    console.error('Error sending message:', e.message);
                }
            }
        });
    } catch (e) {
        console.error('Broadcast error:', e);
    }
}

// Периодическое обновление позиций всех игроков (плавное движение)
setInterval(() => {
    const playersState = Object.values(players).map(p => ({
        id: p.id,
        x: p.x,
        y: p.y,
        name: p.name,
        color: p.color
    }));

    // Отправляем обновление всем подключённым клиентам
    broadcast({
        type: 'playersUpdate',
        players: playersState
    }, null);
}, BROADCAST_INTERVAL);

server.listen(PORT, '0.0.0.0', () => {
    console.log('\n🎮 Block Builder Multiplayer Server');
    console.log('================================');
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🎬 Client FPS: 60 (MAX)`);
    console.log(`📡 Update broadcast: ~${Math.round(1000/BROADCAST_INTERVAL)} times/sec (${BROADCAST_INTERVAL}ms)`);
    console.log(`✨ Client-side interpolation: Enabled (smooth movement)`);
    console.log(`\nDomain: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'your-domain.railway.app'}`);
    console.log(`Connection string: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost'}${PORT === 80 || PORT === 443 ? '' : ':' + PORT}`);
    console.log(`\n🌐 WebSocket: wss://${process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost' + ':' + PORT}`);
    console.log(`🖥️  HTTP: http://localhost:${PORT}/index.html`);
    console.log(`📊 Status: http://localhost:${PORT}/health`);
    console.log('================================\n');
});
