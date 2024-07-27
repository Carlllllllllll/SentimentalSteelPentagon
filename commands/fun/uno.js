const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, Collection } = require('discord.js');

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
        this.players = new Collection();
        this.deck = createDeck();
        this.discardPile = [];
        this.currentPlayerIndex = 0;
        this.direction = 1; // 1 for normal, -1 for reverse
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
        }
        this.discardPile.push(this.drawCard());
    }

    nextPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + this.direction + this.players.size) % this.players.size;
    }

    getCurrentPlayer() {
        return Array.from(this.players.values())[this.currentPlayerIndex];
    }
}

const games = new Collection();

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

        if (subcommand === 'start') {
            if (games.has(channelId)) {
                return interaction.reply('A game is already in progress in this channel!');
            }
            const game = new UnoGame(interaction.channel);
            games.set(channelId, game);
            game.players.set(interaction.user.id, { user: interaction.user, hand: [] });
            game.startGame();
            const embed = new EmbedBuilder()
                .setTitle('UNO Game Started!')
                .setDescription(`${interaction.user.username} has started a game of UNO! Type \`/uno join\` to join the game.`);
            return interaction.reply({ embeds: [embed] });
        }

        const game = games.get(channelId);
        if (!game) {
            return interaction.reply('No game is in progress in this channel. Start a new game with `/uno start`.');
        }

        if (subcommand === 'join') {
            if (game.players.has(interaction.user.id)) {
                return interaction.reply('You are already in the game!');
            }
            game.players.set(interaction.user.id, { user: interaction.user, hand: [] });
            return interaction.reply(`${interaction.user.username} has joined the game!`);
        }

        if (subcommand === 'play') {
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
                games.delete(channelId);
                return interaction.reply(`${interaction.user.username} has won the game!`);
            }

            return interaction.reply(`${interaction.user.username} played ${card}. Next player: ${game.getCurrentPlayer().user.username}`);
        }

        if (subcommand === 'draw') {
            const player = game.players.get(interaction.user.id);
            if (!player) {
                return interaction.reply('You are not in the game!');
            }

            const card = game.drawCard();
            player.hand.push(card);

            return interaction.reply(`${interaction.user.username} drew a card: ${card}`);
        }
    }
};
