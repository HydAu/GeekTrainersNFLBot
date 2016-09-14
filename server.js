const azureSearch = require('./azureSearch.js');

var restify = require('restify');
var builder = require('botbuilder');
var https = require('https');
var querystring = require('querystring');
var sql = require('./sql');
var sessionHelper = require('./sessionHelper.js')
var teamThumbnails = [];
var playerTeamThumbnails = [];
var positionChosen = null;
var teamChosen = null;
var teams = [
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

var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('listening');
});

var connector = new builder.ChatConnector({
    // appId: process.env.MICROSOFT_APP_ID,
    // appPassword: process.env.MICROSOFT_APP_PASSWORD
});
var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());

let dialog = new builder.IntentDialog()
    .onDefault((session, args, next) => {
        builder.Prompts.choice(session, 'What would you like to do?', ['Get Stats']);
        next(); // end the dialog
    })
    .matches(/^get ?stats$/u, [
        (session, results) => {
            builder.Prompts.text(session, 'Enter a Player Name or Position');
        },
        (session, results, next) => {
            azureSearch.getPosition(results.response, (position) => {
                if (position) {
                    session.userData.position = position;
                    session.beginDialog('/position');
                } else {
                    session.userData.playerName = results.response;
                    session.beginDialog('/player');
                }
            });
        }
    ])
    ;

bot.dialog('/', dialog);

bot.dialog('/player', [
    (session) => {
        let playerName = session.userData.playerName;
        var path = '/indexes/tagscoreplayer/docs?api-version=2015-02-28&api-key=A1E4623A5329B55605CDE0380822AE57&search=';
        path += querystring.escape(playerName);
        loadData(path, function (result) {
            let players = session.userData.players = result.value;
            var thumbnail = getPlayerThumbnail(session, players[0]);
            var message = new builder.Message(session).attachments([thumbnail]);
            session.send(message);
            builder.Prompts.choice(session, 'Is this player correct?', ['Yes', 'No']);
        });
    },
    (session, results, next) => {
        if (results.response.entity.toLowerCase() === 'yes') {
            session.userData.currentPlayer = session.userData.players[0];
            session.beginDialog('/stats');
        } else {
            if (session.userData.players.length > 1) {
                let players = session.userData.players;
                let thumbnails = [];
                for (let index = 1; index < (players.length < 6 ? players.length : 5); index++) {
                    thumbnails.push(getPlayerThumbnailWithButton(session, players[index]));
                }
                let message = new builder.Message(session).attachments(thumbnails).attachmentLayout('carousel');
                builder.Prompts.choice(session, message, 'Choose player');
                builder.Prompts.choice(session, '', ['Player Not Listed', 'Retype Name']);
            } else {
                next({ response: { entity: 'Player Not Listed' } });
            }
        }
    },
    (session, results, next) => {
        if (results.response.entity === 'Player Not Listed') {
            session.endDialog('Please retry your search by either entering a player or a position');
        } else if (results.response.entity === 'Retype Name') {
            // send back to beginning
        } else {
            //send player to other dialog (playerName = results.response.entity)
        }
    }
]);

bot.dialog('/stats', [
    function (session, results) {
        sql.getPlayerStats(2506363, function (response) {
            // send stat based on player Type
            var stats = JSON.parse(response[0].stat);
            var statThumbnail = getPlayerStatsThumbnail(session, stats);
            var message = new builder.Message(session).attachments([statThumbnail]);
            session.send(message);

        });
    }
])

bot.dialog('/position', [
    function (session, results) { // "What Position does this player play?" // ShowTeams
        positionChosen = session.userData.position;
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
        thumbnail.data.id = player.id;
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
        builder.CardAction.imBack(session, player.id, 'Select')
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
    thumbnail.title(player.displayName)
    thumbnail.subtitle(player.season + ' | ' + player.week);
    var text = '';
    if (player.passing) text += 'Passing attempts/completions' + player.passing.attempts + '/' + player.passing.completions + ' \n';
    text += 'Yards: ' + player.passing.yards + " Touchdowns: " + player.passing.touchdowns + '\n';
    thumbnail.text(text);

    return thumbnail;
};


function isPosition(text) {

}