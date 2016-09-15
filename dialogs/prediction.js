const builder = require('botbuilder');

module.exports = new builder.IntentDialog()
    .matches(/compare ?players/i, [
        
    ]);