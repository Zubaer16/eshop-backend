import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import passport from 'passport';
import { envConfig } from '../../config/env';
import { OAuthService } from '../../modules/auth/oauth.service';
import logger from '../../config/logger';

let isPassportConfigured = false;

export const configurePassport = (oauthService: OAuthService) => {
  if (isPassportConfigured) {
    return passport;
  }

  if (!envConfig.GOOGLE_CLIENT_ID || !envConfig.GOOGLE_CLIENT_SECRET) {
    logger.warn('Google OAuth not configured - skipping passport strategy setup');
    isPassportConfigured = true;
    return passport;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: envConfig.GOOGLE_CLIENT_ID,
        clientSecret: envConfig.GOOGLE_CLIENT_SECRET,
        callbackURL: envConfig.GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const user = await oauthService.findOrCreateUser(profile, 'GOOGLE');
          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );

  isPassportConfigured = true;
  return passport;
};
