// src/components/AuthenticationPage.jsx

import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FaSpinner, FaCheckCircle, FaTimesCircle, FaInfoCircle, FaScroll, FaProjectDiagram, FaBalanceScale, FaCubes, FaStore, FaArrowLeft } from 'react-icons/fa';

export default function AuthenticationPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const [authResult, setAuthResult] = useState(null);
    const [uploadedFileName, setUploadedFileName] = useState('');
    const [message, setMessage] = useState('');
    const [isListing, setIsListing] = useState(false);
    const [listingPrice, setListingPrice] = useState('');
    const [listingDescription, setListingDescription] = useState('');

    useEffect(() => {
        if (location.state && location.state.authResult) {
            setAuthResult(location.state.authResult);
            setUploadedFileName(location.state.uploadedFileName || 'N/A');
            
            // Auto-redirect for unauthenticated certificates after 3 seconds
            if (location.state.authResult.authenticated === false) {
                setTimeout(() => {
                    navigate('/dashboard', { 
                        state: { 
                            message: 'Certificate authentication failed. Please try again with a valid certificate.',
                            messageType: 'error'
                        }
                    });
                }, 3000);
            }
        } else {
            setMessage('No authentication data provided. Please upload a certificate first.');
            setAuthResult({ status: 'error', message: 'No authentication data provided.' });
        }
    }, [location.state, navigate]);

    const handleListOnMarketplace = async () => {
        if (!listingPrice || parseFloat(listingPrice) <= 0) {
            alert('Please enter a valid price per credit');
            return;
        }

        setIsListing(true);
        
        try {
            const listingData = {
                // Certificate data from authentication
                project_id: authResult.extracted_data.project_id,
                project_name: authResult.extracted_data.project_name,
                vintage: authResult.extracted_data.vintage,
                serial_number: authResult.extracted_data.serial_number,
                amount: authResult.extracted_data.amount,
                issuance_date: authResult.extracted_data.issuance_date,
                registry: authResult.extracted_data.registry,
                category: authResult.extracted_data.category,
                issued_to: authResult.extracted_data.issued_to,
                
                // Carbonmark verification data
                carbonmark_id: authResult.carbonmark_details?.id,
                carbonmark_name: authResult.carbonmark_details?.name,
                
                // Blockchain data
                blockchain_status: authResult.blockchain_status,
                fabric_tx_id: authResult.fabric_tx_id,
                
                // Marketplace listing data
                price_per_credit: parseFloat(listingPrice),
                total_value: parseFloat(listingPrice) * parseFloat(authResult.extracted_data.amount),
                listing_description: listingDescription || `Verified carbon credits from ${authResult.extracted_data.project_name}`,
                listed_date: new Date().toISOString(),
                status: 'available',
                
                // Metadata
                verified: true,
                authentication_date: new Date().toISOString(),
                original_filename: uploadedFileName
            };

            // Call your backend API to list the credit on marketplace
            const response = await fetch('http://localhost:5001/api/marketplace/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(listingData)
            });

            if (response.ok) {
                const result = await response.json();
                navigate('/dashboard', { 
                    state: { 
                        message: `Credit ${authResult.extracted_data.project_id} successfully listed on marketplace!`,
                        messageType: 'success',
                        newListing: result
                    }
                });
            } else {
                throw new Error('Failed to list credit on marketplace');
            }
        } catch (error) {
            console.error('Error listing credit:', error);
            alert('Failed to list credit on marketplace. Please try again.');
        } finally {
            setIsListing(false);
        }
    };

    if (!authResult) {
        return (
            <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-8 font-sans">
                <div className="flex flex-col items-center space-y-4">
                    <FaSpinner className="animate-spin text-blue-400" size={50} />
                    <p className="text-xl text-gray-300">Loading authentication results...</p>
                </div>
            </div>
        );
    }

    const isSuccess = authResult.authenticated === true;
    const isUnauthenticated = authResult.authenticated === false && authResult.status === 'unauthenticated';
    const isError = authResult.status === 'error';
    const displayMessage = authResult.message || "No specific message provided.";

    const getStatusIcon = () => {
        if (isSuccess) return <FaCheckCircle className="text-emerald-400" size={60} />;
        if (isUnauthenticated) return <FaTimesCircle className="text-yellow-400" size={60} />;
        if (isError) return <FaTimesCircle className="text-red-400" size={60} />;
        return <FaInfoCircle className="text-gray-400" size={60} />;
    };

    const getTitle = () => {
        if (isSuccess) return "Authentication Successful!";
        if (isUnauthenticated) return "Authentication Failed!";
        if (isError) return "Authentication Error!";
        return "Authentication Details";
    };

    const getTitleColor = () => {
        if (isSuccess) return "from-emerald-400 to-teal-400";
        if (isUnauthenticated) return "from-yellow-400 to-orange-400";
        if (isError) return "from-red-400 to-pink-400";
        return "from-blue-400 to-indigo-400";
    };

    const DetailRow = ({ icon, label, value }) => (
        <div className="flex items-center p-3 bg-gray-700/50 rounded-lg shadow-sm">
            {icon && <span className="mr-3 text-lg text-gray-400">{icon}</span>}
            <span className="text-gray-400 text-md font-medium">{label}:</span>
            <span className="ml-auto font-semibold text-white">{value || "N/A"}</span>
        </div>
    );

    const ExtractedDetailRow = ({ icon, label, value }) => (
        <div className="flex items-start p-3 bg-gray-700/50 rounded-lg shadow-sm">
            {icon && <span className="mr-3 text-lg text-gray-400 mt-1">{icon}</span>}
            <div className="flex flex-col">
                <span className="text-gray-400 text-md font-medium">{label}:</span>
                <span className="font-semibold text-white break-words">{value || "N/A"}</span>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-8 font-sans">
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-10 rounded-3xl shadow-2xl border border-gray-700 w-full max-w-4xl transform transition-all duration-300 hover:scale-[1.01]">
                <div className="flex flex-col items-center mb-8 text-center">
                    {getStatusIcon()}
                    <h2 className={`text-4xl font-bold bg-gradient-to-r ${getTitleColor()} bg-clip-text text-transparent mt-4 mb-2`}>
                        {getTitle()}
                    </h2>
                    <p className={`text-lg mb-4 ${isSuccess ? 'text-emerald-300' : isUnauthenticated ? 'text-yellow-300' : 'text-red-300'}`}>
                        {displayMessage}
                    </p>
                    <p className="text-gray-400 text-sm italic">
                        Processing results for: <span className="font-semibold text-gray-300">{uploadedFileName}</span>
                    </p>
                    
                    {/* Auto-redirect message for unauthenticated certificates */}
                    {isUnauthenticated && (
                        <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-600 rounded-lg">
                            <p className="text-yellow-200 text-sm">
                                🔄 Redirecting to dashboard in 3 seconds...
                            </p>
                        </div>
                    )}
                </div>

                {authResult.extracted_data && (
                    <div className="mb-8">
                        <h3 className="text-2xl font-bold text-gray-300 mb-4 flex items-center">
                            <FaScroll className="mr-3 text-blue-400" /> Extracted Certificate Data
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <ExtractedDetailRow icon="🆔" label="Project ID" value={authResult.extracted_data.project_id} />
                            <ExtractedDetailRow icon="🏷️" label="Project Name" value={authResult.extracted_data.project_name} />
                            <ExtractedDetailRow icon="🗓️" label="Vintage" value={authResult.extracted_data.vintage} />
                            <ExtractedDetailRow icon="🔢" label="Serial Number" value={authResult.extracted_data.serial_number} />
                            <ExtractedDetailRow icon="⚖️" label="Amount (tonnes)" value={authResult.extracted_data.amount} />
                            <ExtractedDetailRow icon="📅" label="Issuance Date" value={authResult.extracted_data.issuance_date} />
                            <ExtractedDetailRow icon="🏛️" label="Registry" value={authResult.extracted_data.registry} />
                            <ExtractedDetailRow icon="🗂️" label="Category" value={authResult.extracted_data.category} />
                            <ExtractedDetailRow icon="👤" label="Issued To" value={authResult.extracted_data.issued_to} />
                        </div>
                    </div>
                )}

                {isSuccess && authResult.carbonmark_details && (
                    <div className="mb-8">
                        <h3 className="text-2xl font-bold text-gray-300 mb-4 flex items-center">
                            <FaBalanceScale className="mr-3 text-emerald-400" /> Carbonmark Verification
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailRow icon="📝" label="Carbonmark Product ID" value={authResult.carbonmark_details.id} />
                            <DetailRow icon="🌳" label="Product Name" value={authResult.carbonmark_details.name} />
                        </div>
                    </div>
                )}

                {isSuccess && authResult.blockchain_status && (
                    <div className="mb-8">
                        <h3 className="text-2xl font-bold text-gray-300 mb-4 flex items-center">
                            <FaCubes className="mr-3 text-purple-400" /> Blockchain Status
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailRow icon="🔗" label="Status" value={authResult.blockchain_status} />
                            <DetailRow icon="📃" label="Fabric Tx ID" value={authResult.fabric_tx_id} />
                        </div>
                    </div>
                )}

                {/* Marketplace Listing Section - Only for authenticated certificates */}
                {isSuccess && (
                    <div className="mb-8">
                        <h3 className="text-2xl font-bold text-gray-300 mb-4 flex items-center">
                            <FaStore className="mr-3 text-green-400" /> List on Marketplace
                        </h3>
                        <div className="bg-gray-700/30 p-6 rounded-xl border border-gray-600">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-gray-300 text-sm font-medium mb-2">
                                        Price per Credit (USD)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="e.g., 25.00"
                                        className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-emerald-500"
                                        value={listingPrice}
                                        onChange={(e) => setListingPrice(e.target.value)}
                                    />
                                </div>
                                <div className="flex items-end">
                                    <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-600 w-full">
                                        <span className="text-gray-400 text-sm">Total Value:</span>
                                        <p className="text-emerald-400 font-bold text-lg">
                                            ${listingPrice && authResult.extracted_data.amount 
                                                ? (parseFloat(listingPrice) * parseFloat(authResult.extracted_data.amount)).toLocaleString('en-US', { minimumFractionDigits: 2 })
                                                : '0.00'
                                            }
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="mb-4">
                                <label className="block text-gray-300 text-sm font-medium mb-2">
                                    Listing Description (Optional)
                                </label>
                                <textarea
                                    rows="3"
                                    placeholder="Additional details about this credit batch..."
                                    className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-emerald-500"
                                    value={listingDescription}
                                    onChange={(e) => setListingDescription(e.target.value)}
                                />
                            </div>
                            <button
                                onClick={handleListOnMarketplace}
                                disabled={isListing || !listingPrice}
                                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-3 px-6 rounded-xl font-semibold hover:from-emerald-600 hover:to-teal-600 transition-all duration-300 transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center"
                            >
                                {isListing ? (
                                    <>
                                        <FaSpinner className="animate-spin mr-2" />
                                        Listing on Marketplace...
                                    </>
                                ) : (
                                    <>
                                        <FaStore className="mr-2" />
                                        List on Marketplace
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Troubleshooting section for failed authentications */}
                {(isUnauthenticated || isError) && (
                    <div className="p-4 bg-red-900/30 border border-red-700 rounded-xl mb-6 text-red-200 text-sm">
                        <p className="font-semibold mb-2">Troubleshooting Tips:</p>
                        <ul className="list-disc list-inside space-y-1">
                            <li>Ensure the PDF is a valid, searchable document, not just an image.</li>
                            <li>Verify the certificate format matches the expected regex patterns in `app.py`.</li>
                            <li>Check your Carbonmark API key and base URL in Flask's `.env` file.</li>
                            <li>Review your Flask `app.py` console for detailed errors.</li>
                        </ul>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex space-x-4">
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="flex-1 py-3 rounded-xl font-semibold text-md bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors duration-300 flex items-center justify-center"
                    >
                        <FaArrowLeft className="mr-2" />
                        Back to Dashboard
                    </button>
                    
                    {/* Only show "Try Another Certificate" for failed authentications */}
                    {(isUnauthenticated || isError) && (
                        <button
                            onClick={() => navigate('/upload')}
                            className="flex-1 py-3 rounded-xl font-semibold text-md bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 transition-all duration-300 transform hover:scale-105 shadow-lg"
                        >
                            Try Another Certificate
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}