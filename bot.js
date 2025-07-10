require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

let persistentMessage = null;

client.on('ready', async () => {
    console.log(`Bot connecté : ${client.user.tag}`);

    try {
        const channel = await client.channels.fetch(process.env.VERIFICATION_CHANNEL_ID);
        if (!channel) throw new Error('Salon introuvable');

        const embed = new EmbedBuilder()
            .setTitle('🔐 Verification Required')
            .setDescription('Click the button below to verify your account and gain access to the server')
            .setColor('#5865F2')
            .setThumbnail(client.user.displayAvatarURL())
            .setFooter({ text: 'DSVerify Bot - Secure Verification System' });

        const button = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Verify Now')
                .setURL(process.env.DISCORD_CALLBACK_URL)
                .setStyle(ButtonStyle.Link)
        );

        // Vérifier si un message persistant existe déjà
        if (process.env.PERSISTENT_MESSAGE_ID) {
            try {
                persistentMessage = await channel.messages.fetch(process.env.PERSISTENT_MESSAGE_ID);
                await persistentMessage.edit({ embeds: [embed], components: [button] });
                console.log('Message persistant mis à jour');
            } catch (error) {
                console.log('Message persistant introuvable, création d\'un nouveau');
                persistentMessage = await channel.send({ embeds: [embed], components: [button] });
                console.log(`Nouveau message créé avec l'ID: ${persistentMessage.id}`);
            }
        } else {
            persistentMessage = await channel.send({ embeds: [embed], components: [button] });
            console.log(`Message initial créé avec l'ID: ${persistentMessage.id}`);
        }
    } catch (error) {
        console.error('Erreur lors de la configuration du bot:', error);
    }
});

// Ajouter le rôle lorsque l'utilisateur rejoint le serveur
client.on('guildMemberAdd', async member => {
    try {
        // Vérifier si l'utilisateur est dans la base de données
        const MongoClient = require('mongodb').MongoClient;
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
        const mongoClient = new MongoClient(mongoUri);
        
        await mongoClient.connect();
        const db = mongoClient.db('dsverify');
        
        const isVerified = await db.collection('verified').findOne({ id: member.id });
        
        if (isVerified && process.env.VERIFIED_ROLE_ID) {
            const role = member.guild.roles.cache.get(process.env.VERIFIED_ROLE_ID);
            if (role) {
                await member.roles.add(role);
                console.log(`Rôle attribué à ${member.user.tag}`);
            }
        }
        
        await mongoClient.close();
    } catch (error) {
        console.error('Erreur lors de l\'attribution du rôle:', error);
    }
});

client.login(process.env.DISCORD_TOKEN);