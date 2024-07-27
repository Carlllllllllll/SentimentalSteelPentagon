const { SlashCommandBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

const wordListPath = path.join(__dirname, '..', '..', '..', 'src', 'events', 'wordList.json');

let words;
try {
    words = JSON.parse(fs.readFileSync(wordListPath, 'utf8'));
} catch (error) {
    console.error('Error reading word list:', error);
    throw error;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wordassociation')
        .setDescription('Play a game of Word Association!'),
    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
        }

        const commandUser = interaction.user;
        const startWord = words[Math.floor(Math.random() * words.length)];
        let currentWord = startWord;

        // Check bot permissions
        const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
        if (!botMember) {
            return interaction.reply({ content: 'Failed to fetch bot member information.', ephemeral: true });
        }

        const requiredPermissions = [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ManageChannels,
        ];

        const botPermissions = botMember.permissionsIn(interaction.channel);
        const missingPermissions = requiredPermissions.filter(permission => !botPermissions.has(permission));

        if (missingPermissions.length > 0) {
            const permissionNames = missingPermissions.map(permission => {
                switch (permission) {
                    case PermissionsBitField.Flags.ViewChannel:
                        return 'View Channels';
                    case PermissionsBitField.Flags.SendMessages:
                        return 'Send Messages';
                    case PermissionsBitField.Flags.ManageChannels:
                        return 'Manage Channels';
                    default:
                        return 'Unknown Permission';
                }
            }).join(', ');

            return interaction.reply({ content: `The bot is missing the following permissions: ${permissionNames}. Please adjust the permissions and try again.`, ephemeral: true });
        }

        // Check if a game channel already exists
        const existingChannel = interaction.guild.channels.cache.find(channel => channel.name.startsWith('word-association-') && channel.type === ChannelType.GuildText);
        if (existingChannel) {
            return interaction.reply({ content: `A Word Association game is already in progress in ${existingChannel}. Please finish the current game before starting a new one.`, ephemeral: true });
        }

        // Create a temporary channel (public)
        let tempChannel;
        try {
            tempChannel = await interaction.guild.channels.create({
                name: `word-association-${commandUser.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: interaction.guild.roles.everyone,
                        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages], // Public access
                    },
                    {
                        id: commandUser.id,
                        allow: [PermissionsBitField.Flags.SendMessages],
                    },
                ],
            });
        } catch (error) {
            console.error('Error creating temporary channel:', error);
            if (!interaction.replied) {
                await interaction.reply({ content: 'Failed to create a temporary channel for the game.', ephemeral: true });
            }
            return;
        }

        // Notify about game start
        await tempChannel.send(`@everyone ${commandUser} has started a game of Word Association! Send your guesses in this channel.`);

        // Send the initial word to the command user in DM
        try {
            await commandUser.send(`The first word is: **${currentWord}**`);
        } catch (error) {
            console.error('Error sending DM to command user:', error);
            if (!interaction.replied) {
                await interaction.reply({ content: 'Failed to send DM to the game host. The game is cancelled.', ephemeral: true });
            }
            await tempChannel.delete().catch(console.error);
            return;
        }

        // Reply to interaction only once
        if (!interaction.replied) {
            await interaction.reply({ content: `Game started in ${tempChannel}. Good luck!`, ephemeral: true });
        } else {
            console.warn('Interaction already replied');
        }

        const filter = message => message.channel.id === tempChannel.id && message.author.id !== interaction.client.user.id;
        const collector = tempChannel.createMessageCollector({ filter, time: 300000 }); // 5 minutes

        const userChances = new Map();
        const userMessages = new Map();

        collector.on('collect', async message => {
            const userWord = message.content.trim().toLowerCase();
            const userId = message.author.id;

            if (userId === interaction.client.user.id) return; // Ignore bot messages

            let userChancesLeft = userChances.get(userId) ?? 3;

            if (userChancesLeft <= 0 || (userWord.startsWith('!') && (userId === commandUser.id || userChancesLeft <= 0))) {
                await message.delete().catch(console.error);
                await message.author.send('You cannot send commands in the game channel or you have no chances left.').catch(console.error);
                return;
            }

            const lastMessage = userMessages.get(userId);
            const now = Date.now();

            if (lastMessage && now - lastMessage < 5000) {
                await message.delete().catch(console.error);
                await message.author.send('Please wait a bit before sending another guess.').catch(console.error);
                return;
            }

            userMessages.set(userId, now);

            if (userWord === currentWord) {
                currentWord = userWord;
                userChances.set(userId, 3); // Reset chances if correct
                await tempChannel.send(`Great choice, ${message.author}! The new word is: **${currentWord}**`);
            } else {
                userChancesLeft -= 1;
                userChances.set(userId, userChancesLeft);

                if (userChancesLeft > 0) {
                    await tempChannel.send(`${message.author}, "${userWord}" is not related to the word. You have ${userChancesLeft} chance${userChancesLeft > 1 ? 's' : ''} left.`);
                } else {
                    await tempChannel.send(`${message.author}, you have no chances left. Game over for you!`);
                    await message.author.send('You have no chances left in the Word Association game. The game is over for you.').catch(console.error);
                }
            }
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                commandUser.send('No one responded to your Word Association game. The game has ended.');
            } else {
                tempChannel.send('The game has ended. Thank you for playing!');
            }
            tempChannel.delete().catch(console.error);
        });
    }
};

// Helper function to determine if two words are related (simple placeholder logic)
function isRelated(word1, word2) {
    // Replace with actual word association logic
    return word1.length === word2.length; // Example logic
}