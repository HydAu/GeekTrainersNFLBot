function setSession(session, key, value, private=false) {
    if (private) {
        session.privateConversationData.key = value;
    } else {
        session.conversationData.key = value;
    }
}