var sessionHelper = function () {
    this._checkIsValidSession = function() {
        if (session != undefined && session != null) {
            return true;
        }
    }

    this.setSession = function (session, key, value, private) {
        if (private) {
            session.privateConversationData.key = value;
        } else {
            session.conversationData.key = value;
        }
    }
}

module.exports = sessionHelper();