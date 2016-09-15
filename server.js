const azureSearch = require('./azureSearch.js');
const helper = require('./helperFunction.js');
const teams = require('./teams.json')
const restify = require('restify');
const builder = require('botbuilder');
const https = require('https');
const querystring = require('querystring');
const sql = require('./sql');
const sessionHelper = require('./sessionHelper.js')

const server = restify.createServer();

server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('listening');
});

const connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

const bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());

const dialog = new builder.IntentDialog()
    .onDefault([
        (session, args, next) => {
            builder.Prompts.choice(session, 'What would you like to do?', ['Get Stats']);
        },
        (session, results, next) => {
            let response = results.response.entity.toLowerCase();
            session.replaceDialog('/', { message: { text: response } });
        }])
    .matches(/^get ?stats$/i, [
        (session, results) => {
            builder.Prompts.text(session, 'Enter a Player Name or Position');
        },
        (session, results, next) => {
            azureSearch.getPosition(results.response, (position) => {
                if (position) {
                    session.privateConversationData.position = position;
                    session.replaceDialog('/position');
                } else {
                    session.privateConversationData.playerName = results.response;
                    session.replaceDialog('/player');
                }
            });
        }
    ]);

bot.dialog('/', dialog);

bot.dialog('/player', [
    (session) => {
        let playerName = session.privateConversationData.playerName;
        session.sendTyping();
        azureSearch.getPlayers(playerName, (allPlayers) => {
            let firstPlayer = session.privateConversationData.firstPlayer = allPlayers.shift();
            const thumbnail = helper.getPlayerThumbnail(session, firstPlayer, false);
            const playerRecommendations = session.privateConversationData.playerRecommendations = allPlayers;
            const message = new builder.Message(session).attachments([thumbnail]);
            session.send(message);
            builder.Prompts.choice(session, 'Is this player correct?', ['Yes', 'No']);
        });
    },
    (session, results, next) => {
        if (results.response.entity.toLowerCase() === 'yes') {
            session.privateConversationData.currentPlayer = session.privateConversationData.firstPlayer;
            session.beginDialog('/stats');
        } else if (session.privateConversationData.playerRecommendations.length > 1) {
            helper.sendPlayerPrompts(session, session.privateConversationData.playerRecommendations);
        } else {
            next();
        }
    },
    (session, results, next) => {
        helper.handlePlayerPromptResults(session, results);
    }
]);


bot.dialog('/stats', [
    (session, results) => {
        sql.getPlayerStats(session.privateConversationData.currentPlayer.nflId, function (response) {
            var params = {}
            params.otherstats = response[0];
            // send stat based on player Type
            params.stats = JSON.parse(response[0].stat);
            var statThumbnail = helper.getPlayerStatsThumbnail(session, params);
            var message = new builder.Message(session).attachments([statThumbnail]);
            session.send(message);
            session.endConversation();
        });
    }
])


bot.dialog('/position', [
    (session, results) => { // "What Position does this player play?" // ShowTeams
        const teamThumbnails = helper.getTeamThumbnails(session, teams);
        const message = new builder.Message(session).attachments(teamThumbnails).attachmentLayout('carousel');
        session.send(message);
        builder.Prompts.text(session, 'Type your team name');
    },
    (session, results) => { // Get potential players from teamname/position
        const teamChosen = session.privateConversationData.teamChosen = results.response;
        const positionChosen = session.privateConversationData.position;
        sql.getPlayerList(positionChosen.Abbr, teamChosen, (players) => {
            helper.sendPlayerPrompts(session, players);
        });
    },
    (session, results) => { // route them
        helper.handlePlayerPromptResults(session, results);
    }
]);