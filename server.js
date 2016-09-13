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
var positionChosen = null;
var teams = [
    {teamname:'Chargers', abbr:'SD'}, {teamname:'Broncos', abbr:'DEN'}, {teamname:'Raiders', abbr:'OAK'}, {teamname:'Chiefs', abbr:'KC'}, 
    {teamname:'Jaguars', abbr:'JAX'}, {teamname:'Titans', abbr:'TEN'}, {teamname:'Texans', abbr:'HOU'}, {teamname:'Colts', abbr:'IND'}, 
    {teamname:'Patriots', abbr:'NE'}, {teamname:'Jets', abbr:'NYJ'}, {teamname:'Bills', abbr:'BUF'}, {teamname:'Dolphins', abbr:'MIA'},
    {teamname:'Steelers', abbr:'PIT'}, {teamname:'Ravens', abbr:'BAL'}, {teamname:'Bengals', abbr:'CIN'}, {teamname:'Browns', abbr:'CLE'}, 
    {teamname:'Panthers', abbr:'CAR'}, {teamname:'Falcons', abbr:'ATL'}, {teamname:'Saints', abbr:'NO'}, {teamname:'Buccaneers', abbr:'TB'},
    {teamname:'Packers', abbr:'GB'}, {teamname:'Vikings', abbr:'MIN'}, {teamname:'Bears', abbr:'CHI'}, {teamname:'Lions', abbr:'DET'}, 
    {teamname:'49ers', abbr:'SF'}, {teamname:'Cardinals', abbr:'ARI'}, {teamname:'Rams', abbr:'LA'}, {teamname:'Seahawks', abbr:'SEA'},
    {teamname:'Cowboys', abbr:'DAL'}, {teamname:'Redskins', abbr:'WAS'}, {teamname:'Giants', abbr:'NYG'}, {teamname:'Eagles', abbr:'PHI'},
]

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
    function (session, results) { // After GetStats
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
        if (results.response.entity === 'Yes') {
            //send player to other dialog
        } else {
            playerThumbnails = sortByScore(playerThumbnails);
            var message = new builder.Message(session).attachments(playerThumbnails).attachmentLayout('carousel');
            session.send(message);
            builder.Prompts.choice(session, '', ['Player Not Listed', 'Retype Name']);
        }
    },
    function (session, results) { // Player not listed
        if (results.response.entity === 'Player Not Listed') {
            builder.Prompts.choice(session, 'What position does this player play?', ['QB', 'RB', 'WR', 'TE', 'K', 'DST']); // Unknown?
        } else if (results.response.entity === 'Retype Name') {
            // send back to beginning
        } else {
            //send player to other dialog (playerName = results.response.entity)
        }
    },
    function (session, results) { // "What Position does this player play?" // ShowTeams
        positionChosen = results.response.entity;
        
    },
]);

function getCurrentTeamThumbnail(session, teamobj) {
    var thumbnail = new builder.ThumbnailCard(session);
    thumbnail.title(teamobj.teamname);
    var imageUrl = 'http://i.nflcdn.com/static/site/7.4/img/teams/' + teamobj.abbr + '/' + teamobj.abbr + '_logo-80x90.gif';
    thumbnail.images([builder.CardImage.create(session, imageUrl)]);
} 

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