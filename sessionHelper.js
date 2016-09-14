var sessionHelper = function () {
    var self = this;
    this._checkIsValidSession = function(item) {
        if (item != undefined && item != null) {
            return true;
        }
        return false;
    }
    self.setSession = function (session, key, value, private) {
        if (private) {
            session.privateConversationData.key = value;
        } else {
            session.conversationData.key = value;
        }
    }
    self.getSession = function (session, key, private) {
        if (private) {
            return session.privateConversationData.key;
        } else {
            return session.conversationData.key;
        }
    }
}

module.exports = new sessionHelper();