var restify = require('restify');
var builder = require('botbuilder');
var dialog = require('./dialog.js');
var https = require('https');
var querystring = require('querystring');
var sql = require('./sql');

var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('listening');
});
var playersReturnedFromSearch = [];
var playerThumbnails = [];
var connector = new builder.ChatConnector({
    // appId: process.env.MICROSOFT_APP_ID,
    // appPassword: process.env.MICROSOFT_APP_PASSWORD
});
var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());
bot.dialog('/', [
    function (session) {
        builder.Prompts.choice(session, 'What would you like to do?', ['Get Stats']);

    },
    function (session, results) {
        if (results.response.entity === 'Get Stats') {
            builder.Prompts.text(session, 'What player are you looking for?');
        }
    },
    function (session, results) {
        var playername = results.response;
        var path = '/indexes/tagscoreplayer/docs?api-version=2015-02-28&api-key=A1E4623A5329B55605CDE0380822AE57&search=';
        path += querystring.escape(playername);
        loadData(path, function (players) {
            playersReturnedFromSearch = players.value;
            for (var i = 0; i < 5; i++) {
                sql.getPlayerData(playersReturnedFromSearch[i].displayName, function (player) {
                    var thumbnail = getPlayerThumbnailWithButton(session, player);
                    playerThumbnails.push(thumbnail);
                });
            }
            var displayName = players.value[0].displayName;
            sql.getPlayerData(displayName, function (player) {
                var thumbnail = getPlayerThumbnail(session, player);
                var message = new builder.Message(session).attachments([thumbnail]);
                session.send(message);
                builder.Prompts.choice(session, 'Is this player correct?', ['Yes', 'No']);
            });
        });
    },
    function (session, results, next) {
        if (results.response.entity == 'Yes') {
            //send player to other dialog
        } else {
            playerThumbnails = sortByScore(playerThumbnails);
            var message = new builder.Message(session).attachments(playerThumbnails).attachmentLayout('carousel');
            session.send(message);
            builder.Prompts.choice(session, '', ['Player Not Listed']);
        }
    },
    function (session, results) {
        if(results.response.entity == 'Player Not Listed'){
            //loop through position, etc
        } else {
            //send player to other dialog (playerName = results.response.entity)
        }
    },
]);

function getPlayerThumbnail(session, player) {
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
};
function getPlayerThumbnailWithButton(session, player) {
    var thumbnail = new builder.ThumbnailCard(session);
    thumbnail.data.score = player.score;
    thumbnail.title(player.displayName);
    var imageUrl = 'http://static.nfl.com/static/content/public/static/img/fantasy/transparent/200x200/' + player.esbId + '.png '
    thumbnail.images([builder.CardImage.create(session, imageUrl)]);
    thumbnail.subtitle(player.position + ', ' + player.teamFullName);
    thumbnail.buttons([
        builder.CardAction.imBack(session, player.displayName, 'Select')
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
    for (var i = 0; i < thumbnails.length; i++) {
        var maximumScore = 0;
        var maxIndex;
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