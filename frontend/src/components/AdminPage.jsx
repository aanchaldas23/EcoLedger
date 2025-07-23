import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FaCube, 
  FaLink, 
  FaSearch, 
  FaSpinner,
  FaChartLine,
  FaUserShield,
  FaDatabase,
  FaHistory
} from 'react-icons/fa';

export default function AdminPage() {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('blockchain');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentBlock, setCurrentBlock] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const verifyAdmin = async () => {
      try {
        const email = localStorage.getItem('email');
        console.log('Checking admin status for:', email);
        const response = await fetch('http://localhost:5000/api/admin/verify', {
          headers: { 'email': email }
        });
        
        if (!response.ok) {
          throw new Error('Admin access denied');
        }
        fetchBlockchainData();
      } catch (err) {
        setError(err.message);
        navigate('/dashboard');
      }
    };

    verifyAdmin();
  }, [navigate]);

  const fetchBlockchainData = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/blockchain/blocks');
      const data = await response.json();
      console.log('Admin check response:', data);
      setBlocks(data.blocks);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getBlockDetails = async (blockNumber) => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:5000/api/blockchain/blocks/${blockNumber}`);
      const data = await response.json();
      setCurrentBlock(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredBlocks = blocks.filter(block => 
    block.blockNumber.toString().includes(searchQuery) ||
    block.transactions.some(tx => 
      tx.txId.includes(searchQuery) ||
      JSON.stringify(block.data).toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
            Admin Dashboard
          </h1>
          <button 
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
          >
            Back to User Dashboard
          </button>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-6 flex items-center">
              <FaUserShield className="mr-2 text-emerald-400" /> Admin Tools
            </h2>
            <nav className="space-y-2">
              <button
                onClick={() => setActiveTab('blockchain')}
                className={`w-full text-left px-4 py-3 rounded-lg flex items-center transition-colors ${
                  activeTab === 'blockchain' 
                    ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700'
                    : 'hover:bg-gray-700'
                }`}
              >
                <FaLink className="mr-3" /> Blockchain Explorer
              </button>
              <button
                onClick={() => setActiveTab('transactions')}
                className={`w-full text-left px-4 py-3 rounded-lg flex items-center transition-colors ${
                  activeTab === 'transactions' 
                    ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700'
                    : 'hover:bg-gray-700'
                }`}
              >
                <FaHistory className="mr-3" /> Transaction History
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`w-full text-left px-4 py-3 rounded-lg flex items-center transition-colors ${
                  activeTab === 'analytics' 
                    ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700'
                    : 'hover:bg-gray-700'
                }`}
              >
                <FaChartLine className="mr-3" /> Platform Analytics
              </button>
              <button
                onClick={() => setActiveTab('data')}
                className={`w-full text-left px-4 py-3 rounded-lg flex items-center transition-colors ${
                  activeTab === 'data' 
                    ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700'
                    : 'hover:bg-gray-700'
                }`}
              >
                <FaDatabase className="mr-3" /> Raw Data Explorer
              </button>
            </nav>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {activeTab === 'blockchain' && (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold flex items-center">
                    <FaCube className="mr-2 text-emerald-400" /> Blockchain Explorer
                  </h2>
                  <div className="relative w-64">
                    <FaSearch className="absolute left-3 top-3 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search blocks..."
                      className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                {loading ? (
                  <div className="flex justify-center items-center h-64">
                    <FaSpinner className="animate-spin text-4xl text-emerald-400" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredBlocks.map((block) => (
                      <div 
                        key={block.blockNumber}
                        className="bg-gray-700/50 p-4 rounded-lg border border-gray-600 hover:border-emerald-500 cursor-pointer transition-colors"
                        onClick={() => getBlockDetails(block.blockNumber)}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <h3 className="font-mono text-emerald-400">Block #{block.blockNumber}</h3>
                            <p className="text-sm text-gray-400">
                              {new Date(block.timestamp).toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm">
                              <span className="text-gray-400">Transactions:</span>{' '}
                              <span className="font-bold">{block.transactions.length}</span>
                            </p>
                            <p className="text-sm">
                              <span className="text-gray-400">Size:</span>{' '}
                              <span className="font-mono">{block.size} bytes</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {currentBlock && (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mt-6">
                <h3 className="text-lg font-semibold mb-4">
                  Block #{currentBlock.blockNumber} Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Block Header</h4>
                    <pre className="bg-gray-900 p-4 rounded-lg overflow-x-auto text-sm">
                      {JSON.stringify(currentBlock.header, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Block Data</h4>
                    <pre className="bg-gray-900 p-4 rounded-lg overflow-x-auto text-sm">
                      {JSON.stringify(currentBlock.data, null, 2)}
                    </pre>
                  </div>
                </div>
                <div className="mt-6">
                  <h4 className="text-sm font-medium text-gray-400 mb-2">Transactions ({currentBlock.transactions.length})</h4>
                  <div className="space-y-3">
                    {currentBlock.transactions.map((tx, index) => (
                      <div key={index} className="bg-gray-700/30 p-3 rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-mono text-sm text-blue-400">{tx.txId}</span>
                          <span className="text-xs text-gray-400">
                            {new Date(tx.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <pre className="text-xs bg-gray-900 p-2 rounded overflow-x-auto">
                          {JSON.stringify(tx.payload, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}