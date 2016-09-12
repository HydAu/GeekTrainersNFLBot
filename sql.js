var sql = require('seriate');
sql.setDefault({
        user: "nflbot",
        password: "Durango123!",
        host: "nflbot.database.windows.net",
        database: "nflbot",
        options: {
            encrypt: true  
        }
    }); 
var player = 'Philip Rivers';
var getPlayerData = function(player){
    sql.execute( {  
        query: "SELECT * from TeamPlayer where displayName = '" + player + "'"
    } ).then( function( res ) {
        results = res;
        console.log(results);
        module.exports = results; 
    }, function( err ) {
        console.log( "Something bad happened:", err );
    } );
};