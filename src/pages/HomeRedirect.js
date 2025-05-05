// customer-usage/src/pages/HomeRedirect.js
// This component fetches and displays energy usage history, cost data, and thresholds for a customer.
import React, { useEffect, useState } from 'react'; // Core React imports
import axios from 'axios'; // HTTP client for API calls
import { useAuthenticator } from '@aws-amplify/ui-react'; // Auth hook from AWS Amplify UI
import { getAuthTokens, getUserEmail, getUserId } from '../utils/authHelpers'; // Helpers to retrieve auth tokens and user info
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'; // Charting library components
import { CURRENT_THRESHOLD, ENERGY_HISTORY, ENERGY_SUMMARY, ENERGY_COSTS } from '../utils/apiRoutes'; // API route constants
import { API_INVOKE_URL } from '../utils/constants'; // Base URL for API
import 'bootstrap/dist/css/bootstrap.min.css'; // Bootstrap styles for UI
// Main dashboard page: fetches and displays energy usage, cost details, and threshold alerts for authenticated users

const HomeRedirect = () => {
  // State hooks: user display name, usage/cost/threshold datasets, loading/error flags, date range, and summary period
  const [userName, setUserName] = useState(''); // Display name fetched from tokens
  const [historyData, setHistoryData] = useState([]); // Usage history data
  const [costData, setCostData] = useState([]); // Cost details
  const [thresholdData, setThresholdData] = useState([]); // Current threshold values

  // Calculate date range: first and last day of current month
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];

  // State hooks for user-selected date range and summary period
  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(lastDayOfMonth);
  const [period, setPeriod] = useState('weekly'); // Period options: daily, weekly, monthly, quarterly, yearly

  // Authenticated user info from Amplify
  const { user, authStatus } = useAuthenticator((context) => [context.user, context.authStatus]);
  // Derive customer_id (email) for API queries
  const customer_id = getUserEmail(user);

  // Fetch display name from ID token once authenticated
  useEffect(() => {
    if (authStatus === 'authenticated') {
      const loadUserName = async () => {
        try {
          const { userName: fetchedName } = await getAuthTokens();
          setUserName(fetchedName);
        } catch (err) {
          console.error('Failed to fetch userName', err);
        }
      };
      loadUserName();
    }
  }, [authStatus]);

  // UI state for loading and error handling
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dateError, setDateError] = useState('');
  /**
   * Fetch usage history data based on start/end dates and period aggregation.
   * idToken is required for authenticated API calls.
   */
  const fetchHistoryData = async (idToken) => {
    try {
      // Call the ENERGY_HISTORY endpoint
      await fetchThresholdData();
      const historyRes = await axios.get(
        `${API_INVOKE_URL}${ENERGY_HISTORY}`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          params: { startDate, endDate, customer_id },
        }
      );
      let data = historyRes.data || [];

      // Aggregate data based on selected period
      if (period === 'daily') {
        // already in daily granularity
      } else if (period === 'weekly') {
        // Sum usage by week (Sunday as start)
        data = data.reduce((acc, { date, usage }) => {
          const weekStart = new Date(date);
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          const week = weekStart.toISOString().slice(0, 10);
          if (!acc[week]) acc[week] = { date: week, usage: 0 };
          acc[week].usage += usage;
          return acc;
        }, {});
        data = Object.values(data);
      } else if (period === 'monthly') {
        // Sum usage by month (YYYY-MM)
        data = data.reduce((acc, { date, usage }) => {
          const month = new Date(date).toISOString().slice(0, 7);
          if (!acc[month]) acc[month] = { date: month, usage: 0 };
          acc[month].usage += usage;
          return acc;
        }, {});
        data = Object.values(data);
      } else if (period === 'quarterly') {
        // Convert monthly data into quarters
        data = data.reduce((acc, { date, usage }) => {
          const quarter = `Q${Math.ceil(new Date(date).getMonth() / 3)}`;
          if (!acc[quarter]) acc[quarter] = { date: quarter, usage: 0 };
          acc[quarter].usage += usage;
          return acc;
        }, {});
        data = Object.values(data);
      } else if (period === 'yearly') {
        // Aggregate usage by year
        data = data.reduce((acc, { date, usage }) => {
          const year = new Date(date).getFullYear();
          if (!acc[year]) acc[year] = { date: year.toString(), usage: 0 };
          acc[year].usage += usage;
          return acc;
        }, {});
        data = Object.values(data);
      }

      setHistoryData(data); // Update state
    } catch (err) {
      console.error('History data fetch error:', err);
      setError('Failed to fetch history data. Please try again later.');
    }
  };

  /**
   * Fetch cost data and aggregate by selected period.
   */
  const fetchCostData = async (idToken) => {
    try {
      const costRes = await axios.get(
        `${API_INVOKE_URL}${ENERGY_COSTS}`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          params: {
            startDate,
            endDate,
            customer_id,
          },
                }
      );
      let data = costRes.data || [];

      // Similar aggregation logic as historyData
      if (period === 'quarterly') {
        data = data.reduce((acc, { month, cost }) => {
          const quarter = `Q${Math.ceil(new Date(month).getMonth() / 3)}`;
          if (!acc[quarter]) {
            acc[quarter] = { month: quarter, cost: 0 };
          }
                    acc[quarter].cost += cost;
          return acc;
        }, {});
        data = Object.values(data);
      } else if (period === 'yearly') {
        data = data.reduce((acc, { month, cost }) => {
          const year = new Date(month).getFullYear();
          if (!acc[year]) {
            acc[year] = { month: year.toString(), cost: 0 };
          }
                    acc[year].cost += cost;
          return acc;
        }, {});
        data = Object.values(data);
      }

      setCostData(data);
    } catch (err) {
      console.error('Cost data fetch error:', err);
      setError('Failed to fetch cost data. Please try again later.');
    }
  };

  /**
   * Optional: Fetch threshold data for the customer.
   */
  const fetchThresholdData = async () => {
    try {
      const { idToken } = await getAuthTokens();
      const thresholdRes = await axios.get(
        `${API_INVOKE_URL}${CURRENT_THRESHOLD}`,
        { headers: { Authorization: `Bearer ${idToken}` }, params: { customer_id } }
      );

      setThresholdData(thresholdRes.data.threshold || []);
    } catch (err) {
      console.error('Threshold data fetch error:', err);
      setError('Failed to fetch threshold data. Please try again later.');
    }
  };

  /**
   * Master fetch that retrieves tokens and calls individual fetch functions.
   */
  const fetchData = async () => {
    if (authStatus !== 'authenticated') {
      setError('User not authenticated.');
      return;
    }
    setLoading(true);
    try {
      console.log('fetching data');
      const { idToken } = await getAuthTokens();
      console.log('idToken', idToken);
      await fetchHistoryData(idToken);
      await fetchCostData(idToken);
      await fetchThresholdData();
    } catch (err) {
      console.error('Data fetch error:', err);
      setError('Failed to fetch data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Effect hook: Fetch data on auth or date range change.
   */
  useEffect(() => {
    if (authStatus === 'authenticated') {
      fetchHistoryData();
    }
  }, [authStatus, startDate, endDate]);

  /**
   * Effect hook: Refetch data when period changes.
   */
  useEffect(() => {
    if (authStatus === 'authenticated') {
      fetchCostData();
      fetchHistoryData();
    }
  }, [period]);

  /**
   * Handle validation and update for start date picker.
   */
  const handleStartDateChange = (newStartDate) => {
    setStartDate(newStartDate);
    if (newStartDate > endDate) {
      setDateError('Start date cannot be after end date.');
      setTimeout(() => setDateError(''), 5000);
    } else {
      setDateError('');
    }
  };

  /**
   * Handle validation and update for end date picker.
   */
  const handleEndDateChange = (newEndDate) => {
    if (newEndDate < startDate) {
      setDateError('End date cannot be before start date.');
      setTimeout(() => setDateError(''), 5000);
    } else {
      setEndDate(newEndDate);
      setDateError('');
    }
  };

  /**
   * Calculate average usage across the provided data array.
   */
  const calculateAverageUsage = (data) => {
    if (data.length === 0) return [];
    const totalUsage = data.reduce((sum, entry) => sum + entry.usage, 0);
    const averageUsage = totalUsage / data.length;
    return data.map(entry => ({ ...entry, average: averageUsage }));
  };

  // Combine history data with average usage and threshold for chart rendering
  const enhancedHistoryData = calculateAverageUsage(historyData).map((entry, index) => ({
    ...entry,
    threshold: thresholdData || null,
  }));

  // Chart line colors for usage, average, summary, and threshold
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  /**
   * Export usage data as CSV and trigger browser download.
   */
  const exportUsageData = () => {
    const csvContent = [
      ['Date', 'Usage', 'Average', 'Threshold'],
      ...enhancedHistoryData.map(item => [item.date, item.usage, item.average, item.threshold])
    ].map(e => e.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'usage_data.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // JSX render
  return (
    <div className="container mt-4">
      {/* Greeting banner */}
      <h2 className="text-center text-primary mb-4">Hi {userName || 'User'}, Welcome to your Energy Dashboard</h2>

      {/* Display global errors */}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {dateError && <div className="alert alert-warning" role="alert">{dateError}</div>}

      {/* Static info banner */}
      <div className="alert alert-info text-center mb-4">
        Current price per unit kWh is $5
      </div>

      {/* Export button */}
      <div className="d-flex justify-content-end mb-4">
      <button onClick={exportUsageData} className="btn btn-primary">Export Usage Data</button>
      </div>

      {/* Date pickers and period selector */}
      <div className="mb-4">
        <div className="row">
          <div className="col-md-4 mb-3">
            <label className="form-label">Start Date:</label>
            <input
              type="date"
              value={startDate}
              onChange={e => handleStartDateChange(e.target.value)}
              className="form-control"
              max={new Date().toISOString().split('T')[0]}
            />
          </div>
          <div className="col-md-4 mb-3">
            <label className="form-label">End Date:</label>
            <input
              type="date"
              value={endDate}
              onChange={e => handleEndDateChange(e.target.value)}
              className="form-control"
              max={new Date().toISOString().split('T')[0]}
            />
          </div>
          <div className="col-md-4 mb-3">
            <label className="form-label">Select Summary Period:</label>
            <select value={period} onChange={e => setPeriod(e.target.value)} className="form-select">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
        </div>
      </div>

      {/* Conditional loading spinner or data display */}
      {loading ? (
        <div className="d-flex justify-content-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : (
        <div className="row">
          {/* Historical usage chart */}
          <div className="col-md-6">
            <h3 className="text-center text-secondary mb-3">Historical Energy Usage</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={enhancedHistoryData} className="mx-auto">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis label={{ value: "kWh", angle: -90, position: "insideLeft" }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="usage" stroke="#8884d8" />
                <Line type="monotone" dataKey="average" stroke="#82ca9d" strokeDasharray="5 5" />
                <Line type="monotone" dataKey="threshold" stroke="#FF0000" strokeDasharray="3 4 5 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Cost details table */}
          <div className="col-md-6">
            <h3 className="text-center text-secondary mb-3">Energy Cost Details</h3>
            <table className="table table-bordered table-hover">
              <thead className="table-light">
                <tr>
                  <th className="text-uppercase">Month</th>
                  <th className="text-uppercase">Cost (USD)</th>
                </tr>
              </thead>
              <tbody>
                {costData.map(({ month, cost }) => (
                  <tr key={month}>
                    <td>{month}</td>
                    <td>${cost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeRedirect;