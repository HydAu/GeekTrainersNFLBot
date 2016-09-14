var sessionHelper = function () {
    this.setSession = function (session, key, value, private = false) {
        if (private) {
            session.privateConversationData.key = value;
        } else {
            session.conversationData.key = value;
        }
    }
}

module.exports = sessionHelper();