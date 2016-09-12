var restify = require('restify');
var builder = require('botbuilder');
var dialog = require('./dialog.js');
var https = require('https');
var querystring = require('querystring');
var sql = require('./sql');

var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function() {
    console.log('listening');
});

var connector = new builder.ChatConnector({
    // appId: process.env.MICROSOFT_APP_ID,
    // appPassword: process.env.MICROSOFT_APP_PASSWORD
});
var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());
bot.dialog('/', [
    function(session) {
        builder.Prompts.choice(session, 'What would you like to do?', ['Get Stats']);
        
    },
    function(session, results) {
        if (results.response.entity === 'Get Stats') {
            builder.Prompts.text(session, 'What player are you looking for?');
        }
    },
    function(session, results) {
        session.send(results.response);
        var playername = results.response;
        var path = '/indexes/playername/docs?api-version=2015-02-28&api-key=A1E4623A5329B55605CDE0380822AE57&search=';
        path += querystring.escape(playername);
        loadData(path, function(players) {
            var displayName = players.value[0].displayName;
            sql.getPlayerData(displayName);
        });
    }
]);

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