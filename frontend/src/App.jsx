// src/App.jsx
import { Routes, Route } from 'react-router-dom';
import WelcomePage from './components/WelcomePage';
import LoginRegisterPage from './components/LoginRegisterPage';
import Dashboard from './components/Dashboard';
import UploadPage from './components/UploadPage';
import AuthenticationPage from './components/AuthenticationPage';
import AdminPage from './components/AdminPage';

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/login" element={<LoginRegisterPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/authenticate-result" element={<AuthenticationPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </div>
  );
}

export default App;