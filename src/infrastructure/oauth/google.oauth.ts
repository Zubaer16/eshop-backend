import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { envConfig } from '@/config/env';
import logger from '@/config/logger';

export interface GoogleOAuthProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

class GoogleOAuthClient {
  private clientId = envConfig.GOOGLE_CLIENT_ID;
  private clientSecret = envConfig.GOOGLE_CLIENT_SECRET;
  private oauthClient = new OAuth2Client(this.clientId, this.clientSecret);

  private toProfile(payload: TokenPayload): GoogleOAuthProfile {
    return {
      sub: payload.sub || '',
      email: payload.email || '',
      emailVerified: payload.email_verified === true,
      name: payload.name || undefined,
      picture: payload.picture || undefined,
    };
  }

  async getProfileFromIdToken(idToken: string): Promise<GoogleOAuthProfile> {
    if (!this.clientId) {
      throw new Error('Google OAuth not configured');
    }

    try {
      const ticket = await this.oauthClient.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload) {
        throw new Error('Invalid Google id_token payload');
      }

      if (payload.iss && !GOOGLE_ISSUERS.has(payload.iss)) {
        throw new Error('Invalid Google token issuer');
      }

      return this.toProfile(payload);
    } catch (error) {
      logger.error({ err: error }, 'Google id_token verification failed');
      throw new Error('Invalid Google id_token');
    }
  }

  async exchangeCodeForProfile(
    code: string,
    redirectUri?: string,
    codeVerifier?: string,
  ): Promise<GoogleOAuthProfile> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Google OAuth not configured');
    }

    if (!redirectUri) {
      throw new Error('redirectUri is required');
    }

    try {
      const { tokens } = await this.oauthClient.getToken({
        code,
        redirect_uri: redirectUri,
        codeVerifier,
      });

      if (!tokens.id_token) {
        throw new Error('Google token exchange missing id_token');
      }

      return this.getProfileFromIdToken(tokens.id_token);
    } catch (error) {
      logger.error({ err: error }, 'Google token exchange failed');
      throw new Error('Google token exchange failed');
    }
  }
}

export const googleOAuthClient = new GoogleOAuthClient();