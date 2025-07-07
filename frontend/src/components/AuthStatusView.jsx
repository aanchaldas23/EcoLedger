import React from 'react';
import { FaCheckCircle, FaTimesCircle, FaInfoCircle, FaScroll, FaProjectDiagram, FaCubes } from 'react-icons/fa';

const AuthStatusView = ({ authResult }) => {
  if (!authResult) return <div className="text-gray-400">No authentication data available</div>;

  const isSuccess = authResult.authenticated === true;
  const isUnauthenticated = authResult.authenticated === false;
  const displayMessage = authResult.message || "No status message available";

  const DetailRow = ({ icon, label, value }) => (
    <div className="flex items-center p-3 bg-gray-700/50 rounded-lg mb-2">
      <span className="mr-3 text-gray-400">{icon}</span>
      <span className="text-gray-400">{label}:</span>
      <span className="ml-auto font-semibold text-white">{value || "N/A"}</span>
    </div>
  );

  return (
    <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700">
      {/* Status Header */}
      <div className={`flex items-center mb-6 p-4 rounded-lg ${
        isSuccess ? 'bg-emerald-900/30 border border-emerald-700' : 
        isUnauthenticated ? 'bg-yellow-900/30 border border-yellow-700' : 
        'bg-red-900/30 border border-red-700'
      }`}>
        {isSuccess ? (
          <FaCheckCircle className="text-emerald-400 mr-3" size={24} />
        ) : isUnauthenticated ? (
          <FaTimesCircle className="text-yellow-400 mr-3" size={24} />
        ) : (
          <FaInfoCircle className="text-red-400 mr-3" size={24} />
        )}
        <div>
          <h3 className="font-bold text-lg">
            {isSuccess ? 'Verified' : isUnauthenticated ? 'Unverified' : 'Error'}
          </h3>
          <p className="text-sm opacity-80">{displayMessage}</p>
        </div>
      </div>

      {/* Extracted Data Section */}
      {authResult.extracted_data && (
        <div className="mb-6">
          <h4 className="flex items-center text-gray-300 mb-3">
            <FaScroll className="mr-2" /> Certificate Details
          </h4>
          <div className="space-y-2">
            <DetailRow icon="🆔" label="Project ID" value={authResult.extracted_data.project_id} />
            <DetailRow icon="📛" label="Serial" value={authResult.extracted_data.serial_number} />
            <DetailRow icon="⚖️" label="Amount" value={`${authResult.extracted_data.amount} tCO₂`} />
          </div>
        </div>
      )}

      {/* Blockchain Verification */}
      {authResult.blockchain_status && (
        <div className="mb-6">
          <h4 className="flex items-center text-gray-300 mb-3">
            <FaCubes className="mr-2" /> Blockchain Verification
          </h4>
          <DetailRow icon="🔗" label="Status" value={authResult.blockchain_status} />
          <DetailRow icon="🆔" label="Transaction ID" value={authResult.fabric_tx_id} />
        </div>
      )}

      {/* Carbonmark Verification */}
      {authResult.carbonmark_details && (
        <div>
          <h4 className="flex items-center text-gray-300 mb-3">
            <FaProjectDiagram className="mr-2" /> Registry Verification
          </h4>
          <DetailRow icon="🌐" label="Registry" value={authResult.carbonmark_details.name} />
        </div>
      )}
    </div>
  );
};

export default AuthStatusView;