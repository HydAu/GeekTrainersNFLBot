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
}

module.exports = sessionHelper();