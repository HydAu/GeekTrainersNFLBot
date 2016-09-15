const https = require('https');
const builder = require('botbuilder');

var helper = function () {
    let self = this;

    self.getTeamThumbnails = (session, teams) => teams.map(team => self.getCurrentTeamThumbnail(session, team));

    self.getCurrentTeamThumbnail = (session, team) => {
        console.log(team)
        var thumbnail = new builder.ThumbnailCard(session);
        thumbnail.title(team.teamname);
        var imageUrl = 'http://i.nflcdn.com/static/site/7.4/img/teams/' + team.abbr + '/' + team.abbr + '_logo-80x90.gif';
        thumbnail.images([builder.CardImage.create(session, imageUrl)])
        // console.log(thumbnail)
        return thumbnail;
    };

    self.getPlayerThumbnail = (session, player, button) => {
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
            if (button) {
                thumbnail.buttons([
                    new builder.CardAction.postBack(session, player.nflId, 'Select')
                ]);
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

    self.getPlayerStatsThumbnail = (session, player) => {
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

    self.convertPlayerArrayToPlayerPrompts = (players) => {
        let prompts = {};
        players.forEach((player) => {
            prompts[player.nflId] = player;
        });
        return prompts;
    }

    self.sendPlayerPrompts = (session, players) => {
        const thumbnails = players.map(player => self.getPlayerThumbnail(session, player, true));
        let message = new builder
            .Message(session)
            .attachments(thumbnails)
            .attachmentLayout('carousel');
        let prompts = session.privateConversationData.playerPrompts = self.convertPlayerArrayToPlayerPrompts(players);
        builder.Prompts.choice(session, message, prompts);
    }
};

module.exports = new helper();