const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock } = require('mineflayer-pathfinder').goals;

const config = require('./settings.json');
const express = require('express');

const app = express();

app.get('/', (req, res) => {
  res.send('Bot has arrived');
});

app.listen(8000, () => {
  console.log('Server started');
});

// Optional: strip Minecraft color codes
function stripColors(text) {
  return text.replace(/§[0-9a-fklmnor]/gi, '');
}

function createBot() {
  const bot = mineflayer.createBot({
    username: config['bot-account']['username'],
    password: config['bot-account']['password'],
    auth: config['bot-account']['type'],
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version,
  });

  bot.loadPlugin(pathfinder);
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);

  let pendingPromise = Promise.resolve();

  function sendRegister(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/register ${password} ${password}`);
      console.log(`[Auth] Sent /register command.`);

      bot.once('chat', (username, message) => {
        const clean = stripColors(message);
        console.log(`[ChatLog] <${username}> ${clean}`);

        if (clean.includes('successfully registered')) {
          console.log('[INFO] Registration confirmed.');
          resolve();
        } else if (clean.includes('already registered')) {
          console.log('[INFO] Bot was already registered.');
          resolve();
        } else if (clean.includes('Invalid command')) {
          reject(`Registration failed: Invalid command. Message: "${clean}"`);
        } else {
          reject(`Registration failed: unexpected message "${clean}".`);
        }
      });
    });
  }

  function sendLogin(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/login ${password}`);
      console.log(`[Auth] Sent /login command.`);

      bot.once('chat', (username, message) => {
        const clean = stripColors(message);
        console.log(`[ChatLog] <${username}> ${clean}`);

        if (clean.includes('successfully logged in')) {
          console.log('[INFO] Login successful.');
          resolve();
        } else if (clean.includes('Invalid password')) {
          reject(`Login failed: Invalid password. Message: "${clean}"`);
        } else if (clean.includes('not registered')) {
          reject(`Login failed: Not registered. Message: "${clean}"`);
        } else {
          reject(`Login failed: unexpected message "${clean}".`);
        }
      });
    });
  }

  bot.once('spawn', () => {
    console.log('\x1b[33m[AfkBot] Bot joined the server\x1b[0m');

    // 🟢 Auto Auth
    if (config.utils['auto-auth'].enabled) {
      console.log('[INFO] Started auto-auth module');
      const password = config.utils['auto-auth'].password;

      pendingPromise = pendingPromise
        .then(() => sendRegister(password))
        .then(() => sendLogin(password))
        .catch(error => console.error('[ERROR]', error));
    }

    // 💬 Auto Chat Messages
    if (config.utils['chat-messages'].enabled) {
      console.log('[INFO] Started chat-messages module');
      const messages = config.utils['chat-messages']['messages'];

      if (config.utils['chat-messages'].repeat) {
        const delay = config.utils['chat-messages']['repeat-delay'];
        let i = 0;

        setInterval(() => {
          bot.chat(`${messages[i]}`);
          i = (i + 1) % messages.length;
        }, delay * 1000);
      } else {
        messages.forEach((msg) => bot.chat(msg));
      }
    }

    // 🚶 Move to Position
    const pos = config.position;

    if (config.position.enabled) {
      console.log(
        `\x1b[32m[Afk Bot] Moving to (${pos.x}, ${pos.y}, ${pos.z})\x1b[0m`
      );
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
    }

    // 🕺 Anti-AFK
    if (config.utils['anti-afk'].enabled) {
      bot.setControlState('jump', true);
      if (config.utils['anti-afk'].sneak) {
        bot.setControlState('sneak', true);
      }
    }
  });

  // 🚩 Event Hooks
  bot.on('goal_reached', () => {
    console.log(`\x1b[32m[AfkBot] Reached target location at ${bot.entity.position}\x1b[0m`);
  });

  bot.on('death', () => {
    console.log(`\x1b[33m[AfkBot] Bot died and respawned at ${bot.entity.position}\x1b[0m`);
  });

  bot.on('kicked', (reason) => {
    console.log('\x1b[33m', `[AfkBot] Kicked from server. Reason:\n${reason}`, '\x1b[0m');
  });

  bot.on('error', (err) => {
    console.log(`\x1b[31m[ERROR] ${err.message}\x1b[0m`);
  });

  // 💬 Full raw message logging
  bot.on('message', (msg) => {
    console.log('[Server Message]:', msg.toString());
    console.log('[DEBUG RAW MESSAGE]:', JSON.stringify(msg, null, 2));
  });

  // 🔁 Auto Reconnect
  if (config.utils['auto-reconnect']) {
    bot.on('end', () => {
      console.log('[INFO] Reconnecting bot...');
      setTimeout(() => {
        createBot();
      }, config.utils['auto-reconnect-delay']);
    });
  }
}

createBot();
