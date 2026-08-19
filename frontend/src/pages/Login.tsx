import React from 'react';
import { authService } from '../services/auth';

const Login: React.FC = () => {
  const handleLogin = () => {
    window.location.href = authService.getGoogleLoginUrl();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center border border-gray-100">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Intelligent Email Assistant</h1>
        <p className="text-gray-500 mb-8">
          Read, understand and reply to your emails with the help of local AI.
        </p>
        
        <button 
          onClick={handleLogin}
          className="w-full flex items-center justify-center bg-white border border-gray-300 text-gray-700 font-medium py-2.5 px-4 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
        >
          <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google Logo" className="w-5 h-5 mr-3" />
          Continue with Google
        </button>

        <div className="mt-8 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-400">Powered by Gmail + Ollama</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
