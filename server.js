"use strict";
const azureSearch = require('./azureSearch.js');
const helper = require('./helperFunction.js');
const teams = require('./teams.json');
const restify = require('restify');
const builder = require('botbuilder');
const https = require('https');
const querystring = require('querystring');
const sql = require('./sql');


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
            session.send(`Hi there! I'm the NFL Fantasy bot. I can help you research players, or to figure out who to start next week.`);
            session.send(`Let's get started!`);
            builder.Prompts.choice(session, 'What would you like to do?', ['Get Player Stats']);
        },
        (session, results, next) => {
            let response = results.response.entity.toLowerCase();
            session.replaceDialog('/', { message: { text: response } });
        }])
    .matches('GetStats', [
        (session, args, next) => {
            const playerName =  builder.EntityRecognizer.findEntity(args.entities, 'player');
            if (!playerName) {
                 builder.Prompts.text(session, `Who are you looking for?\n\nYou can enter a player name, or his position.`);
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
        session.sendTyping();
        azureSearch.getPlayers(playerName, (allPlayers) => {
            let firstPlayer = session.privateConversationData.firstPlayer = allPlayers.shift();
            if (firstPlayer) {
                const thumbnail = helper.getPlayerThumbnail(session, firstPlayer, false);
                const playerRecommendations = session.privateConversationData.playerRecommendations = allPlayers;
                const message = new builder.Message(session).attachments([thumbnail]);
                session.send(`I think this is who you're looking for:`)
                session.send(message);
                builder.Prompts.choice(session, 'Is this player correct?', ['Yes', 'No']);
            } else {
                session.send("Unable to find that player.");
                session.endConversation();
                session.replaceDialog("/"); // ('/', { message: { text: "get stats" } });
            }
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
        session.send(`Let me go get his most recent stats...`);
        sql.getPlayerStats(session.privateConversationData.currentPlayer.nflId, function (response) {
            var params = {}
            params.otherstats = response[0];
            params.stats = JSON.parse(response[0].stat);
            var statThumbnail = helper.getPlayerStatsThumbnail(session, params);
            var message = new builder.Message(session).attachments([statThumbnail]);
            session.send(`Here's his most recent week:`);            
            session.send(message);
            session.send(`Let's look for someone else!`);
            session.replaceDialog('/', { message: { text: 'get stats' } });
        });
    }
])

bot.dialog('/position', [
    (session, results) => { // "What Position does this player play?" // ShowTeams
        session.send('Here is a list of NFL teams.')
        const teamThumbnails = helper.getTeamThumbnails(session, teams);
        const message = new builder.Message(session).attachments(teamThumbnails).attachmentLayout('carousel');
        session.send(message);
        builder.Prompts.text(session, `If you type the name, I can load all of the ${session.privateConversationData.position}s for that team.`);
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