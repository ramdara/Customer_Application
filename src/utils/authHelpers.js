import { fetchAuthSession } from 'aws-amplify/auth';
// import { AuthenticatorContext } from '@aws-amplify/ui-react';

/**
 * Fetches the current authenticated user's tokens (ID & access).
 * Returns: { accessToken, idToken } or throws an error.
 */
export const getAuthTokens = async () => {
  try {
    const session = await fetchAuthSession();
    const tokens = session.tokens ?? {};
    return {
      accessToken: tokens.accessToken?.toString(),
      idToken: tokens.idToken?.toString(),
      userName: tokens.idToken?.payload?.name,
    };
  } catch (err) {
    console.error('Failed to fetch auth tokens', err);
    throw err;
  }
};

/**
 * Fetches the current user's email from Cognito user attributes.
 */
export const getUserEmail = (user) => {
  // Return the email attribute from Cognito user
  return user?.signInDetails?.loginId || '';
};

/**
 * Fetches the current user's Cognito user ID (sub) from attributes.
 */
export const getUserId = (user) => {
  // 'sub' is the unique identifier in Cognito user attributes
  return user?.userId || '';
};

