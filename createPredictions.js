"use strict";
const fs = require('fs');
const sql = require('seriate');
sql.setDefaultConfig({
        user: "nflbot",
        password: "Durango123!",
        host: "nflbot.database.windows.net",
        database: "nflbot",
        options: {
            encrypt: true
        }
    });

let headers;
let first = true;
let players = [];
fs.readFileSync('./predictions.tsv').toString().split('\r\n').forEach((line) => {
    if(first) {
        headers = line.split('\t');
        first = false;
    } else {
        let currentPlayerLine = line.split('\t');
        let currentPlayer = {};
        for(let index = 0; index < currentPlayerLine.length; index++) {
            currentPlayer[headers[index]] = currentPlayerLine[index];
        }
        // players.push(currentPlayer);
        sql.execute({
            query: 'UPDATE dbo.Player SET predictions = @currentPlayer WHERE displayName = @displayName',
            params: {
                currentPlayer: {
                    type: sql.NVARCHAR,
                    val: JSON.stringify(currentPlayer)
                },
                displayName: {
                    type: sql.NVARCHAR,
                    val: currentPlayer.Player
                }
            }
        })
    }
});