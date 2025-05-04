import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { getAuthTokens, getUserEmail } from '../utils/authHelpers';
import { motion } from 'framer-motion';
import { ENERGY_HISTORY, CURRENT_THRESHOLD, SETUP_SNS, UNSUBSCRIBE_SNS, ALERTS, CHECK_SNS_SUBSCRIPTION } from '../utils/apiRoutes';
import { API_INVOKE_URL } from '../utils/constants';

const SetThreshold = () => {
  const { user, authStatus } = useAuthenticator();
  const [recommended, setRecommended] = useState(null);
  const [threshold, setThreshold] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [currentThreshold, setCurrentThreshold] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionArn, setSubscriptionArn] = useState('');

  const fetchRecommendedThreshold = async () => {
    // Retrieve energy history and calculate a suggested threshold (e.g., 20% above average)
    try {
      const { idToken } = await getAuthTokens();
      const customerId = getUserEmail(user);

      const res = await axios.get(
        `${API_INVOKE_URL}${ENERGY_HISTORY}`,
        {
          headers: { Authorization: `Bearer ${idToken}` },
          params: { customer_id: customerId }
        }
      );

      const history = res.data || [];
      console.log('History:', res);
      if (history.length === 0) {
        setRecommended(2); // Default fallback
        return;
      }

      // Calculate average + margin as recommended threshold
      const avg = history.reduce((acc, item) => acc + (parseFloat(item.usage) || 0), 0) / history.length;
      const suggested = Math.round(avg * 1.2); // e.g., 20% above average
      setRecommended(suggested);
      setThreshold(suggested);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch usage data');
    }
  };

  const fetchCurrentThreshold = async () => {
    // Fetch the user's current threshold value from the backend
    try {
      const { idToken } = await getAuthTokens();
      const customerId = getUserEmail(user);

      const res = await axios.get(
        `${API_INVOKE_URL}${CURRENT_THRESHOLD}`,
        {
          headers: { Authorization: `Bearer ${idToken}` },
          params: { customer_id: customerId }
        }
      );

      setCurrentThreshold(res.data.threshold);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch current threshold');
    }
  };

  const setupSnsSubscription = async () => {
    // Subscribe the user's email to SNS topic for threshold alerts
    try {
      const { idToken } = await getAuthTokens();
      const email = getUserEmail(user);
      const response = await axios.post(
        `${API_INVOKE_URL}${SETUP_SNS}`,
        { email },
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log('SNS subscription set up successfully');
      return response.data;
    } catch (err) {
      console.error('Failed to set up SNS subscription:', err);
      return null;
    }
  };

  const unsubscribeSns = async () => {
    // Unsubscribe the user's email from the SNS topic
    try {
      const { idToken } = await getAuthTokens();
      const email = getUserEmail(user);
      await axios.post(
        `${API_INVOKE_URL}${UNSUBSCRIBE_SNS}`,
        { email },
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log('Unsubscribed from SNS successfully');
    } catch (err) {
      console.error('Failed to unsubscribe from SNS:', err);
    }
  };

  const toggleSubscription = async () => {
    // Toggle SNS subscription on or off based on current state
    if (isSubscribed) {
      // Unsubscribe
      await unsubscribeSns();
      setIsSubscribed(false);
    } else {
      // Subscribe
      const response = await setupSnsSubscription();
      if (response && response.SubscriptionArn) {
        setIsSubscribed(true);
        setSubscriptionArn(response.SubscriptionArn);
      }
    }
  };

  const handleSubmit = async () => {
    // Submit the new threshold value to the backend API
    setLoading(true);
    try {
      const { idToken } = await getAuthTokens();
      const email = getUserEmail(user);

      const payload = {
        customerId: email,
        threshold: parseFloat(threshold),
      };

      await axios.post(
        `${API_INVOKE_URL}${ALERTS}`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      setMessage('Threshold set successfully!');
      fetchCurrentThreshold();
    } catch (err) {
      console.error(err);
      setError('Failed to set threshold');
    } finally {
      setLoading(false);
    }
  };

  const checkSnsSubscription = async () => {
    // Check whether the user is currently subscribed to SNS alerts
    try {
      const email = getUserEmail(user);
      const { idToken } = await getAuthTokens();
      const response = await axios.get(
        `${API_INVOKE_URL}${CHECK_SNS_SUBSCRIPTION}`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          params: { email },
        }
      );
      return response.data.isSubscribed;
    } catch (err) {
      console.error('Failed to check SNS subscription:', err);
      return false;
    }
  };

  useEffect(() => {
    // On component mount, fetch thresholds and subscription status for authenticated users
    if (authStatus === 'authenticated') {
      fetchRecommendedThreshold();
      fetchCurrentThreshold();
      checkSnsSubscription().then(isSubscribed => setIsSubscribed(isSubscribed));
    }
  }, [authStatus]);

  return (
    <div className="container py-5">
      <div className="bg-light rounded shadow-sm p-4 mb-4">
                {message && <p className="alert alert-success mt-4">{message}</p>}
        {error && <p className="alert alert-danger mt-4">{error}</p>}
        <h2 className="text-center text-primary mb-4">Set Energy Usage Threshold</h2>

        {recommended && (
          <p className="alert alert-info text-center">
            Suggested Threshold (based on recent usage): <strong>{recommended} kWh</strong>
          </p>
        )}

        {currentThreshold !== null && (
          <p className="alert alert-secondary text-center">
            Current Threshold: <strong>{currentThreshold} kWh</strong>
          </p>
        )}

        <div className="mb-4">
          <label className="form-label">Threshold (kWh):</label>
          <input
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="form-control"
          />
        </div>

        <motion.button
          onClick={handleSubmit}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className={`btn btn-primary w-100 ${loading ? 'disabled' : ''}`}
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Save Threshold'}
        </motion.button>

        <button
          onClick={toggleSubscription}
          className={`btn ${isSubscribed ? 'btn-danger' : 'btn-primary'} w-100 mt-4`}
        >
          {isSubscribed ? 'Unsubscribe from Alerts' : 'Subscribe to Alerts'}
        </button>

      </div>
    </div>
  );
};

export default SetThreshold;
