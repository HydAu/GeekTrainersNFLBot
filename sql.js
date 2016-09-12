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

    self.getPlayerData = function (player) {
        console.log(self.sql)
        self.sql.execute({
            query: "SELECT * from TeamPlayer where displayName = '" + player + "'"
        }).then(function (res) {
            results = res;
            console.log(results);
        }, function (err) {
            console.log("Something bad happened:", err);
        });
    };
};

module.exports = new wrapper();