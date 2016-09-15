const azureSearch = require('./azureSearch.js');
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
        loadData(path, function (result) {
            let players = session.privateConversationData.players = result.value;
            const thumbnail = getPlayerThumbnail(session, players[0]);
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
                thumbnails.push(getPlayerThumbnailWithButton(session, players[index]));
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
            var statThumbnail = getPlayerStatsThumbnail(session, params);
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
                var thumbnail = getPlayerThumbnailWithButton(session, response[i]);
                playerTeamThumbnails.push(thumbnail);
            }
            playerTeamThumbnails = sortByScore(playerTeamThumbnails);
            var message = new builder.Message(session).attachments(playerTeamThumbnails).attachmentLayout('carousel');
            session.send(message);
            playerTeamThumbnails = [];
        });
    }
]);

function getCurrentTeamThumbnail(session, team) {
    var thumbnail = new builder.ThumbnailCard(session);
    thumbnail.title(team.teamname);
    var imageUrl = 'http://i.nflcdn.com/static/site/7.4/img/teams/' + team.abbr + '/' + team.abbr + '_logo-80x90.gif';
    thumbnail.images([builder.CardImage.create(session, imageUrl)])
    return thumbnail;
}

function getPlayerThumbnail(session, player) {
    try {
        var thumbnail = new builder.ThumbnailCard(session);
        thumbnail.title(player.displayName);
        var imageUrl = 'http://static.nfl.com/static/content/public/static/img/fantasy/transparent/200x200/' + player.esbId + '.png '
        thumbnail.images([builder.CardImage.create(session, imageUrl)]);

        thumbnail.subtitle(player.position + ', ' + player.teamFullName);

        var text = '';
        if (player.yearsOfExperience) text += 'Years in league: ' + player.yearsOfExperience + ' \n';
        if (player.jerseyNumber) text += 'Jersey: ' + player.jerseyNumber + ' \n';
        thumbnail.text(text);

        // thumbnail.tap(new builder.CardAction.openUrl(session, player.html_url));
        var urlPlayer = player.displayName.replace(' ', '').replace('-', '').toLowerCase();
        var url = 'http://www.nfl.com/player/' + urlPlayer + '/' + player.nflId + '/profile';
        thumbnail.tap(new builder.CardAction.openUrl(session, url));
        return thumbnail;
    } catch (err) {
        console.log(err)
    }
};

function getPlayerThumbnailWithButton(session, player) {
    var thumbnail = new builder.ThumbnailCard(session);
    thumbnail.data.score = player.score;
    thumbnail.title(player.displayName);
    var imageUrl = 'http://static.nfl.com/static/content/public/static/img/fantasy/transparent/200x200/' + player.esbId + '.png '
    thumbnail.images([builder.CardImage.create(session, imageUrl)]);
    thumbnail.subtitle(player.position + ', ' + player.teamFullName);
    thumbnail.buttons([
        new builder.CardAction.postBack(session, player.nflId, 'Select')
    ]);
    var text = '';
    if (player.yearsOfExperience) text += 'Years in league: ' + player.yearsOfExperience + ' \n';
    if (player.jerseyNumber) text += 'Jersey: ' + player.jerseyNumber + ' \n';
    thumbnail.text(text);

    // thumbnail.tap(new builder.CardAction.openUrl(session, player.html_url));
    return thumbnail;
};

function loadData(path, callback) {
    var options = {
        host: 'nflbot.search.windows.net',
        port: 443,
        path: path,
        method: 'GET'
    };
    var request = https.request(options, function (response) {
        var data = '';
        response.on('data', function (chunk) { data += chunk; });
        response.on('end', function () {
            callback(JSON.parse(data));
        });
    });
    request.end();
}

function sortByScore(thumbnails) {
    thumbnails = thumbnails.slice(1);
    for (var i = 0; i < thumbnails.length; i++) {
        var maximumScore = thumbnails[i].data.score;
        var maxIndex = i;
        for (var j = i; j < thumbnails.length; j++) {
            if (thumbnails[j].data.score > maximumScore) {
                maximumScore = thumbnails[j].data.score;
                maxIndex = j;
            };
        }
        if (maxIndex != null) {
            var temp = thumbnails[i];
            thumbnails[i] = thumbnails[maxIndex];
            thumbnails[maxIndex] = temp;
        }
    }
    return thumbnails;
}


function getPlayerStatsThumbnail(session, player) {
    var thumbnail = new builder.ThumbnailCard(session);
    var text = '';
    thumbnail.title(player.otherstats.displayName)
    thumbnail.subtitle(`${player.otherstats.year} Season | Week ${player.otherstats.week}`);
    if (player.otherstats.position == 'QB') {
        text += `Passing: ${player.stats.passing.completions}/${player.stats.passing.attempts},
            Yards: ${player.stats.passing.yards}\n
            Touchdowns: ${player.stats.passing.touchdowns}\n
            Interceptions: ${player.stats.passing.interceptions}\n `;
    }
    if (player.otherstats.position == 'QB' || player.otherstats.position == 'TE' || player.otherstats.position == 'WR' || player.otherstats.position == 'RB') {
        text += `
                Carries: ${player.stats.rushing.carries},
                Yards: ${player.stats.rushing.yards},
                Touchdowns: ${player.stats.rushing.touchdowns},
                Fumbles Lost: ${player.stats.rushing.fumblesLost}`;
    }
    if (player.otherstats.position == 'RB' || player.otherstats.position == 'TE' || player.otherstats.position == 'WR') {
        text += `
                 Catches: ${player.stats.receiving.catches},
                  Yards: ${player.stats.receiving.yards},
                  Touchdowns: ${player.stats.receiving.touchdowns}, 
                  Fumbles Lost: ${player.stats.receiving.fumblesLost}`
    }

    thumbnail.text(text);

    return thumbnail;
};


function isPosition(text) {

}