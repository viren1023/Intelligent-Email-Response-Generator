import React from 'react';
import { authService } from '../services/auth';
import { ArrowRight, ShieldCheck } from 'lucide-react';

export const Login: React.FC = () => {
  const handleLogin = () => {
    window.location.href = authService.getGoogleLoginUrl();
  };

  return (
    <div className="w-full h-screen flex items-center justify-center bg-slate-50 dark:bg-canvas-dark p-4">
      <div className="max-w-md w-full p-8 sm:p-10 flex flex-col items-center text-center space-y-6 bg-white dark:bg-surface-darkCard border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm">
        {/* Brand Logo */}
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            Email.ai
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            Intelligent context analysis, automated drafting, tone transformation, and seamless Gmail workspace integration.
          </p>
        </div>

        {/* Login Button Box */}
        <div className="w-full max-w-sm space-y-4">
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 py-3 px-5 rounded-xl btn-charcoal text-sm shadow-sm"
          >
            <img
              src="https://www.svgrepo.com/show/475656/google-color.svg"
              alt="Google"
              className="w-4 h-4"
            />
            <span>Sign in with Google</span>
            <ArrowRight className="w-4 h-4 text-slate-400" />
          </button>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>OAuth 2.0 Secure Local Encryption</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
