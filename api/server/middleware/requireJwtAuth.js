const passport = require('passport');
const cookies = require('cookie');
const { isEnabled } = require('~/server/utils');

/**
 * Custom Middleware to handle JWT authentication, with support for OpenID token reuse
 * Switches between JWT and OpenID authentication based on cookies and environment settings
 */
const requireJwtAuth = (req, res, next) => {
  // Check if token provider is specified in cookies
  const cookieHeader = req.headers.cookie;
  const tokenProvider = cookieHeader ? cookies.parse(cookieHeader).token_provider : null;

  console.log('=== JWT Auth Middleware Debug ===');
  console.log('Cookie header exists:', !!cookieHeader);
  console.log('Token provider:', tokenProvider);
  console.log('OPENID_REUSE_TOKENS enabled:', isEnabled(process.env.OPENID_REUSE_TOKENS));

  // Use OpenID authentication if token provider is OpenID and OPENID_REUSE_TOKENS is enabled
  if (tokenProvider === 'openid' && isEnabled(process.env.OPENID_REUSE_TOKENS)) {
    console.log('Using OpenID JWT authentication');
    return passport.authenticate('openidJwt', { session: false })(req, res, next);
  }

  // Default to standard JWT authentication
  console.log('Using standard JWT authentication');
  return passport.authenticate('jwt', { session: false })(req, res, next);
};

module.exports = requireJwtAuth;
