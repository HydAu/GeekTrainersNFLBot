var wrapper = function () {
    var self = this;
    self.sql = require('seriate');
    self.sql.setDefaultConfig({
        user: "nflbot",
        password: "Durango123!",
        host: "nflbot.database.windows.net",
        database: "nflbot",
        options: {
            encrypt: true
        }
    });
    self.getPlayerStats = function (nflId, callback) {
        console.log('--------', nflId);
        self.sql.execute({
            query: "SELECT p.position, p.displayName, s.stat, s.week, s.year FROM player AS p JOIN stats AS s ON (p.nflId = s.nflId) WHERE p.nflId = @nflId",
         
            params: {
                nflId: {
                      type: self.sql.Int,
                      val: nflId
                } 
            }
        }).then(function (res) {
            callback(res);
        }, function (err) {
            console.log("Error getting player Stats: ", err);
        });
    }

    self.getPlayerData = function (player, callback) {
        self.sql.execute({
            query: "SELECT TOP 1 * from player where displayName = @player order by score desc",
            params: {
                player: {
                    type: self.sql.NVARCHAR,
                    val: player,
                }
            }
        }).then(function (res) {
            callback(res[0]);
        }, function (err) {
            console.log("Something bad happened:", err);
        });
    };

    self.getPlayerList = function(position, team, callback) {
        self.sql.execute({
            query: "SELECT * FROM Player WHERE position = @position AND teamfullname = @team order by score desc",
            params: {
                position: {
                    type: self.sql.NVARCHAR,
                    val: position
                },
                team: {
                    type: self.sql.NVARCHAR,
                    val: team
                }
            }
        }).then(function (results) {
            callback(results);
        }, function (err) {
            console.log("Something bad happened:", err);
        });;
    }
};

module.exports = new wrapper();