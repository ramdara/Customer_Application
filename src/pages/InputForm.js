import React, { useState } from 'react';
import axios from 'axios';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { getAuthTokens, getUserEmail } from '../utils/authHelpers';
import Papa from 'papaparse';
import { FaCalendarAlt, FaPlug, FaFileCsv, FaUpload, FaCheckCircle, FaTimesCircle, FaLightbulb, FaTrash, FaChartLine } from 'react-icons/fa';
import { motion } from 'framer-motion';
import 'bootstrap/dist/css/bootstrap.min.css';
import { API_INVOKE_URL } from '../utils/constants';
import { ENERGY_INPUT, GET_PRESIGNED_URL, PROCESS_FILE } from '../utils/apiRoutes';

const InputForm = () => {
  // State hooks for form input, messages, CSV file, preview data, loading, and upload status
  const [form, setForm] = useState({ date: '', usage: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [csvPreviewData, setCsvPreviewData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [recentSubmissions, setRecentSubmissions] = useState([]);
  const { user, authStatus } = useAuthenticator((context) => [context.user, context.authStatus]);

  // Handler to update manual form state when user edits inputs
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Handler to parse selected CSV file and display a preview
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setError('');
    setMessage('');
    setCsvPreviewData([]);
    setUploadSuccess(false);
  
    if (selectedFile && selectedFile.type === 'text/csv') {
      Papa.parse(selectedFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setCsvPreviewData(results.data);
        },
        error: (err) => {
          setError('Error parsing CSV: ' + err.message);
        },
      });
    } else if (selectedFile) {
      setError('Only CSV files are supported.');
    }
  };
  
  // Handler to submit manual energy usage data to the backend API
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setLoading(true);

    if (authStatus !== 'authenticated') {
      setError('User not authenticated.');
      setLoading(false);
      return;
    }

    const selectedDate = new Date(form.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate > today) {
      setError('You cannot submit usage data for a future date.');
      setLoading(false);
      return;
    }

    try {
      const { idToken } = await getAuthTokens();
      const email = getUserEmail(user);

      const payload = {
        customerId: email,
        Date: form.date,
        Usage: parseFloat(form.usage),
        "customerId#Date": `${email}#${form.date}`,
      };

      await axios.post(
        `${API_INVOKE_URL}${ENERGY_INPUT}`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      setMessage('Energy usage submitted successfully!');
      setForm({ date: '', usage: '' });
      
      // Animated success indicator
      const successTimer = setTimeout(() => {
        setMessage('');
      }, 5000);
      
      return () => clearTimeout(successTimer);
    } catch (err) {
      setError('Submission failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Handler to upload selected CSV to S3 and trigger backend processing
  const handleFileUpload = async () => {
    if (!file) {
      setError('Please select a file to upload.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const parsed = await new Promise((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => resolve(results),
          error: (err) => reject(err),
        });
      });

      const invalidRows = parsed.data.filter(row => {
        const date = new Date(row.Date);
        return date > today;
      });

      if (invalidRows.length > 0) {
        setError('CSV contains future dates. Please remove or correct them before uploading.');
        setLoading(false);
        return;
      }

      const { idToken } = await getAuthTokens();
      const email = getUserEmail(user);

      const response = await axios.get(
        `${API_INVOKE_URL}${GET_PRESIGNED_URL}`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
          params: { customerId: email, fileName: file.name },
        }
      );

      const { presignedUrl, fileUrl } = response.data;

      const uploadResponse = await axios.put(presignedUrl, file, {
        headers: {
          'Content-Type': 'text/csv',
        },
      });

      if (uploadResponse.status === 200) {
        setMessage('File uploaded successfully!');
        setUploadSuccess(true);
        await processFile(fileUrl);
      }
    } catch (err) {
      setError('File upload failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Function to invoke Lambda for processing the uploaded CSV and storing records
  const processFile = async (fileUrl) => {
    try {
      const { idToken } = await getAuthTokens();
      const email = getUserEmail(user);

      await axios.post(
        `${API_INVOKE_URL}${PROCESS_FILE}`,
        {
          customerId: email,
          fileUrl: fileUrl,
        },
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      setMessage('File processed and data stored successfully!');
      
      // Clear CSV preview after successful processing
      setCsvPreviewData([]);
      setFile(null);
      
      // Reset file input
      const fileInput = document.getElementById('csvFileInput');
      if (fileInput) fileInput.value = '';
    } catch (err) {
      setError('File processing failed: ' + (err.response?.data?.error || err.message));
    }
  };

  // Remove selected CSV file and clear preview data
  const removeFile = () => {
    setFile(null);
    setCsvPreviewData([]);
    // Reset file input
    const fileInput = document.getElementById('csvFileInput');
    if (fileInput) fileInput.value = '';
  };

  return (
    <div className="container py-5">
      <div className="bg-light rounded shadow-sm p-4 mb-4">
        <h2 className="text-center text-primary mb-4">
          <FaPlug className="me-2" size={32} />
          Energy Usage Input
        </h2>
        
        {message && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="alert alert-success d-flex align-items-center mb-4"
          >
            <FaCheckCircle className="me-2" size={22} /> 
            <p className="mb-0">{message}</p>
          </motion.div>
        )}
        
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="alert alert-danger d-flex align-items-center mb-4"
          >
            <FaTimesCircle className="me-2" size={22} /> 
            <p className="mb-0">{error}</p>
          </motion.div>
        )}

        <div className="row">
          {/* Manual Input Section */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="col-md-6 mb-4"
          >
            <div className="card h-100">
              <div className="card-body">
                <h3 className="card-title text-center text-secondary mb-3">
                  <FaPlug className="me-2 text-primary" /> 
                  Manual Input
                </h3>
                
                <form onSubmit={handleSubmit} className="">
                  <div className="mb-3">
                    <label className="form-label">Date</label>
                    <div className="input-group">
                      <span className="input-group-text">
                        <FaCalendarAlt className="text-muted" />
                      </span>
                      <input
                        type="date"
                        name="date"
                        value={form.date}
                        onChange={handleChange}
                        required
                        className="form-control"
                      />
                    </div>
                  </div>
                  
                  <div className="mb-3">
                    <label className="form-label">Energy Usage (kWh)</label>
                    <div className="input-group">
                      <span className="input-group-text">
                        <FaLightbulb className="text-muted" />
                      </span>
                      <input
                        type="number"
                        name="usage"
                        placeholder="Enter value in kWh"
                        value={form.usage}
                        onChange={handleChange}
                        required
                        className="form-control"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                  
                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className={`btn btn-primary w-100 ${loading ? 'disabled' : ''}`}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Processing...
                      </>
                    ) : (
                      <>
                        <FaChartLine className="me-2" /> Submit Energy Usage
                      </>
                    )}
                  </motion.button>
                </form>
              </div>
            </div>
          </motion.div>

          {/* CSV Upload Section */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="col-md-6 mb-4"
          >
            <div className="card h-100">
              <div className="card-body">
                <h3 className="card-title text-center text-secondary mb-3">
                  <FaFileCsv className="me-2 text-success" /> 
                  Bulk Upload (CSV)
                </h3>
                
                <div className="mb-3">
                  <label className="form-label">Select CSV File</label>
                  <div className="input-group">
                    <input
                      id="csvFileInput"
                      name="file"
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="form-control"
                    />
                  </div>
                </div>
                
                {file && (
                  <div className="alert alert-info d-flex align-items-center justify-content-between mb-3">
                    <div className="d-flex align-items-center">
                      <FaFileCsv className="me-2 text-info" />
                      <span className="text-truncate">
                        {file.name}
                      </span>
                    </div>
                    <button 
                      onClick={removeFile}
                      className="btn btn-link text-danger"
                    >
                      <FaTrash size={16} />
                    </button>
                  </div>
                )}
                
                {csvPreviewData.length > 0 && (
                  <div className="mt-4 overflow-auto bg-light p-3 rounded border">
                    <h4 className="mb-2 text-secondary">CSV Preview</h4>
                    <table className="table table-striped table-hover">
                      <thead className="table-light">
                        <tr>
                          {Object.keys(csvPreviewData[0]).map((key) => (
                            <th key={key} className="text-uppercase">
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvPreviewData.slice(0, 5).map((row, idx) => (
                          <tr key={idx}>
                            {Object.values(row).map((value, i) => (
                              <td key={i}>
                                {value}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {csvPreviewData.length > 5 && (
                      <p className="text-muted text-center">
                        Showing 5 of {csvPreviewData.length} rows
                      </p>
                    )}
                  </div>
                )}
                
                <motion.button
                  onClick={handleFileUpload}
                  disabled={!file || loading}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className={`btn btn-success w-100 mt-3 ${(!file || loading) ? 'disabled' : ''}`}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Processing...
                    </>
                  ) : (
                    <>
                      <FaUpload className="me-2" /> Upload and Process CSV
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
      
      {/* Recent Submissions Section */}
      {recentSubmissions.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="bg-white rounded shadow-sm p-4"
        >
          <h3 className="text-center text-secondary mb-4">
            <FaChartLine className="me-2 text-indigo-600" /> 
            Recent Submissions
          </h3>
          
          <div className="table-responsive">
            <table className="table table-bordered">
              <thead className="table-light">
                <tr>
                  <th scope="col" className="text-uppercase">
                    Date
                  </th>
                  <th scope="col" className="text-uppercase">
                    Usage (kWh)
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentSubmissions.map((entry, index) => (
                  <tr key={index}>
                    <td>
                      {entry.date}
                    </td>
                    <td>
                      {entry.usage} kWh
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default InputForm;