import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate
} from "react-router-dom";
import SetThreshold from './pages/SetThreshold';
import InputForm from "./pages/InputForm";
import HomeRedirect from './pages/HomeRedirect';
import ProtectedRoute from "./components/ProtectedRoute";
import './App.css';
import { Amplify } from 'aws-amplify';
import { Authenticator, withAuthenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import awsconfig from './aws-exports';
import NavBar from "./components/NavBar";

Amplify.configure(awsconfig);

function App() {
  return (
    <div className="App">
      <Authenticator>
        {({ signOut }) => (
          <Router>
            <div className="d-flex min-vh-100">
              <NavBar signOut={signOut} />
              <main className="flex-grow-1 p-4 bg-light">
                <Routes>
                  <Route path="/" element={<ProtectedRoute><HomeRedirect /></ProtectedRoute>} />
                  <Route path="/input" element={<ProtectedRoute><InputForm /></ProtectedRoute>} />
                  <Route path="/set-threshold" element={<ProtectedRoute><SetThreshold /></ProtectedRoute>} />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </main>
            </div>
          </Router>
        )}
      </Authenticator>
    </div>
  );
}

export default withAuthenticator(App);
