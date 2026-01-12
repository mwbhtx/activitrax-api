class TokenRevokedException extends Error {
    constructor(service, userId) {
        super(`Token revoked for ${service} user ${userId}`);
        this.name = 'TokenRevokedException';
        this.service = service;
        this.userId = userId;
    }
}

module.exports = TokenRevokedException;
