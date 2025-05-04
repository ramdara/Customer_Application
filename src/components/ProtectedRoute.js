import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthenticator } from '@aws-amplify/ui-react';

const ProtectedRoute = ({ children }) => {
  const { authStatus } = useAuthenticator(context => [context.authStatus]);

  if (authStatus !== 'authenticated') {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
