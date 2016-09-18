"use strict";
const https = require('https');
const builder = require('botbuilder');
var sql = require('./sql.js');
var helper = function () {
    let self = this;

    self.getTeamThumbnails = (session, teams) => teams.map(team => self.getCurrentTeamThumbnail(session, team));

    self.getCurrentTeamThumbnail = (session, team) => {
        var thumbnail = new builder.ThumbnailCard(session);
        thumbnail.title(team.teamname);
        var imageUrl = 'http://i.nflcdn.com/static/site/7.4/img/teams/' + team.abbr + '/' + team.abbr + '_logo-80x90.gif';
        thumbnail.images([builder.CardImage.create(session, imageUrl)])
        return thumbnail;
    };

    self.getPlayerThumbnail = (session, player, requiresButton) => {
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
            if (requiresButton) {
                // thumbnail.buttons([
                //     new builder.CardAction.postBack(session, player.nflId, 'Select')
                // ]);
                thumbnail.tap(new builder.CardAction.imBack(session, player.nflId));
            } else {
                // thumbnail.tap(new builder.CardAction.openUrl(session, player.html_url));
                var urlPlayer = player.displayName.replace(' ', '').replace('-', '').toLowerCase();
                var url = 'http://www.nfl.com/player/' + urlPlayer + '/' + player.nflId + '/profile';
                thumbnail.tap(new builder.CardAction.openUrl(session, url));
            }
            return thumbnail;
        } catch (err) {
            console.log(err)
        }
    };

    self.loadData = (path, callback) => {
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
    };

    self.sortByScore = (thumbnails) => {
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
    };

    self.getPlayerStatsText = (session, player) => {
        var text = `Last week, ${player.otherstats.displayName} posted the following stats: \n\n`;
        if (player.otherstats.position === 'QB') {
            text += `He threw ${player.stats.passing.completions} completions on ${player.stats.passing.attempts} attempts and ${player.stats.passing.yards} yards. He also threw for ${player.stats.passing.touchdowns} TDs and ${player.stats.passing.interceptions} interceptions. On the ground, he racked up ${player.stats.rushing.yards} on ${player.stats.rushing.carries}, with ${player.stats.rushing.touchdowns} TDs and ${player.stats.rushing.fumblesLost} fumbles.`;
        } else if (player.otherstats.position === 'RB') {
            text += `He carried the ball ${player.stats.rushing.carries} times for ${player.stats.rushing.yards}. He scored ${player.stats.rushing.touchdowns} TDs, and lost the ball ${player.stats.rushing.fumblesLost} times. He also caught the ball ${player.stats.receiving.catches} times, put up ${player.stats.receiving.yards} and ${player.stats.receiving.touchdowns} TDs.`;
        } else if (player.otherstats.position === 'TE' || player.otherstats.position === 'WR') {
            text += `He caught ${player.stats.receiving.catches} balls, for ${player.stats.receiving.yards}. He also scored ${player.stats.receiving.touchdowns} TDs, while fumbling ${player.stats.receiving.fumblesLost} times.`
        }

        return text;
    };

    self.convertPlayerArrayToPlayerPrompts = (players) => {
        let prompts = {};
        players.forEach((player) => {
            prompts[player.nflId] = player;
        });
        return prompts;
    }

    self.sendPlayerPrompts = (session, players) => {
        session.send(`Here are all of the players I found that match your query.\n\nYou can click select on the one that you're looking for.`);
        session.send(`If none of them match, you can try your query again.`);
        const thumbnails = players.map(player => self.getPlayerThumbnail(session, player, true));
        let message = new builder
            .Message(session)
            .attachments(thumbnails)
            .attachmentLayout('carousel');
        let prompts = session.privateConversationData.playerPrompts = self.convertPlayerArrayToPlayerPrompts(players);
        builder.Prompts.choice(session, message, prompts, { maxRetries: 0 });
    }

    self.handlePlayerPromptResults = (session, results) => {
        if (!results.response) {
            session.send(`I'm sorry I'm not sure who you're looking for there.`);
            session.send('Let me start a search for  ' + session.message.text + ' for you.');
            session.replaceDialog('/', { message: { text: session.message.text } });
        } else if (session.privateConversationData.playerPrompts[results.response.entity]) {
            session.privateConversationData.currentPlayer = session.privateConversationData.playerPrompts[results.response.entity];
            session.beginDialog('/stats');
        } else {
            session.send(`I'm sorry. I'm not sure who you're looking for there.`);
            session.send(`Let's try this again.`);
            session.replaceDialog('/', { message: { text: results.response } });
        }
    },
        self.getPlayerScoreForComparison = (session, nflID, callback) => {
            sql.getPlayerStats(nflID, function (response) {
                var params = {}
                params.otherstats = response[0];
                params.stats = JSON.parse(response[0].stat);
                let results = {};
                results.thumbnail = self.getPlayerStatsThumbnail(session, params);
                results.playerPoints = (params.stats.passing.yards * .04) + (params.stats.passing.touchdowns * 4) - (params.stats.passing.interceptions * 2) + (params.stats.rushing.yards * .1) + (params.stats.rushing.touchdowns * 6) - (params.stats.rushing.fumblesLost * 2) + (params.stats.receiving.yards * .1) + (params.stats.receiving.touchdowns * 6) - (params.stats.receiving.fumblesLost * 2);
                callback(results);
            });
        },
        self.getBestPlayer = (session, firstNFLID, secondNFLID, firstPlayerChosen, secondPlayerChosen, callback) => {
            let secondPlayerPoints;
            let firstPlayerPoints;
            let betterPlayerName;
            let worsePlayerName;
            let betterPoints;
            let worsePoints;
            let thumbnails = [];
            self.getPlayerScoreForComparison(session, firstNFLID, (response) => {
                self.getPlayerScoreForComparison(session, secondNFLID, (secondResponse) => {
                    firstPlayerPoints = response.playerPoints;
                    secondPlayerPoints = secondResponse.playerPoints;
                    if (secondPlayerPoints < firstPlayerPoints) {
                        betterPlayerName = firstPlayerChosen.displayName;
                        worsePlayerName = secondPlayerChosen.displayName;
                        worsePoints = Math.round(secondPlayerPoints);
                        betterPoints = Math.round(firstPlayerPoints);
                        thumbnails.push(response.thumbnail);
                        thumbnails.push(secondResponse.thumbnail);
                    } else {
                        betterPlayerName = secondPlayerChosen.displayName;
                        worsePlayerName = firstPlayerChosen.displayName;
                        worsePoints = Math.round(firstPlayerPoints);
                        betterPoints = Math.round(secondPlayerPoints);
                        thumbnails.push(secondResponse.thumbnail);
                        thumbnails.push(response.thumbnail);
                    }
                    let results = {};
                    results.playerComparisonThumbnails = thumbnails;
                    results.text = betterPlayerName + " (" + betterPoints + " FPTS) had a better week than " + worsePlayerName + " (" + worsePoints + " FPTS)."
                    callback(results);
                });
            });
        },
        self.getStatComparisonFullResults = (session, firstPlayerChosen, secondPlayerChosen) => {
            self.getBestPlayer(session, firstPlayerChosen.nflId, secondPlayerChosen.nflId, firstPlayerChosen, secondPlayerChosen, (response) => {
                const message = new builder.Message(session).attachments(response.playerComparisonThumbnails).attachmentLayout('carousel');
                session.send(message);
                builder.Prompts.text(session, response.text);
            });
        }
};

module.exports = new helper();