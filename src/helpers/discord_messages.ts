// helpers/discordMessages.ts
import fs from 'fs';
import path from 'path';
import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type MessageEditOptions,
    type Message
} from 'discord.js';

const LOG_FILE = path.join(__dirname, '..', 'bot_logs.txt');

type TemplateData = {
    ip: string;
    port: string;
    version?: string;
    reason?: string;
    attempts?: number;
    maxAttempts?: number;
    uptimeMs?: number;
};

function logToFile(level: 'INFO' | 'WARN' | 'ERROR', msg: string) {
    const time = new Date().toISOString();
    const line = `[${time}] [${level}] ${msg}\n`;
    try {
        fs.appendFileSync(LOG_FILE, line);
    } catch (e) {
        console.error('Error tying to write log:', e);
    }
    if (level === 'ERROR') console.error(line);
    else if (level === 'WARN') console.warn(line);
    else console.log(line);
}

function makeStopButton(owner: string) {
    return new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`stop:${owner}`)
                .setLabel('🛑 Stop Bot')
                .setStyle(ButtonStyle.Danger)
        );
}

function makeEmbed(title: string, description: string, color: number, fields?: { name: string, value: string, inline?: boolean }[]) {
    const emb = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setTimestamp(new Date())
        .setColor(color);
    if (fields) emb.addFields(...fields);
    return emb;
}

export function buildConnectedEmbed(data: TemplateData, owner: string): MessageEditOptions {
    const desc = `@${owner} \n**Server:** \`${data.ip}:${data.port}\`\n**Version:** \`${data.version ?? 'unknown'}\`\n\n🟢 *Bot keeping the server awake.*`;
    const embed = makeEmbed('✅ Conected with success', desc, 0x22c55e, [
        { name: 'Anti-AFK', value: 'Active', inline: true },
        { name: 'Uptime', value: data.uptimeMs ? `${Math.floor(data.uptimeMs / 1000)}s` : '—', inline: true }
    ]);
    logToFile('INFO', `Conected: ${data.ip}:${data.port} v=${data.version}`);
    return { embeds: [embed], components: [makeStopButton(owner)] };
}

export function buildVersionMismatchEmbed(data: TemplateData, suggested: string[], owner: string) {
    const desc = `@${owner} \nThe used version (\`${data.version}\`) This doesn't match the server. Try one of the versions below:`;
    const embed = makeEmbed('❌ Incompatible version', desc, 0xf97316, [
        { name: 'Suggested versions', value: suggested.map(v => `\`${v}\``).join(' • '), inline: false }
    ]);
    logToFile('WARN', `Incompatible version in ${data.ip}:${data.port} (v=${data.version})`);
    return { embeds: [embed], components: [makeStopButton(owner)] };
}

export function buildKickedEmbed(data: TemplateData, owner: string) {
    const reason = data.reason ? `\`\`\`\n${data.reason.substring(0, 150)}\n\`\`\`` : 'No information.';
    const embed = makeEmbed(`❌ @${owner} Bot kicked by the server`, `**Server:** \`${data.ip}:${data.port}\`\n**Reason:**`, 0xffb703);
    embed.addFields({ name: 'Detalhes', value: reason });
    logToFile('WARN', `Bot kicked at ${data.ip}:${data.port} reason=${data.reason}`);
    return { embeds: [embed], components: [makeStopButton(owner)] };
}

export function buildConnectionErrorEmbed(data: TemplateData, errorMsg: string, owner: string) {
    const embed = makeEmbed(`❌ @${owner} Connection error`, `**Server:** \`${data.ip}:${data.port}\`\n\n**Error:**\n\`\`\`\n${errorMsg}\n\`\`\``, 0xef4444);
    logToFile('ERROR', `Connection error ${data.ip}:${data.port} -> ${errorMsg}`);
    return { embeds: [embed], components: [makeStopButton(owner)] };
}

export function buildRetryingEmbed(data: TemplateData, owner: string) {
    const embed = makeEmbed(`🟡 @${owner} Trying to recconect...`, `Attempt **${(data.attempts ?? 0)}/${(data.maxAttempts ?? 0)}**`, 0xf59e0b);
    logToFile('INFO', `Reconnecting ${data.ip}:${data.port} attempt=${data.attempts}`);
    return { embeds: [embed], components: [makeStopButton(owner)] };
}

export function buildStoppedEmbed(data: TemplateData, owner: string) {
    const embed = makeEmbed(`🛑 @${owner} Bot stoped`, `The bot for the server \`${data.ip}:${data.port}\` It was completed successfully.`, 0x64748b);
    logToFile('INFO', `Bot stoped ${data.ip}:${data.port}`);
    return { embeds: [embed] };
}

export async function safeEditMessage(message: Message | null | undefined, payload: MessageEditOptions) {
    if (!message) {
        logToFile('WARN', 'safeEditMessage Call without valid message.');
        return;
    }
    try {
        await message.edit(payload);
    } catch (err: any) {
        logToFile('ERROR', `Failed to edit message: ${err.message ?? String(err)}`);
        try {
            await message.edit({ content: payload.embeds ? (payload.embeds[0] as any).data?.description ?? 'Update' : 'Update' });
        } catch (e) {
            console.error('Fallback edit failed.', e);
        }
    }
}
