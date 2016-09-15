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
let playerTeamThumbnails = [];
let positionChosen = null;
let teamChosen = null;

const server = restify.createServer();

const recognizer = new builder.LuisRecognizer('https://api.projectoxford.ai/luis/v1/application?id=27282e00-256c-42d4-8db9-ca58430840d2&subscription-key=bbe1f7c4514e468295bda81fd2c7b93a');
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('listening');
});

const connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

const bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());

const dialog = new builder.IntentDialog( { recognizers: [recognizer] })
    .onDefault([
        (session, args, next) => {
            builder.Prompts.choice(session, 'What would you like to do?', ['Get Stats']);
        },
        (session, results, next) => {
            let response = results.response.entity.toLowerCase();
            session.replaceDialog('/', { message: { text: response } });
        }])
    .matches('GetStats', [
        (session, args, next) => {
            const playerName =  builder.EntityRecognizer.findEntity(args.entities, 'player');
            if (!playerName) {
                 builder.Prompts.text(session, 'Enter a Player Name or Position');
            } else {
                next( { response: playerName.entity } );
            }
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
            let players = session.privateConversationData.players = result.value;
            const thumbnail = helper.getPlayerThumbnail(session, players[0], false);
            const message = new builder.Message(session).attachments([thumbnail]);
            session.send(message);
            builder.Prompts.choice(session, 'Is this player correct?', ['Yes', 'No']);
        });
    },
    (session, results, next) => {
        if (results.response.entity.toLowerCase() === 'yes') {
            session.privateConversationData.currentPlayer = session.privateConversationData.players[0];
            session.beginDialog('/stats');
        } else if (session.privateConversationData.players.length > 1) {
            const players = session.privateConversationData.players;
            let thumbnails = [];
            for (let index = 1; index < (players.length < 6 ? players.length : 5); index++) {
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
            session.replaceDialog('/stats');
        }
    }
]);

bot.dialog('/stats', [
    (session, results) => {
        sql.getPlayerStats(session.privateConversationData.currentPlayer.nflId, function (response) {
            var params = {}
            params.otherstats = response[0];
            params.stats = JSON.parse(response[0].stat);
            var statThumbnail = helper.getPlayerStatsThumbnail(session, params);
            var message = new builder.Message(session).attachments([statThumbnail]);
            session.send(message);
            session.replaceDialog('/');

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
        teamChosen = results.response;
        // positionChosen
        sql.getPlayerList(positionChosen, teamChosen, function (response) {
            for (var i = 0; i < response.length; i++) {
                var thumbnail = helper.getPlayerThumbnail(session, response[i], true);
                playerTeamThumbnails.push(thumbnail);
            }
            playerTeamThumbnails = helper.sortByScore(playerTeamThumbnails);
            var message = new builder.Message(session).attachments(playerTeamThumbnails).attachmentLayout('carousel');
            session.send(message);
            playerTeamThumbnails = [];
        });
    }
]);