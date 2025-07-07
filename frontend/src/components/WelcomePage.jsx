import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// Constants
const FEATURES_DATA = [
  { title: "AI-Powered Verification", desc: "Advanced artificial intelligence validates carbon credit authenticity through comprehensive document analysis and pattern recognition.", icon: "🔍" },
  { title: "Immutable Records", desc: "Secure, tamper-proof storage on distributed ledger technology ensures permanent transparency and accountability.", icon: "🔒" },
  { title: "Smart Analytics", desc: "Automated extraction and analysis of environmental data provides real-time insights into carbon credit performance.", icon: "📊" },
  { title: "Blockchain Registry", desc: "Hyperledger Fabric integration creates an auditable trail of all transactions and certifications.", icon: "⛓️" },
];

const STATS_DATA = [
  { value: "250+", label: "Projects Verified" },
  { value: "2.5M+", label: "Credits Registered" },
  { value: "150+", label: "Organizations Trusted" }
];

// Reusable components
const FeatureCard = React.memo(({ feature }) => (
  <div
    className="bg-gray-800/80 backdrop-blur-sm border border-gray-600/50 rounded-2xl p-8 m-2 shadow-2xl transition-all duration-500 ease-out h-full text-center cursor-pointer hover:transform hover:-translate-y-3 hover:shadow-2xl hover:shadow-green-500/40 hover:bg-gray-800/90 hover:border-green-500/50"
    role="article"
    tabIndex={0}
    aria-label={`Feature: ${feature.title}`}
  >
    <div className="text-5xl mb-6 transform transition-transform duration-300 hover:scale-110" aria-hidden="true">{feature.icon}</div>
    <h3 className="text-green-400 mb-6 text-xl font-bold tracking-wide">{feature.title}</h3>
    <p className="leading-relaxed opacity-90 text-sm text-gray-300 font-light">{feature.desc}</p>
  </div>
));

const StatCard = React.memo(({ stat }) => (
  <div className="text-center transform transition-all duration-300 hover:scale-105">
    <h3 className="text-green-400 text-5xl font-bold mb-3 bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">{stat.value}</h3>
    <p className="text-lg opacity-90 font-medium text-gray-300 tracking-wide">{stat.label}</p>
  </div>
));

const LoadingSpinner = () => (
  <div className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
);

export default function WelcomePage() {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const scrollToFunctions = useCallback(() => {
    const element = document.getElementById("functions");
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const handleKeyDown = useCallback((e, action) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  }, []);

  const navigateToLogin = useCallback(() => {
    setIsLoading(true);
    setTimeout(() => {
      navigate("/login");
      setIsLoading(false);
    }, 500);
  }, [navigate]);

  return (
    <div className="font-['Inter',_'SF_Pro_Display',_system-ui,_sans-serif] bg-gray-900 text-white min-h-screen" style={{backgroundColor: '#0a0a0a', color: '#ffffff', minHeight: '100vh'}}>
      {/* Navbar */}
      <nav className="bg-gray-900/95 backdrop-blur-md border-b border-gray-700/50 py-5 sticky top-0 z-50 shadow-2xl" role="navigation" aria-label="Main navigation">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <div className="text-3xl font-bold">
            <a href="/" className="bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent no-underline hover:from-green-300 hover:to-emerald-300 transition-all duration-300" aria-label="GreenCredit Home">
              EcoLeadger
            </a>
          </div>
          <div className="flex items-center">
            <button
              className="px-8 py-3 border-none rounded-full text-base cursor-pointer transition-all duration-300 font-semibold no-underline inline-flex items-center justify-center bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-400 hover:to-emerald-400 hover:shadow-2xl hover:shadow-green-500/50 hover:transform hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={navigateToLogin}
              onKeyDown={(e) => handleKeyDown(e, navigateToLogin)}
              disabled={isLoading}
              aria-label="Access your account or create new account"
            >
              {isLoading && <LoadingSpinner />}
              Access Platform
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section 
        className="bg-gradient-to-br from-green-900/90 to-emerald-900/90 text-white py-32 text-center relative overflow-hidden" 
        aria-labelledby="hero-title"
      >
        {/* Video Background */}
        <video 
          autoPlay 
          loop 
          muted 
          playsInline
          className="absolute top-0 left-0 w-full h-full object-cover z-0"
          style={{ filter: 'brightness(0.4)' }}
        >
          {/* 
          ============================================================
          ADD YOUR VIDEO URL HERE (from public folder):
          Replace "your-video-filename.mp4" with your actual video name
          Example: If your video is public/videos/hero-bg.mp4, use:
          <source src="/videos/hero-bg.mp4" type="video/mp4" />
          ============================================================
          */}
          <source src="/pinterestdownloader.com-1751743148.94144.mp4" type="video/mp4" />
          {/* Fallback for browsers that don't support video */}
          Your browser does not support the video tag.
        </video>
        
        {/* Gradient overlay */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-green-900/40 via-transparent to-gray-900/60 z-10" aria-hidden="true"></div>
        
        <div className="max-w-5xl mx-auto relative z-20 px-8">
          <h1 id="hero-title" className="text-6xl font-bold mb-6 drop-shadow-2xl bg-gradient-to-r from-white to-gray-200 bg-clip-text text-transparent leading-tight">
            Revolutionize Environmental Impact Through Technology
          </h1>
          <p className="text-2xl mb-10 opacity-95 drop-shadow-lg font-light leading-relaxed max-w-3xl mx-auto">
            Pioneering the future of carbon credit verification through AI-driven authentication and blockchain transparency
          </p>
          <button
            className="px-12 py-5 border-none rounded-full text-lg cursor-pointer transition-all duration-500 font-bold no-underline inline-flex items-center justify-center bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-400 hover:to-emerald-400 hover:shadow-2xl hover:shadow-green-500/50 hover:transform hover:-translate-y-2 active:scale-95 group"
            onClick={scrollToFunctions}
            onKeyDown={(e) => handleKeyDown(e, scrollToFunctions)}
            aria-label="Discover our platform capabilities"
          >
            <span className="mr-2">Discover Our Platform</span>
            <span className="transform transition-transform duration-300 group-hover:translate-x-1">→</span>
          </button>
        </div>
      </section>

      {/* Features Section */}
      <section id="functions" className="py-24 bg-gray-900/95 px-8" aria-labelledby="features-title">
        <div className="max-w-7xl mx-auto">
          <h2 id="features-title" className="text-center text-green-400 mb-16 text-5xl font-bold tracking-tight">
            Advanced Carbon Credit Solutions
          </h2>
          <p className="text-center text-gray-300 mb-16 text-xl font-light max-w-3xl mx-auto leading-relaxed">
            Leveraging cutting-edge technology to create the most trusted and efficient carbon credit verification system in the industry
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {FEATURES_DATA.map((feature, idx) => (
              <FeatureCard key={idx} feature={feature} />
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 text-center bg-gradient-to-r from-gray-800/50 to-gray-900/50 px-8 backdrop-blur-sm" aria-labelledby="stats-title">
        <div className="max-w-6xl mx-auto">
          <h3 id="stats-title" className="text-green-400 mb-12 text-4xl font-bold tracking-tight">
            Trusted by Industry Leaders Worldwide
          </h3>
          <p className="text-gray-300 mb-12 text-lg font-light max-w-2xl mx-auto">
            Our platform has established itself as the gold standard for carbon credit verification and trading
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {STATS_DATA.map((stat, idx) => (
              <StatCard key={idx} stat={stat} />
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 text-center border-t border-gray-700/50 bg-gray-900/95 backdrop-blur-sm" role="contentinfo">
        <div className="max-w-6xl mx-auto">
          <p className="text-gray-400 font-light tracking-wide">
            &copy; {new Date().getFullYear()} GreenCredit. Pioneering sustainable innovation through technology.
          </p>
        </div>
      </footer>
    </div>
  );
}