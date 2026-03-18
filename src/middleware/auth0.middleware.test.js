const { isAdmin } = require('./auth0.middleware');

const ROLES_CLAIM = 'https://activitrax.app/roles';

describe('isAdmin', () => {
  test('returns true when user has admin role', () => {
    const req = { auth: { payload: { [ROLES_CLAIM]: ['admin'] } } };
    expect(isAdmin(req)).toBe(true);
  });

  test('returns false when user has no roles', () => {
    const req = { auth: { payload: { [ROLES_CLAIM]: [] } } };
    expect(isAdmin(req)).toBe(false);
  });

  test('returns false when user has other roles but not admin', () => {
    const req = { auth: { payload: { [ROLES_CLAIM]: ['user', 'moderator'] } } };
    expect(isAdmin(req)).toBe(false);
  });

  test('returns false when roles claim is missing', () => {
    const req = { auth: { payload: {} } };
    expect(isAdmin(req)).toBe(false);
  });

  test('returns false when auth payload is missing', () => {
    const req = {};
    expect(isAdmin(req)).toBe(false);
  });
});
