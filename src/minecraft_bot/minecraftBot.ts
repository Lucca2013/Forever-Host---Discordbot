const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock } = require('mineflayer-pathfinder').goals;

import {
    safeEditMessage,
    buildConnectedEmbed,
    buildVersionMismatchEmbed,
    buildKickedEmbed,
    buildConnectionErrorEmbed,
    buildRetryingEmbed,
    buildStoppedEmbed
} from '../helpers/discord_messages';

function generateBotName(): string {
    const baseName = "Bot";
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const fullName = baseName + randomSuffix;

    return fullName.length > 16 ? fullName.substring(0, 16) : fullName;
}

const config = {
    "bot-account": {
        "username": generateBotName(),
        "password": "",
        "type": "offline"
    },
    "position": {
        "enabled": false,
        "x": 0,
        "y": 0,
        "z": 0
    },
    "utils": {
        "auto-auth": {
            "enabled": false,
            "password": ""
        },
        "anti-afk": {
            "enabled": true,
            "sneak": true,
            "jump": true
        },
        "chat-log": true,
        "auto-reconnect": true,
        "auto-reconnect-delay": 10000
    }
};

const activeBots = new Map();
const MAX_RECONNECT_ATTEMPTS = 2;

export default async function createBot(ip: string, port: string, version: string, discordMessage: any, owner: string): Promise<any> {
    const botKey = `${ip}:${port}`;
    try {
        const versionParts = version.split('.');
        const p1 = +versionParts[0];
        const p2 = +versionParts[1];
        const p3 = +versionParts[2];

        if (p1 < 1 || (p1 === 1 && p2 < 8)) {
            await safeEditMessage(discordMessage,
                buildVersionMismatchEmbed(
                    { ip, port, version },
                    ["1.8.x", "1.12.2", "1.16.5", "1.20.1", "1.21.1", "1.21.4", "1.21.8"],
                    owner
                )
            );
            return;
        }

        if (p2 >= 21 && p3 >= 9) {
            await safeEditMessage(discordMessage,
                buildVersionMismatchEmbed(
                    { ip, port, version },
                    ["1.21.8", "1.21.7", "1.21.4", "1.20.1"],
                    owner
                )
            );
            return;
        }

        const portNum = parseInt(port);

        if (activeBots.has(botKey)) {
            const existingBot = activeBots.get(botKey);
            if (existingBot && existingBot.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                await safeEditMessage(discordMessage,
                    buildConnectionErrorEmbed(
                        { ip, port },
                        `Maximum reconnection attempts reached for ${ip}:${port}`,
                        owner
                    )
                );
                return;
            }
        }

        console.log(`[Bot] Using version: ${version} for ${ip}:${port}`);

        const bot = mineflayer.createBot({
            username: config['bot-account']['username'],
            password: config['bot-account']['password'],
            auth: config['bot-account']['type'],
            host: ip,
            port: portNum,
            version: version,
            checkTimeoutInterval: 30 * 1000,
        });

        const existingBot = activeBots.get(botKey);
        const reconnectAttempts = existingBot ? existingBot.reconnectAttempts + 1 : 0;

        activeBots.set(botKey, {
            bot: bot,
            discordMessage: discordMessage,
            status: 'connecting',
            startTime: Date.now(),
            reconnectAttempts: reconnectAttempts,
            version: version,
            owner: owner
        });

        bot.on('login', () => {
            console.log(`[Bot] Login successful for ${botKey}`);
        });

        bot.once('spawn', () => {
            console.log('\x1b[32m[Bot] Successfully spawned in the world!\x1b[0m');

            const botInfo = activeBots.get(botKey);
            if (botInfo) {
                botInfo.status = 'connected';
                botInfo.reconnectAttempts = 0;
            }

            safeEditMessage(discordMessage, buildConnectedEmbed({
                ip, port, version: version, uptimeMs: Date.now() - (botInfo?.startTime ?? Date.now())
            }, owner));

            if (config.utils['anti-afk'].enabled) {
                setInterval(() => {
                    if (bot.entity && bot.entity.isValid) {
                        const yaw = Math.random() * Math.PI * 2;
                        const pitch = (Math.random() * 0.5) - 0.25;
                        bot.look(yaw, pitch, false);
                    }
                }, 10000);
            }
        });

        bot.on('kicked', (reason: string) => {
            console.log('\x1b[33m', `[Bot] Kicked: ${reason}`, '\x1b[0m');

            const botInfo = activeBots.get(botKey);
            if (MAX_RECONNECT_ATTEMPTS > botInfo.reconnectAttempts) {
                activeBots.get(botKey).reconnectAttempts = activeBots.get(botKey).reconnectAttempts - 1;
                createBot(ip, port, version, discordMessage, owner);
            } else {
                const reasonText = typeof reason === 'object'
                    ? JSON.stringify(reason)
                    : String(reason);

                safeEditMessage(discordMessage, buildKickedEmbed({
                    ip, port, reason: reasonText
                }, owner));

                cleanupBot();
            }
        });

        bot.on('error', (err: any) => {
            console.log(`\x1b[31m[Bot Error] ${err.message}`, '\x1b[0m');

            safeEditMessage(discordMessage, buildConnectionErrorEmbed(
                { ip, port },
                err.message,
                owner
            ));

            cleanupBot();
        });

        bot.on('end', (reason: string) => {
            console.log('\x1b[33m[Bot] Connection ended. Reason:', reason, '\x1b[0m');

            const botInfo = activeBots.get(botKey);
            if (botInfo && botInfo.status !== 'connected') {
                if (botInfo.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {

                    safeEditMessage(discordMessage, buildRetryingEmbed({
                        ip, port,
                        attempts: botInfo.reconnectAttempts + 1,
                        maxAttempts: MAX_RECONNECT_ATTEMPTS,
                    }, owner));

                    setTimeout(() => {
                        if (activeBots.has(botKey)) {
                            console.log('[Bot] Attempting reconnect...');
                            createBot(ip, port, version, discordMessage, owner);
                        }
                    }, config.utils['auto-reconnect-delay']);

                } else {
                    safeEditMessage(discordMessage, buildConnectionErrorEmbed(
                        { ip, port },
                        `Failed after ${MAX_RECONNECT_ATTEMPTS} attempts`,
                        owner
                    ));
                    cleanupBot();
                }
            } else {
                cleanupBot();
            }
        });

        function cleanupBot() {
            const botInfo = activeBots.get(botKey);
            if (botInfo) {
                console.log(`[Bot] Cleaning up bot for ${botKey}`);
                activeBots.delete(botKey);
            }
        }

        setTimeout(() => {
            const botInfo = activeBots.get(botKey);
            if (botInfo && botInfo.status === 'connecting') {
                console.log('[Bot] Connection timeout');
                bot.end();
            }
        }, 15000);

    } catch (error: any) {
        const botInfo = activeBots.get(botKey);
        if (MAX_RECONNECT_ATTEMPTS > botInfo.reconnectAttempts) {
            activeBots.get(botKey).reconnectAttempts = activeBots.get(botKey).reconnectAttempts - 1;
            createBot(ip, version, port, discordMessage, owner);
        } else {
            console.error('Bot creation error:', error);

            safeEditMessage(discordMessage,
                buildConnectionErrorEmbed(
                    { ip, port },
                    error.message,
                    owner
                )
            );
        }
    }
}

export function getActiveBots(owner: string) {
    const bots = [];
    for (const [key, value] of activeBots.entries()) {
        if (value.owner == owner) {
            bots.push({
                server: key,
                status: value.status,
                version: value.version,
                uptime: Date.now() - value.startTime,
                attempts: value.reconnectAttempts
            });
        }
    }
    return bots;
}

export function stopBot(owner: string) {
    let botKeyToStop: string | null = null;
    let botInfoToStop: any = null;

    for (const [key, value] of activeBots.entries()) {
        if (value.owner === owner) {
            botKeyToStop = key;
            botInfoToStop = value;
            break;
        }
    }

    if (botKeyToStop && botInfoToStop) {
        console.log(`[Bot] Stopping bot for owner: ${owner} on server ${botKeyToStop}`);
        botInfoToStop.bot.quit(); 
        const [ip, port] = botKeyToStop.split(':'); 
        activeBots.delete(botKeyToStop);
        return { ip, port };
    }
    
    return null;
}
