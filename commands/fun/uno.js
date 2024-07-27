const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');

const colors = ['Red', 'Yellow', 'Green', 'Blue'];
const values = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Skip', 'Reverse', 'Draw Two'];
const specialCards = ['Wild', 'Wild Draw Four'];

function createDeck() {
    let deck = [];
    for (let color of colors) {
        for (let value of values) {
            deck.push(`${color} ${value}`);
            if (value !== '0') deck.push(`${color} ${value}`);
        }
    }
    for (let special of specialCards) {
        for (let i = 0; i < 4; i++) {
            deck.push(special);
        }
    }
    return deck;
}

class UnoGame {
    constructor(channel) {
        this.channel = channel;
        this.players = new Map();
        this.deck = createDeck();
        this.discardPile = [];
        this.currentPlayerIndex = 0;
        this.direction = 1; // 1 for normal, -1 for reverse
        this.started = false;
        this.ready = false;
        this.timer = null;
        this.turnTimeout = null;
    }

    shuffleDeck() {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }
    }

    drawCard() {
        if (this.deck.length === 0) {
            this.deck = this.discardPile;
            this.discardPile = [];
            this.shuffleDeck();
        }
        return this.deck.pop();
    }

    startGame() {
        this.shuffleDeck();
        for (let player of this.players.values()) {
            player.hand = [];
            for (let i = 0; i < 7; i++) {
                player.hand.push(this.drawCard());
            }
            player.user.send(`Your UNO cards: ${player.hand.join(', ')}`);
        }
        this.discardPile.push(this.drawCard());
        this.started = true;
        this.channel.permissionOverwrites.edit(this.channel.guild.roles.everyone.id, { VIEW_CHANNEL: false });
        this.channel.permissionOverwrites.edit(Array.from(this.players.values()).map(p => p.user.id), { VIEW_CHANNEL: true });

        this.startTurn();
    }

    startTurn() {
        const currentPlayer = this.getCurrentPlayer();
        const embed = new EmbedBuilder()
            .setTitle('UNO Turn!')
            .setDescription(`${currentPlayer.user.username}'s turn! You have 20 seconds to play a card.`);

        this.channel.send({ embeds: [embed] });
        this.turnTimeout = setTimeout(() => this.nextTurn(), 20000);
    }

    nextTurn() {
        clearTimeout(this.turnTimeout);
        this.nextPlayer();
        if (!this.ready) {
            this.startTurn();
        }
    }

    nextPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + this.direction + this.players.size) % this.players.size;
    }

    getCurrentPlayer() {
        return Array.from(this.players.values())[this.currentPlayerIndex];
    }

    endGame(reason) {
        clearTimeout(this.turnTimeout);
        this.channel.send(`Game ended: ${reason}`);
        games.delete(this.channel.id);
    }
}

const games = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('uno')
        .setDescription('Play UNO')
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Start a new UNO game'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('join')
                .setDescription('Join an existing UNO game'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('ready')
                .setDescription('Start the game if enough players are ready'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('play')
                .setDescription('Play a card')
                .addStringOption(option =>
                    option.setName('card')
                        .setDescription('The card to play')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('draw')
                .setDescription('Draw a card')),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const channelId = interaction.channel.id;
        const guild = interaction.guild;
        let game = games.get(channelId);

        if (subcommand === 'start') {
            if (game) {
                return interaction.reply('A game is already in progress in this channel!');
            }

            const tempChannel = await guild.channels.create({
                name: `uno-${interaction.user.username}`,
                type: 0, // GUILD_TEXT
                parent: interaction.channel.parent,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        deny: [PermissionsBitField.Flags.ViewChannel],
                    },
                    {
                        id: interaction.user.id,
                        allow: [PermissionsBitField.Flags.ViewChannel],
                    },
                ],
            });

            const newGame = new UnoGame(tempChannel);
            games.set(channelId, newGame);
            newGame.players.set(interaction.user.id, { user: interaction.user, hand: [] });

            const embed = new EmbedBuilder()
                .setTitle('UNO Game Started!')
                .setDescription(`Game started by ${interaction.user.username}. Minimum 2 players needed to start. Type \`/uno join\` to join the game.`);

            interaction.reply({ content: `Game channel created: ${tempChannel}`, embeds: [embed] });
        } else {
            game = games.get(channelId);
            if (!game) {
                return interaction.reply('No game is in progress in this channel. Start a new game with `/uno start`.');
            }

            if (subcommand === 'join') {
                if (game.started) {
                    return interaction.reply('The game has already started. You cannot join now.');
                }

                if (game.players.has(interaction.user.id)) {
                    return interaction.reply('You are already in the game!');
                }

                game.players.set(interaction.user.id, { user: interaction.user, hand: [] });
                while (game.players.get(interaction.user.id).hand.length < 7) {
                    game.players.get(interaction.user.id).hand.push(game.drawCard());
                }

                const embed = new EmbedBuilder()
                    .setTitle('UNO Game Join Confirmation')
                    .setDescription(`You have joined the UNO game! Here are your cards: ${game.players.get(interaction.user.id).hand.join(', ')}`);

                interaction.reply({ embeds: [embed] });
            } else if (subcommand === 'ready') {
                if (game.players.size < 2) {
                    return interaction.reply('At least 2 players are required to start the game.');
                }

                if (game.ready) {
                    return interaction.reply('Game already started.');
                }

                game.ready = true;
                game.startGame();

                const embed = new EmbedBuilder()
                    .setTitle('UNO Game Started!')
                    .setDescription(`The game has started! It is ${game.getCurrentPlayer().user.username}'s turn.`);

                game.channel.send({ embeds: [embed] });
                interaction.reply('Game has started!');
            } else if (subcommand === 'play') {
                const card = interaction.options.getString('card');
                const player = game.players.get(interaction.user.id);

                if (!player) {
                    return interaction.reply('You are not in the game!');
                }

                const cardIndex = player.hand.indexOf(card);
                if (cardIndex === -1) {
                    return interaction.reply('You do not have that card!');
                }

                player.hand.splice(cardIndex, 1);
                game.discardPile.push(card);
                game.nextPlayer();

                if (player.hand.length === 0) {
                    game.endGame(`${interaction.user.username} has won the game!`);
                    return interaction.reply(`${interaction.user.username} has won the game!`);
                }

                return interaction.reply(`${interaction.user.username} played ${card}. Next player: ${game.getCurrentPlayer().user.username}`);
            } else if (subcommand === 'draw') {
                const player = game.players.get(interaction.user.id);
                if (!player) {
                    return interaction.reply('You are not in the game!');
                }

                const card = game.drawCard();
                player.hand.push(card);

                return interaction.reply(`${interaction.user.username} drew a card: ${card}`);
            }
        }
    }
};
