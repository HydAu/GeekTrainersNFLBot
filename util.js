var sessionHelper = function () {
    this.setSession = function (session, key, value, private) {
        if (private) {
            session.privateConversationData.key = value;
        } else {
            session.conversationData.key = value;
        }
    }
}

module.exports = sessionHelper();