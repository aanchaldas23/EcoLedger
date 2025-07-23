import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  FaEye, 
  FaShareSquare, 
  FaSpinner,
  FaCheckCircle,
  FaTimesCircle,
  FaInfoCircle,
  FaFilePdf 
} from "react-icons/fa";

export default function Dashboard() {
  const [selectedTab, setSelectedTab] = useState("carbon");
  const [selectedToggle, setSelectedToggle] = useState("owned");
  const [aiDropdownOpen, setAiDropdownOpen] = useState(false);
  const [selectedCreditForDetails, setSelectedCreditForDetails] = useState(null);
  const [ownedCredits, setOwnedCredits] = useState([]);
  const [marketCredits, setMarketCredits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [totalCredits, setTotalCredits] = useState(0);
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [currentPdfId, setCurrentPdfId] = useState(null);
  const [credits, setCredits] = useState([]);

  const [pricePerCredit, setPricePerCredit] = useState('');
  const [listingDescription, setListingDescription] = useState('');
  const [isListing, setIsListing] = useState(false);

  const navigate = useNavigate(); // Initialize navigate here
  const location = useLocation(); // Initialize location here

// Dashboard.jsx - Locate and modify the fetchCredits function
useEffect(() => {
  const fetchCredits = async () => {
    try {
      const email = localStorage.getItem('email');
      if (!email) {
        // Handle case where email is not in local storage (e.g., user not logged in)
        setError("User email not found. Please log in.");
        setMessage("User email not found. Please log in.");
        setMessageType('error');
        setLoading(false);
        navigate('/login'); // Redirect to login page
        return;
      }

      const response = await fetch('http://localhost:5000/api/users/me/credits', {
        headers: {
          'email': email
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch credits');
      }

      const data = await response.json();
      const allCredits = data.credits || [];

      // Map backend data to frontend display format using serialNumber as ID
      const owned = allCredits.map(credit => ({
          id: credit.serialNumber, // Use serialNumber as the ID for display
          type: credit.extractedData?.category || 'N/A',
          // Ensure volume is always a number, defaulting to 0 if extractedData.amount is not a valid number
          volume: Number(credit.extractedData?.amount) || 0, 
          status: credit.status === 'authenticated' ? 'Active' : credit.status, // Map backend status to frontend display
          date: credit.uploadDate ? new Date(credit.uploadDate).toLocaleDateString() : 'N/A',
          price: credit.pricePerCredit, // For marketplace display
          totalValue: credit.totalValue, // For marketplace display
          description: credit.listingDescription, // For marketplace display
          authenticated: credit.status === 'authenticated' || credit.status === 'listed', // Derived status
          rawData: credit // Keep raw data for PDF viewer etc.
      }));

      const marketplace = allCredits.filter(credit => credit.status === 'listed' || credit.status === 'available').map(credit => ({
          id: credit.serialNumber, // Use serialNumber as the ID for display
          type: credit.extractedData?.category || 'N/A',
          // Ensure volume is always a number, defaulting to 0 if extractedData.amount is not a valid number
          volume: Number(credit.extractedData?.amount) || 0,
          status: credit.status === 'listed' ? 'Available' : credit.status, // Map backend status to frontend display
          date: credit.listedDate ? new Date(credit.listedDate).toLocaleDateString() : 'N/A',
          price: credit.pricePerCredit,
          totalValue: credit.totalValue,
          description: credit.listingDescription,
          authenticated: credit.status === 'authenticated' || credit.status === 'listed',
          rawData: credit
      }));


      setOwnedCredits(owned);
      setMarketCredits(marketplace);
      setTotalCredits(allCredits.length);
      setMessage('');
      setMessageType('');

    } catch (err) {
      console.error('Error fetching credits:', err);
      setError(err.message || 'Failed to load user credits.');
      setMessage(err.message || 'Failed to load user credits.');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  fetchCredits();
}, []); // <-- Close useEffect here

const getTypeIcon = (type) => {
  switch ((type || "").toLowerCase()) {
    case "forestry": return "🌿";
    case "renewable energy": return "💨";
    case "waste management": return "♻️";
    case "industrial efficiency": return "🏭";
    default: return "🌱";
  }
};

const handleAdminPanelClick = async () => {
  console.log("Admin panel button clicked!");
  try {
    const email = localStorage.getItem('email');
    console.log('Frontend sending email:', email);
    
    const response = await fetch('http://localhost:5000/api/admin/check', {
      headers: {
        'email': email, // Send in header instead of URL
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    console.log('Full admin check response:', data);
    
    if (data.isAdmin) {
      navigate('/admin');
    } else {
      alert(`Admin access denied. 
        Your email: ${data.email}
        Approved admins: ${data.adminEmails}`);
    }
  } catch (err) {
    console.error('Admin check failed:', err);
    alert('Error verifying admin status. Check console.');
  }
};


const PDFViewerModal = ({ fileId, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      <div className="relative w-full h-full max-w-6xl">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-50 bg-red-500 hover:bg-red-600 text-white rounded-full p-2 shadow-lg"
        >
          ✕
        </button>
        
        <div className="h-full w-full bg-gray-900 rounded-lg overflow-hidden">
          <iframe
            src={`http://localhost:5000/api/certificates/view/${fileId}?noauth=true#toolbar=0`}
            className="w-full h-full border-none"
            title="PDF Viewer"
          />
        </div>
      </div>
    </div>
  );
};


if (loading) {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-900">
      <FaSpinner className="animate-spin text-emerald-400 text-4xl mr-3" />
      <span className="text-emerald-400 text-xl">Loading your dashboard...</span>
    </div>
  );
}

if (error) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 p-8">
      <div className="text-red-400 text-xl mb-4">Error loading dashboard: {error}</div>
      <button
        onClick={() => window.location.reload()}
        className="px-6 py-3 bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
      >
        Retry Loading
      </button>
      <button
        onClick={() => navigate("/")}
        className="mt-4 px-6 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
      >
        Return Home
      </button>
    </div>
  );
}

return (
  <div className="flex h-screen bg-gray-900 text-white">
    {/* Sidebar */}
    <div className="w-1/5 bg-gradient-to-b from-emerald-900 via-green-900 to-teal-900 text-white flex flex-col justify-between p-6 shadow-2xl">
      <div>
        <div className="flex items-center mb-8">
          <span className="text-3xl mr-3">🌿</span>
          <h4 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
            EcoLedger
          </h4>
        </div>
        <ul className="space-y-3">
          <li className="cursor-pointer hover:bg-emerald-800/50 p-3 rounded-lg transition-all duration-300 flex items-center">
            <span className="mr-3 text-emerald-300">👤</span>
            Profile
          </li>
          <li 
            className="cursor-pointer hover:bg-emerald-800/50 p-3 rounded-lg transition-all duration-300 flex items-center"
            onClick={handleAdminPanelClick}>
            <span className="mr-3 text-emerald-300">⚙️</span>
            Admin Panel
          </li>
          <li className="cursor-pointer hover:bg-emerald-800/50 p-3 rounded-lg transition-all duration-300 flex items-center">
            <span className="mr-3 text-emerald-300">⚙️</span>
            Settings
          </li>
          <li
            className="cursor-pointer hover:bg-emerald-800/50 p-3 rounded-lg transition-all duration-300 flex items-center"
            onClick={() => setAiDropdownOpen(!aiDropdownOpen)}
          >
            <span className="mr-3 text-emerald-300">🤖</span>
            AI Insights {aiDropdownOpen ? "▴" : "▾"}
          </li>
          {aiDropdownOpen && (
            <ul className="ml-6 space-y-2 text-sm text-emerald-100 overflow-hidden">
              <li className="cursor-pointer hover:text-emerald-300 p-2 rounded transition-all duration-200">
                <span className="mr-2">📈</span>
                Emission Forecast
              </li>
              <li className="cursor-pointer hover:text-emerald-300 p-2 rounded transition-all duration-200">
                <span className="mr-2">🔥</span>
                Future Prediction
              </li>
              <li className="cursor-pointer hover:text-emerald-300 p-2 rounded transition-all duration-200">
                <span className="mr-2">🌿</span>
                Sustainability Score
              </li>
            </ul>
          )}
          <li className="cursor-pointer hover:bg-emerald-800/50 p-3 rounded-lg transition-all duration-300 flex items-center">
            <span className="mr-3 text-emerald-300">🔔</span>
            Notifications
          </li>
        </ul>
      </div>
      <div className="text-xs text-emerald-300 text-center p-4 bg-emerald-900/30 rounded-lg">
        © 2025 EcoLedger
      </div>
    </div>

    <div className="w-4/5 p-8 overflow-auto bg-gray-900">
      <div className="flex space-x-4 mb-8">
        {[
          { key: "carbon", label: "ECOBOARD", icon: "🌿" },
          { key: "auth", label: "AUTHENTICATION STATUS", icon: "⚙️" },
          { key: "admin", label: "LEADERBOARD", icon: "📈" }
        ].map((tab) => (
          <button
            key={tab.key}
            className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 transform hover:scale-105 flex items-center ${
              selectedTab === tab.key
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/25"
                : "bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 hover:border-emerald-500"
            }`}
            onClick={() => setSelectedTab(tab.key)}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {selectedTab === 'carbon' ? (
        <>
          <div className="grid grid-cols-3 gap-6 mb-8">
            {[
              { title: "Total Credits", value: ownedCredits.reduce((sum, item) => sum + item.volume, 0).toLocaleString(), unit: "tCO2e", icon: "🌿", color: "emerald" },
              { title: "Market Listings", value: marketCredits.length.toString(), unit: "credits", icon: "📊", color: "blue" },
              { title: "Market Value", value: `$${marketCredits.reduce((sum, item) => sum + (item.totalValue || 0), 0).toLocaleString()}`, unit: "USD", icon: "💰", color: "yellow" }
            ].map((stat, index) => (
              <div 
                key={index}
                className={`bg-gradient-to-br from-gray-800 to-gray-900 shadow-2xl rounded-2xl p-6 border border-gray-700 hover:border-${stat.color}-500 transition-all duration-300 transform hover:scale-105`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm">{stat.title}</p>
                    <h4 className={`text-3xl font-bold text-${stat.color}-400`}>{stat.value}</h4>
                    <p className="text-gray-500 text-xs">{stat.unit}</p>
                  </div>
                  <span className="text-4xl opacity-20">{stat.icon}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex space-x-4 mb-8">
            <button
              className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-8 py-3 rounded-xl font-semibold hover:from-emerald-600 hover:to-teal-600 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-emerald-500/25 flex items-center"
              onClick={() => {
                console.log("Attempting to navigate to /upload...");
                navigate("/upload");
          }}
            >
              <span className="mr-2">🌱</span>
              UPLOAD NEW CREDIT
            </button>
            <button 
              className="bg-gradient-to-r from-red-500 to-pink-500 text-white px-8 py-3 rounded-xl font-semibold hover:from-red-600 hover:to-pink-600 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-red-500/25 flex items-center"
              onClick={() => alert("Retirement functionality coming soon!")}
            >
              <span className="mr-2">🗑️</span>
              RETIRE/BURN CREDITS
            </button>
          </div>

          <div className="flex bg-gray-800 rounded-2xl p-2 mb-8 border border-gray-700 inline-flex shadow-lg">
            <button
              className={`px-8 py-3 text-sm font-semibold rounded-xl transition-all duration-300 ${
                selectedToggle === "owned"
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg"
                  : "text-gray-400 hover:text-white hover:bg-gray-700"
              }`}
              onClick={() => setSelectedToggle("owned")}
            >
              Owned Credits
            </button>
            <button
              className={`px-8 py-3 text-sm font-semibold rounded-xl transition-all duration-300 ${
                selectedToggle === "marketplace"
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg"
                  : "text-gray-400 hover:text-white hover:bg-gray-700"
              }`}
              onClick={() => setSelectedToggle("marketplace")}
            >
              Credit Marketplace
            </button>
          </div>

          <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl shadow-2xl border border-gray-700">
            <h4 className="text-2xl font-bold mb-6 text-emerald-400 flex items-center">
              <span className="mr-3">🌿</span>
              {selectedToggle === "owned" ? "Your Carbon Credit Portfolio" : "Credit Marketplace"}
            </h4>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="bg-gray-700/50 text-gray-300 border-b border-gray-600">
                  <tr>
                    <th className="px-6 py-4 font-bold">ID</th>
                    <th className="px-6 py-4 font-bold">Type</th>
                    <th className="px-6 py-4 font-bold">Volume (tCO2e)</th>
                    {selectedToggle === "marketplace" && (
                      <th className="px-6 py-4 font-bold">Price</th>
                    )}
                    <th className="px-6 py-4 font-bold">Status</th>
                    <th className="px-6 py-4 font-bold">Date</th>
                    <th className="px-6 py-4 font-bold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedToggle === "owned" ? ownedCredits : marketCredits).map((item, idx) => (
                    <tr
                      key={idx}
                      className="border-t border-gray-700 hover:bg-gray-700/30 transition-all duration-300"
                    >
                      <td className="px-6 py-4 font-mono text-emerald-300">{item.id}</td>
                      <td className="px-6 py-4 flex items-center">
                        <span className="mr-3 text-xl">{getTypeIcon(item.type)}</span>
                        {item.type}
                      </td>
                      <td className="px-6 py-4 font-bold text-blue-300">{item.volume.toLocaleString()}</td>
                      {selectedToggle === "marketplace" && (
                        <td className="px-6 py-4 font-bold text-yellow-300">
                          ${item.totalValue?.toFixed(2) || "N/A"}
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold ${
                            item.status === "Active" || item.status === "Available"
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : item.status === "Retired"
                              ? "bg-red-500/20 text-red-400 border border-red-500/30"
                              : "bg-gray-500/20 text-gray-400 border border-gray-500/30"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-400">{item.date}</td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center space-x-3">
                          <button
                            className="text-gray-400 hover:text-emerald-400 cursor-pointer text-lg transition-colors duration-300 transform hover:scale-110 bg-gray-700/50 hover:bg-emerald-500/20 rounded-lg p-2"
                            title="View Details"
                            onClick={() => setSelectedCreditForDetails(item)}
                          >
                            <FaEye />
                          </button>
                          <button
                            className="text-gray-400 hover:text-blue-400 cursor-pointer text-lg transition-colors duration-300 transform hover:scale-110 bg-gray-700/50 hover:bg-blue-500/20 rounded-lg p-2"
                            title="View Certificate"
                            onClick={() => {
                              setCurrentPdfId(item.rawData.fileId);
                              setPdfViewerOpen(true);
                            }}
                          >
                            <FaFilePdf />
                          </button>
                          {selectedToggle === "owned" && item.status === "Active" && (
                            <button
                              className="text-gray-400 hover:text-yellow-400 cursor-pointer text-lg transition-colors duration-300 transform hover:scale-110 bg-gray-700/50 hover:bg-yellow-500/20 rounded-lg p-2"
                              title="List on Marketplace"
                              onClick={() => setSelectedCreditForDetails(item)}
                            >
                              <FaShareSquare />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center mt-6 text-sm text-gray-400">
              <span>Showing {selectedToggle === "owned" ? ownedCredits.length : marketCredits.length} items</span>
              <div className="flex space-x-2">
                <button className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                  Previous
                </button>
                <button className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors">
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      ) : selectedTab === 'auth' ? (
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl shadow-2xl border border-gray-700">
          <h4 className="text-2xl font-bold mb-6 text-emerald-400 flex items-center">
            <span className="mr-3">🔒</span>
            Certificate Authentication Status
          </h4>
          
          {location.state?.authResult ? (
            <div className="space-y-6">
              <div className={`p-4 rounded-lg ${
                location.state.authResult.authenticated 
                  ? 'bg-emerald-900/30 border border-emerald-700'
                  : 'bg-yellow-900/30 border border-yellow-700'
              }`}>
                <div className="flex items-center">
                  {location.state.authResult.authenticated ? (
                    <FaCheckCircle className="text-emerald-400 mr-3" size={24} />
                  ) : (
                    <FaTimesCircle className="text-yellow-400 mr-3" size={24} />
                  )}
                  <div>
                    <h3 className="font-bold">
                      {location.state.authResult.authenticated ? 'Verified' : 'Unverified'}
                    </h3>
                    <p className="text-sm opacity-80">{location.state.authResult.message}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h5 className="text-lg font-semibold text-gray-300">Certificate Details</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <p className="text-gray-400 text-sm">Project ID</p>
                    <p className="font-mono text-emerald-300">
                      {location.state.authResult.extracted_data?.project_id || 'N/A'}
                    </p>
                  </div>
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <p className="text-gray-400 text-sm">Serial Number</p>
                    <p className="font-mono text-blue-300">
                      {location.state.authResult.extracted_data?.serial_number || 'N/A'}
                    </p>
                  </div>
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <p className="text-gray-400 text-sm">Amount</p>
                    <p className="font-bold">
                      {location.state.authResult.extracted_data?.amount || '0'} tCO₂
                    </p>
                  </div>
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <p className="text-gray-400 text-sm">Issuance Date</p>
                    <p>
                      {location.state.authResult.extracted_data?.issuance_date || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h5 className="text-lg font-semibold text-gray-300">Verification Details</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <p className="text-gray-400 text-sm">Registry</p>
                    <p className="text-emerald-300">
                      {location.state.authResult.carbonmark_details?.name || 'N/A'}
                    </p>
                  </div>
                  <div className="bg-gray-700/50 p-3 rounded-lg">
                    <p className="text-gray-400 text-sm">Blockchain Status</p>
                    <p className="text-purple-300">
                      {location.state.authResult.blockchain_status || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <FaInfoCircle className="mx-auto text-gray-500 text-4xl mb-4" />
              <p className="text-gray-400">No authentication data available</p>
              <button
                onClick={() => navigate('/upload')}
                className="mt-4 px-6 py-2 bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Upload Certificate
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl shadow-2xl border border-gray-700">
          <h4 className="text-2xl font-bold mb-6 text-emerald-400">Leaderboard</h4>
          <p className="text-gray-400">Coming soon...</p>
        </div>
      )}
    </div>

    {selectedCreditForDetails && (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-8 rounded-2xl shadow-2xl w-1/2 max-w-lg border border-gray-700">
          <div className="flex items-center mb-6">
            <span className="mr-3 text-2xl">{getTypeIcon(selectedCreditForDetails.type)}</span>
            <h3 className="text-2xl font-bold text-emerald-400">
              Credit Details: {selectedCreditForDetails.id}
            </h3>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded-lg">
              <span className="text-gray-400">Type:</span>
              <span className="font-semibold text-white">{selectedCreditForDetails.type}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded-lg">
              <span className="text-gray-400">Volume:</span>
              <span className="font-semibold text-blue-400">
                {selectedCreditForDetails.volume.toLocaleString()} tCO2e
              </span>
            </div>
            {selectedCreditForDetails.price && (
              <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded-lg">
                <span className="text-gray-400">Price:</span>
                <span className="font-semibold text-yellow-400">
                  ${selectedCreditForDetails.price.toFixed(2)} per credit
                </span>
              </div>
            )}
            <div className="flex justify-between items-center p-3 bg-gray-700/50 rounded-lg">
              <span className="text-gray-400">Status:</span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  selectedCreditForDetails.status === "Active" || selectedCreditForDetails.status === "Available"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {selectedCreditForDetails.status}
              </span>
            </div>
            <div className="p-3 bg-gray-700/50 rounded-lg">
              <span className="text-gray-400 block mb-2">Description:</span>
              <p className="text-gray-300">{selectedCreditForDetails.description}</p>
            </div>
            {selectedCreditForDetails.rawData?.carbonmark_details && (
              <div className="p-3 bg-gray-700/50 rounded-lg">
                <span className="text-gray-400 block mb-2">Carbonmark Verification:</span>
                <p className="text-emerald-300">
                  {selectedCreditForDetails.rawData.carbonmark_details.name || "Verified"}
                </p>
              </div>
            )}
            {selectedCreditForDetails.rawData?.blockchain_status && (
              <div className="p-3 bg-gray-700/50 rounded-lg">
                <span className="text-gray-400 block mb-2">Blockchain Status:</span>
                <p className="text-purple-300">
                  {selectedCreditForDetails.rawData.blockchain_status}
                </p>
              </div>
            )}
          </div>

          {/* Add listing form for authenticated credits */}
          {selectedToggle === "owned" && selectedCreditForDetails.authenticated && (
            <div className="mt-6 space-y-4">
              <h4 className="text-lg font-semibold text-emerald-400">List on Marketplace</h4>
              <div>
                <label className="block text-gray-400 mb-2">Price per Credit (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={pricePerCredit}
                  onChange={(e) => setPricePerCredit(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  placeholder="Enter price"
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-2">Description (Optional)</label>
                <textarea
                  value={listingDescription}
                  onChange={(e) => setListingDescription(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  rows="3"
                  placeholder="Describe this listing"
                />
              </div>
              <button
                onClick={() => handleListOnMarketplace(selectedCreditForDetails)}
                disabled={!pricePerCredit || isListing}
                className={`w-full py-3 rounded-lg font-semibold ${
                  !pricePerCredit || isListing
                    ? 'bg-gray-600 cursor-not-allowed'
                    : 'bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600'
                }`}
              >
                {isListing ? 'Listing...' : 'List on Marketplace'}
              </button>
            </div>
          )}

          <button
            className="mt-6 w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-6 py-3 rounded-xl font-semibold hover:from-emerald-600 hover:to-teal-600 transition-all duration-300 transform hover:scale-105 shadow-lg"
            onClick={() => {
              setSelectedCreditForDetails(null);
              setPricePerCredit('');
              setListingDescription('');
            }}
          >
            Close
          </button>
        </div>
      </div>
    )}

    {pdfViewerOpen && (
      <PDFViewerModal 
        fileId={currentPdfId} 
        onClose={() => setPdfViewerOpen(false)} 
      />
    )}
  </div>
  );
}