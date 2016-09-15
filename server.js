/*
    Updates:
        - Get rid of global variables (thumbnails, position chosen, team chosen, etc.
        - Migrate out helper calls to separate files
        - Take a look at the buttons to see if we can bind the player
        - Make teams a JSON file
        - Consolidate the two thumbnail methods
*/


const azureSearch = require('./azureSearch.js');
const helper = require('./helperFunction.js');
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
const teams = [
    { teamname: 'San Diego Chargers', abbr: 'SD' },
    { teamname: 'Denver Broncos', abbr: 'DEN' },
    { teamname: 'Oakland Raiders', abbr: 'OAK' },
    { teamname: 'Kansas City Chiefs', abbr: 'KC' },
    { teamname: 'Jacksonville Jaguars', abbr: 'JAX' },
    { teamname: 'Tennessee Titans', abbr: 'TEN' },
    { teamname: 'Houston Texans', abbr: 'HOU' },
    { teamname: 'Indianapolis Colts', abbr: 'IND' },
    { teamname: 'New England Patriots', abbr: 'NE' },
    { teamname: 'New York Jets', abbr: 'NYJ' },
    { teamname: 'Buffalo Bills', abbr: 'BUF' },
    { teamname: 'Miami Dolphins', abbr: 'MIA' },
    { teamname: 'Pittsburgh Steelers', abbr: 'PIT' },
    { teamname: 'Baltimore Ravens', abbr: 'BAL' },
    { teamname: 'Cincinnati Bengals', abbr: 'CIN' },
    { teamname: 'Cleveland Browns', abbr: 'CLE' },
    { teamname: 'Carolina Panthers', abbr: 'CAR' },
    { teamname: 'Atlanta Falcons', abbr: 'ATL' },
    { teamname: 'New Orleans Saints', abbr: 'NO' },
    { teamname: 'Tampa Bay Buccaneers', abbr: 'TB' },
    { teamname: 'Green Bay Packers', abbr: 'GB' },
    { teamname: 'Minnesota Vikings', abbr: 'MIN' },
    { teamname: 'Chicago Bears', abbr: 'CHI' },
    { teamname: 'Detriot Lions', abbr: 'DET' },
    { teamname: 'San Francisco 49ers', abbr: 'SF' },
    { teamname: 'Arizona Cardinals', abbr: 'ARI' },
    { teamname: 'Los Angeles Rams', abbr: 'LA' },
    { teamname: 'Seattle Seahawks', abbr: 'SEA' },
    { teamname: 'Dallas Cowboys', abbr: 'DAL' },
    { teamname: 'Washington Redskins', abbr: 'WAS' },
    { teamname: 'New York Giants', abbr: 'NYG' },
    { teamname: 'Philadelphia Eagles', abbr: 'PHI' },
]

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
            builder.Prompts.choice(session, message, players.map(i => i.nflId))
            // builder.Prompts.choice(session, '', ['Player Not Listed']);
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
            let nflID = results.response.entity;
            var player = findPlayer(session, nflID);
            session.privateConversationData.currentPlayer = player;
            session.beginDialog('/stats');
        }
    }
]);
function findPlayer(session, integer){
    let players = session.privateConversationData.players;
    for(var i = 0; i<players.length; i++){
        if(players[i].nflId == integer){
            return players[i];
        }
    }
}


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