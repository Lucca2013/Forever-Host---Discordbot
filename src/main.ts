import { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import dotenv from "dotenv";
import createBot, { stopBot, getActiveBots } from "./minecraft_bot/minecraftBot";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const foreverCommand = new SlashCommandBuilder()
  .setName("server")
  .addStringOption(option =>
    option
      .setName("ip")
      .setDescription("ip")
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option
      .setName("port")
      .setDescription("port")
      .setRequired(true)
  );

client.once("ready", () => {
  console.log(`Bot online ${client.user?.tag}!`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "/fh info") {
    const foreverHostEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('🟢 foreverHost | Your Minecraft server 24/7!')
      .setDescription('Tired of your Minecraft server shutting down? **foreverHost** is a Discord bot that keeps your server online 24/7, simulating an active player.')
      .setThumbnail('https://cdn.discordapp.com/avatars/1442643970722365531/57f4a5abc5758e2f6562134cabb91569.webp?size=80')
      .addFields(
        { name: 'Management Commands', value: '\u200b' },
        {
          name: '`/bot add <ip> <port> <version>`',
          value: 'Adds a new Minecraft server for the bot to monitor. Ex: `/bot add ip:127.0.0.1 port:25565 version:1.19.4`',
          inline: false
        },
        { name: '`/bot show`', value: 'Shows the current status and details of your monitored server.', inline: false },
        { name: '`/bot stop`', value: 'Stops the bot from simulating a player on your server.', inline: false },
        { name: '`/bot ping`', value: 'Displays the latency of the bot and the Minecraft server.', inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'Version: v1.0.0 | Developed by [Your Name/Tag]' });
    message.channel.send({ embeds: [foreverHostEmbed] });
  }
  if (message.content === "/bot ping") {
    const sent = await message.reply("🏓 Pong!");
    sent.edit(`🏓 Pong! ** ${sent.createdTimestamp - message.createdTimestamp}ms ** `);
  }

  if (message.content.startsWith("/bot add")) {
    const UserBots = getActiveBots(message.author.tag);

    if (UserBots.length !== 0) {
      return message.reply(
        `❌ @${message.author.tag} You already have a bot at ${UserBots[0].server}.\nUse **/bot stop** to stop it`
      );
    }

    const regex = /ip:([^\s]+)\s+port:(\d+)\s+version:([\d.]+)/i;
    const match = message.content.match(regex);

    if (!match) {
      return message.reply(
        "❌ Invalid format!\nUse like this:\n`/bot add ip:127.0.0.1 port:25565 version:1.21.10`"
      );
    }

    const ip = match[1];
    const port = match[2];
    const version = match[3];

    const statusMessage = await message.reply(`🟡 Starting bot for server ${ip}:${port}...`);

    createBot(ip, port, version, statusMessage, message.author.tag);
  }

  if (message.content === "/bot show") {
    const activeBots = getActiveBots(message.author.tag);
    if (activeBots.length === 0) {
      return message.reply("🤖 No active bots");
    }

    const botList = activeBots.map(bot => {
      const uptimeMinutes = Math.floor(bot.uptime / 60000);
      return `• **${bot.server}** - Status: ${bot.status} - Uptime: ${uptimeMinutes}min`;
    }).join('\n');

    return message.reply(`🤖 **Active Bots:**\n${botList}`);
  }

  if (message.content.startsWith("/bot stop")) {
    const stopFunc = stopBot(message.author.tag);

    if (stopFunc) {
      message.reply(`✅ Bot stopped for ${stopFunc["ip"]}:${stopFunc["port"]}`);
    } else {
      message.reply(`❌ No active bot found for @${message.author.tag}`);
    }
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const customId = interaction.customId;

  if (customId.startsWith("stop:")) {
    const owner = customId.split(":");

    await interaction.reply({
      content: `🛑 Stoping Bot @${owner}...`,
      ephemeral: true
    });

    const result = stopBot(owner[1]);
    if (result) {
      await interaction.editReply({
        content: `✅ Bot stopped with sucess! @${owner[1]}`
      });
    } else {
      await interaction.editReply({
        content: `❌ You dont have any bot @${owner[1]}`
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
