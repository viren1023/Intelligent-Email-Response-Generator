import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService, type User } from '../services/auth';

const Settings: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    authService.getMe().then(setUser).catch(() => navigate('/login'));
  }, [navigate]);

  if (!user) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-8 py-5 flex items-center">
        <button onClick={() => navigate('/dashboard')} className="mr-4 text-gray-500 hover:text-gray-900">
          &larr; Back
        </button>
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
      </header>

      <div className="p-8 flex-1 max-w-3xl mx-auto w-full">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
            <h2 className="font-semibold text-gray-800">Google Account</h2>
          </div>
          <div className="p-6">
            <p className="text-gray-900 mb-4">{user.email}</p>
            <button onClick={() => authService.logout().then(() => navigate('/login'))} className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-2 px-4 rounded-lg transition-colors shadow-sm">
              Logout
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
            <h2 className="font-semibold text-gray-800">AI Model</h2>
          </div>
          <div className="p-6">
            <p className="text-gray-900 mb-2">Current Model: <strong className="bg-gray-100 px-2 py-1 rounded">llama3</strong></p>
            <div className="flex items-center text-sm text-gray-500 mb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 mr-2 shadow-sm shadow-green-200"></span> Connected to Ollama
            </div>
            <button className="bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-medium py-2 px-4 rounded-lg transition-colors shadow-sm">
              Test AI Connection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
