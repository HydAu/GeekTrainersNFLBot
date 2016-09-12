var restify = require('restify');
var builder = require('botbuilder');
var dialog = require('./dialog.js');

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
    }
]);