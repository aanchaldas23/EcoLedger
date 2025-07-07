import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function LoginRegisterPage() {
  const [isSignIn, setIsSignIn] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: ""
  });
  const [role, setRole] = useState('individual');
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError("");
    if (successMessage) setSuccessMessage("");
  };

  const handleRoleChange = (e) => {
    setRole(e.target.value);
    if (error) setError("");
  };

  const validateForm = () => {
    const { email, password, name } = formData;
    if (!email || !password) {
      setError("Email and password are required.");
      return false;
    }
    if (!name) {
      setError("Please enter your username.");
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError("Please enter a valid email address.");
      return false;
    }
    if (!isSignIn && !role) {
      setError("Please select whether you are an Individual or Organization.");
      return false;
    }
    return true;
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const response = await fetch("http://localhost:5000/api/auth/signin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
        credentials: "include"
      });

      const data = await response.json();
      console.log("Sign In Response:", data);
      if (data.success) {
        localStorage.setItem('userId', data.user.userId);
        localStorage.setItem('email', data.user.email);
        //localStorage.setItem('token', data.token || 'demo-token');
        setSuccessMessage("Sign in successful! Redirecting...");
        navigate('/dashboard', { 
          state: { 
            message: 'Login successful!',
            messageType: 'success'
          }
        });
      } else {
        setError(data.message || "Invalid email or password. Please try again.");
      }
    } catch (err) {
      console.error("Sign In Error:", err);
      setError("An unexpected error occurred. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const response = await fetch("http://localhost:5000/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...formData, role }),
        credentials: "include"
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('userId', data.userId);
        setSuccessMessage("Registration successful! You can now sign in.");
        setFormData({ email: "", password: "" , name:""});
        setRole('individual');
        setIsSignIn(true);
      } else {
        setError(data.message || "Registration failed. Please try again.");
      }
    } catch (err) {
      console.error("Sign Up Error:", err);
      setError("An unexpected error occurred. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

return (
  <div className="min-h-screen bg-gradient-to-br from-gray-900 via-emerald-900 to-black flex items-center justify-center p-4 font-sans">
    <div className="relative w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden" style={{ height: "600px" }}>
      {/* Background image that will be visible during transition */}
      <div className="absolute inset-0 w-full h-full">
        <img 
          src="/Spathiphyllum cannifolium concept, green abstract texture with white frame, natural background, tropical leaves in Asia and Thailand_.jpeg" 
          alt="Leaf pattern" 
          className="w-full h-full object-cover"
        />
        {/* Left Side - Form */}
        <div className={`absolute top-0 left-0 w-1/2 h-full p-12 flex flex-col justify-center transition-all duration-500 ease-in-out bg-gradient-to-br from-emerald-900 via-green-900 to-gray-900 ${
          isSignIn ? 'translate-x-0' : 'translate-x-full'
        }`}>
          <div className="max-w-sm mx-auto w-full">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-white mb-2">
                {isSignIn ? "Welcome Back" : "Join Us"}
              </h1>
              <p className="text-gray-300">
                {isSignIn ? "Sign in to your account" : "Create your account"}
              </p>
            </div>

            <form className="space-y-6" onSubmit={isSignIn ? handleSignIn : handleSignUp}>
              <div className="space-y-4">
                <div className="relative">
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Name"
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all text-white"
                    required
                  />
                </div>
                <div className="relative">
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Email"
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all text-white"
                    required
                  />
                </div>
                <div className="relative">
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Password"
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all text-white"
                    required
                  />
                </div>
              </div>

              {!isSignIn && (
                <div className="space-y-3">
                  <p className="text-gray-300 text-sm font-medium">Join as:</p>
                  <div className="flex items-center space-x-6">
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="role"
                        value="individual"
                        checked={role === 'individual'}
                        onChange={handleRoleChange}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded-full border-2 mr-2 transition-all ${
                        role === 'individual' 
                          ? 'border-emerald-500 bg-emerald-500' 
                          : 'border-gray-300'
                      }`}>
                        {role === 'individual' && (
                          <div className="w-2 h-2 bg-white rounded-full mx-auto mt-0.5"></div>
                        )}
                      </div>
                      <span className="text-gray-300">Individual</span>
                    </label>
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="role"
                        value="organization"
                        checked={role === 'organization'}
                        onChange={handleRoleChange}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded-full border-2 mr-2 transition-all ${
                        role === 'organization' 
                          ? 'border-emerald-500 bg-emerald-500' 
                          : 'border-gray-300'
                      }`}>
                        {role === 'organization' && (
                          <div className="w-2 h-2 bg-white rounded-full mx-auto mt-0.5"></div>
                        )}
                      </div>
                      <span className="text-gray-300">Organization</span>
                    </label>
                  </div>
                </div>
              )}

              {isSignIn && (
                <div className="text-right">
                  <a href="#" className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
                    Forgot password?
                  </a>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}
              {successMessage && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-green-600 text-sm">{successMessage}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold py-3 rounded-xl hover:from-emerald-600 hover:to-teal-700 disabled:from-gray-400 disabled:to-gray-500 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : isSignIn ? (
                  "Sign In"
                ) : (
                  "Create Account"
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-gray-300">
                {isSignIn ? "Don't have an account?" : "Already have an account?"}
                <button
                  onClick={() => {
                    setIsSignIn(!isSignIn);
                    setError("");
                    setSuccessMessage("");
                    setFormData({ email: "", password: "" , name: "" });
                    setRole('individual');
                  }}
                  className="ml-2 text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
                >
                  {isSignIn ? "Sign Up" : "Sign In"}
                </button>
              </p>
            </div>
          </div>
        </div>

        {/* Right Side - Welcome Panel */}
        <div className={`absolute top-0 left-1/2 w-1/2 h-full transition-all duration-500 ease-in-out ${
          isSignIn ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-800 via-emerald-900 to-gray-900"></div>
          
          {/* Add your leaf image here */}
          <div className="absolute inset-0">
            <img 
              src="/Spathiphyllum cannifolium concept, green abstract texture with white frame, natural background, tropical leaves in Asia and Thailand_.jpeg" 
              alt="Leaf pattern" 
              className="w-full h-full object-cover"
            />
          </div>
          
          <div className="relative z-10 p-12 flex flex-col justify-center items-center text-center h-full text-white">
            <div className="max-w-xs">
              <div className="mb-8">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
              </div>
              
              <h1 className="text-4xl font-bold mb-4">
                {isSignIn ? "Hello, Friend!" : "Welcome Back!"}
              </h1>
              <p className="text-lg opacity-90 leading-relaxed mb-8">
                {isSignIn
                  ? "Enter your details and start your journey with us"
                  : "To keep connected with us please login with your personal info"}
              </p>
              
              <div className="space-y-4">
                <div className="w-12 h-0.5 bg-white/60 mx-auto"></div>
                <p className="text-sm opacity-80">
                  {isSignIn ? "New here?" : "Already a member?"}
                </p>
                <button
                  onClick={() => {
                    setIsSignIn(!isSignIn);
                    setError("");
                    setSuccessMessage("");
                    setFormData({ email: "", password: "", name: "" });
                    setRole('individual');
                  }}
                  className="bg-white/10 backdrop-blur-sm border-2 border-white/30 font-semibold py-3 px-8 rounded-xl hover:bg-white/20 transition-all duration-300 transform hover:scale-105"
                >
                  {isSignIn ? "Sign Up" : "Sign In"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}