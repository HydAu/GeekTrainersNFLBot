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

    self.getPlayerData = function (player, callback) {
        self.sql.execute({
            query: "SELECT TOP 1 * from player where displayName = @player",
            params: {
                player: {
                    type: self.sql.NVARCHAR,
                    val: player,
                }
            }
        }).then(function (res) {
            console.log(res[0]);
            callback(res[0]);
        }, function (err) {
            console.log("Something bad happened:", err);
        });
    };
};

module.exports = new wrapper();