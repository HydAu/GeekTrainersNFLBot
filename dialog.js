var builder = require('botbuilder');

var https = require('https');
var querystring = require('querystring');

var model = process.env.LUIS_MODEL;
var recognizer = new builder.LuisRecognizer(model)
var dialog = new builder.IntentDialog({ recognizers: [recognizer] });

// dialog code here

module.exports = dialog;