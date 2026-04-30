import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import passport from 'passport';
import { envConfig } from '../../config/env';
import { OAuthService } from '../../modules/auth/oauth.service';

let isPassportConfigured = false;

export const configurePassport = (oauthService: OAuthService) => {
  if (isPassportConfigured) {
    return passport;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: envConfig.GOOGLE_CLIENT_ID as string,
        clientSecret: envConfig.GOOGLE_CLIENT_SECRET as string,
        callbackURL: envConfig.GOOGLE_CALLBACK_URL as string,
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
