import mineflayer from "mineflayer";
import { Movements, pathfinder, goals } from "mineflayer-pathfinder";

import {
    safeEditMessage,
    buildConnectedEmbed,
    buildVersionMismatchEmbed,
    buildKickedEmbed,
    buildConnectionErrorEmbed,
    buildRetryingEmbed
} from "../helpers/discord_messages";

type BotEntry = {
    bot: any;
    status: string;
    startTime: number;
    reconnects: number;
    version: string;
    owner: string;
    discordMessage: any;
    afkInterval?: NodeJS.Timeout;
};

const activeBots = new Map<string, BotEntry>();
const MAX_RECONNECTS = 2;
const RECONNECT_DELAY = 8000;

function generateBotName() {
    return "bot_" + Math.random().toString(36).substring(2, 12);
}

export default async function createBot(
    ip: string,
    port: string,
    version: string,
    discordMessage: any,
    owner: string
) {
    const botKey = `${ip}:${port}`;

    // Bloqueio: um dono – um bot
    for (const [, v] of activeBots) {
        if (v.owner === owner) return;
    }

    const previous = activeBots.get(botKey);
    const reconnects = previous ? previous.reconnects + 1 : 0;

    if (reconnects > MAX_RECONNECTS) {
        safeEditMessage(discordMessage, buildConnectionErrorEmbed(
            { ip, port },
            "Maximum reconnect attempts reached.",
            owner
        ));
        return;
    }

    console.log(`[BOT] Connecting to ${botKey} (attempt ${reconnects})...`);

    const bot = mineflayer.createBot({
        host: ip,
        port: Number(port),
        username: generateBotName(),
        version,
        checkTimeoutInterval: 20_000
    });

    const entry: BotEntry = {
        bot,
        status: "connecting",
        startTime: Date.now(),
        reconnects,
        version,
        owner,
        discordMessage
    };

    activeBots.set(botKey, entry);

    // --------------------- EVENTOS ---------------------

    bot.once("login", () => {
        entry.status = "connected";
        entry.reconnects = 0;
        console.log(`[BOT] Login OK @ ${botKey}`);
    });

    bot.once("spawn", () => {
        safeEditMessage(discordMessage, buildConnectedEmbed({
            ip, port, version,
            uptimeMs: Date.now() - entry.startTime
        }, owner));

        setInterval(() => {
            bot.setControlState("jump", true);
            setTimeout(() => {
                bot.setControlState("jump", false);
            }, 300);
        }, 10000);
    });

    bot.on("kicked", (reason) => {
        console.log(`[BOT] Kick @ ${botKey}:`, reason);

        safeEditMessage(discordMessage, buildKickedEmbed({
            ip, port, reason: JSON.stringify(reason)
        }, owner));

        cleanup(botKey);
    });

    bot.on("error", (err) => {
        console.log(`[BOT] Error @ ${botKey}:`, err.message);

        safeEditMessage(discordMessage, buildConnectionErrorEmbed(
            { ip, port },
            err.message,
            owner
        ));

        cleanup(botKey);
    });

    bot.on("end", () => {
        console.log(`[BOT] Ended @ ${botKey}`);

        if (entry.reconnects < MAX_RECONNECTS) {
            safeEditMessage(discordMessage, buildRetryingEmbed({
                ip, port,
                attempts: entry.reconnects + 1,
                maxAttempts: MAX_RECONNECTS
            }, owner));

            setTimeout(() => {
                if (!activeBots.has(botKey)) return;
                createBot(ip, port, version, discordMessage, owner);
            }, RECONNECT_DELAY);

        } else {
            cleanup(botKey);
        }
    });
}

// --------------------- HELPERS ---------------------

function cleanup(botKey: string) {
    const entry = activeBots.get(botKey);
    if (!entry) return;

    console.log(`[BOT] Cleanup @ ${botKey}`);

    try { entry.bot.removeAllListeners(); } catch (_) { }
    try { entry.bot.quit(); } catch (_) { }

    if (entry.afkInterval) clearInterval(entry.afkInterval);

    activeBots.delete(botKey);
}

// --------------------- PUBLIC API ---------------------

export function getActiveBots(owner: string) {
    const list = [];
    for (const [key, value] of activeBots) {
        if (value.owner === owner) {
            list.push({
                server: key,
                uptime: Date.now() - value.startTime,
                version: value.version,
                status: value.status
            });
        }
    }
    return list;
}

export function stopBot(owner: string) {
    for (const [key, value] of activeBots) {
        if (value.owner === owner) {
            cleanup(key);
            const [ip, port] = key.split(":");
            return { ip, port };
        }
    }
    return null;
}
