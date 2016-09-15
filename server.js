const azureSearch = require('./azureSearch.js');
const helper = require('./helperFunction.js');
const teams = require('./teams.json')
const restify = require('restify');
const builder = require('botbuilder');
const https = require('https');
const querystring = require('querystring');
const sql = require('./sql');
const sessionHelper = require('./sessionHelper.js')
let teamThumbnails = [];


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
        let path = '/indexes/tagscoreplayer/docs?api-version=2015-02-28&api-key=A1E4623A5329B55605CDE0380822AE57&search=';
        path += querystring.escape(playerName);
        helper.loadData(path, function (result) {

            let allPlayers = result.value;
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
            const players = session.privateConversationData.playerRecommendations;
            let thumbnails = [];
            for (let index = 0; index < (players.length < 6 ? players.length : 5); index++) {
                thumbnails.push(helper.getPlayerThumbnail(session, players[index], true));
            }
            let message = new builder
                .Message(session)
                .attachments(thumbnails)
                .attachmentLayout('carousel');
            players.pop();

            var prompts = {};
            players.forEach((p) => {
                prompts[p.nflId] = p;
            });
            console.log(prompts);
            session.privateConversationData.playerPrompts = prompts;

            builder.Prompts.choice(session, message, prompts)
        } else {
            next({ response: { entity: 'Player Not Listed' } });
        }
    },
    (session, results, next) => {
        if (results.response.entity === 'Player Not Listed') {
            session.send('So sorry. Do not know that one.');
            session.replaceDialog('/', { message: { text: response } });
        } else {
            //need results.response to be the nfl id
            session.privateConversationData.currentPlayer = session.privateConversationData.playerPrompts[results.response.entity];
            session.beginDialog('/stats');
        }
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

        });
    }
])


bot.dialog('/position', [
    function (session, results) { // "What Position does this player play?" // ShowTeams
        positionChosen = session.privateConversationData.position;
        var message = new builder.Message(session).attachments(teamThumbnails).attachmentLayout('carousel');
        session.send(message);
        builder.Prompts.text(session, 'Type your team name');
    },
    function (session, results) { // Get potential players from teamname/position
        session.privateConversationData.teamChosen = results.response;
        session.privateConversationData.playerTeamThumbnails = []
        // positionChosen
        sql.getPlayerList(positionChosen, session.privateConversationData.teamChosen, function (response) {
            for (var i = 0; i < response.length; i++) {
                var thumbnail = helper.getPlayerThumbnail(session, response[i], true);
                playerTeamThumbnails.push(thumbnail);
            }
            playerTeamThumbnails = helper.sortByScore(playerTeamThumbnails);
            var message = new builder.Message(session).attachments(playerTeamThumbnails).attachmentLayout('carousel');
            session.send(message);
            session.privateConversationData.playerTeamThumbnails = [];
        });
    }
]);