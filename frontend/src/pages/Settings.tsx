import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService, type User } from '../services/auth';
import { settingsService, type AIModel, type UserPreferences } from '../services/settings';
import { useTheme } from '../context/ThemeContext';

const SettingsSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-6">
    {[1, 2, 3].map(i => (
      <div key={i} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
        </div>
        <div className="p-6 space-y-3">
          <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded w-48" />
          <div className="h-8 bg-gray-100 dark:bg-gray-700 rounded w-24" />
        </div>
      </div>
    ))}
  </div>
);

const Settings: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  // AI & Preferences state
  const [prefs, setPrefs] = useState<UserPreferences>({
    active_provider: 'ollama',
    ollama_model: 'llama3.2',
    gemini_model: 'gemini-1.5-flash',
    default_tone: 'professional',
    custom_tone_prompt: '',
  });
  const [maskedGeminiKey, setMaskedGeminiKey] = useState('');
  const [inputGeminiKey, setInputGeminiKey] = useState('');
  const [ollamaModels, setOllamaModels] = useState<AIModel[]>([]);
  const [geminiModels, setGeminiModels] = useState<AIModel[]>([]);
  
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');


  useEffect(() => {
    Promise.all([
      authService.getMe(),
      settingsService.getPreferences(),
      settingsService.getOllamaModels(),
      settingsService.getGeminiModels(),
    ])
      .then(([userData, prefData, oModels, gModels]) => {
        setUser(userData);
        if (prefData.preferences) {
          setPrefs(prev => ({ ...prev, ...prefData.preferences }));
        }
        setMaskedGeminiKey(prefData.masked_gemini_key || '');
        setOllamaModels(oModels);
        setGeminiModels(gModels);
      })
      .catch(() => navigate('/login'))
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleUpdatePreference = async (key: keyof UserPreferences, value: string) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    try {
      await settingsService.updatePreferences({ [key]: value });
      setSaveSuccessMsg('Settings updated');
      setTimeout(() => setSaveSuccessMsg(''), 2500);
    } catch {
      alert('Failed to update settings');
    }
  };

  const handleTestOllama = async () => {
    setIsTesting(true);
    setTestStatus(null);
    try {
      const res = await settingsService.testOllama();
      if (res.status === 'connected') {
        setTestStatus(`Connected successfully! Found ${res.models_count || 0} model(s).`);
      } else {
        setTestStatus(`Connection failed: ${res.detail || 'Ollama offline'}`);
      }
    } catch {
      setTestStatus('Connection failed: Ollama is unreachable at http://localhost:11434');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveGeminiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputGeminiKey.trim()) return;
    setIsSavingKey(true);
    try {
      const res = await settingsService.setGeminiKey(inputGeminiKey);
      setMaskedGeminiKey(res.masked_key);
      setInputGeminiKey('');
      setSaveSuccessMsg('Gemini API key saved');
      setTimeout(() => setSaveSuccessMsg(''), 2500);
    } catch {
      alert('Failed to save Gemini key');
    } finally {
      setIsSavingKey(false);
    }
  };

  return (
    <div className="h-screen flex overflow-hidden bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Sticky sidebar */}
      <aside className="w-60 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col flex-shrink-0 sticky top-0 h-screen">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Email AI</h2>
          </div>
          <button
            onClick={toggleTheme}
            title="Toggle theme"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          <Link
            to="/dashboard"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            Inbox
          </Link>
          <Link
            to="/history"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            History
          </Link>
          <Link
            to="/settings"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            </svg>
            Settings
          </Link>
        </nav>

        {user && (
          <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2">
            {user.picture
              ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full ring-2 ring-gray-100 dark:ring-gray-700" />
              : <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm">{user.name.charAt(0)}</div>
            }
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{user.name}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Settings</h1>
            {saveSuccessMsg && (
              <span className="text-sm text-green-600 dark:text-green-400 font-medium bg-green-50 dark:bg-green-900/30 px-3 py-1 rounded-full animate-fade-in">
                {saveSuccessMsg} ✓
              </span>
            )}
          </div>

          {loading ? (
            <SettingsSkeleton />
          ) : (
            <div className="space-y-6">
              {/* Google Account */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                  <h2 className="font-semibold text-gray-800 dark:text-gray-200">Google Account</h2>
                </div>
                <div className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {user?.picture
                      ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-10 h-10 rounded-full" />
                      : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold">{user?.name.charAt(0)}</div>
                    }
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{user?.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => authService.logout().then(() => navigate('/login'))}
                    className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-950/40 font-medium py-2 px-4 rounded-lg transition-colors shadow-sm text-sm"
                  >
                    Logout
                  </button>
                </div>
              </div>

              {/* AI Provider & Models */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-800 dark:text-gray-200">AI Engine & Provider</h2>
                  <span className="text-xs bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-2.5 py-1 rounded-full font-medium">
                    Active: {prefs.active_provider.toUpperCase()}
                  </span>
                </div>

                <div className="p-6 space-y-6">
                  {/* Provider Radio selector */}
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3 block">
                      Select AI Provider
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <div
                        onClick={() => handleUpdatePreference('active_provider', 'ollama')}
                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          prefs.active_provider === 'ollama'
                            ? 'border-indigo-600 bg-indigo-50/30 dark:bg-indigo-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">🦙</span>
                          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Ollama (Local)</h3>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Run completely offline with local open-source LLMs.</p>
                      </div>

                      <div
                        onClick={() => handleUpdatePreference('active_provider', 'gemini')}
                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          prefs.active_provider === 'gemini'
                            ? 'border-indigo-600 bg-indigo-50/30 dark:bg-indigo-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">✨</span>
                          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Google Gemini (Cloud)</h3>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">High-speed inference via Google's Gemini models.</p>
                      </div>
                    </div>
                  </div>

                  {/* Ollama Section */}
                  <div className="border-t border-gray-100 dark:border-gray-700 pt-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Ollama Model</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Select from locally pulled models</p>
                      </div>
                      <select
                        value={prefs.ollama_model}
                        onChange={e => handleUpdatePreference('ollama_model', e.target.value)}
                        className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                      >
                        {ollamaModels.map(m => (
                          <option key={m.name} value={m.name}>{m.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        Ollama Base URL: <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">http://localhost:11434</code>
                      </div>
                      <button
                        onClick={handleTestOllama}
                        disabled={isTesting}
                        className="bg-white dark:bg-gray-700 border border-indigo-200 dark:border-gray-600 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 font-medium py-1.5 px-3 rounded-lg text-xs transition-colors shadow-xs"
                      >
                        {isTesting ? 'Testing...' : 'Test Connection'}
                      </button>
                    </div>

                    {testStatus && (
                      <p className={`text-xs p-2.5 rounded-lg ${testStatus.includes('successfully') ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
                        {testStatus}
                      </p>
                    )}
                  </div>

                  {/* Gemini Section */}
                  <div className="border-t border-gray-100 dark:border-gray-700 pt-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Gemini Model</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Target Gemini model</p>
                      </div>
                      <select
                        value={prefs.gemini_model}
                        onChange={e => handleUpdatePreference('gemini_model', e.target.value)}
                        className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                      >
                        {geminiModels.map(m => (
                          <option key={m.name} value={m.name}>{m.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
                        Gemini API Key
                      </label>
                      <form onSubmit={handleSaveGeminiKey} className="flex gap-2">
                        <input
                          type="password"
                          placeholder={maskedGeminiKey || "Enter your Gemini API key (e.g. AIzaSy...)"}
                          value={inputGeminiKey}
                          onChange={e => setInputGeminiKey(e.target.value)}
                          className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          type="submit"
                          disabled={!inputGeminiKey.trim() || isSavingKey}
                          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                          {isSavingKey ? 'Saving...' : 'Save Key'}
                        </button>
                      </form>
                      {maskedGeminiKey && (
                        <p className="text-xs text-gray-400 mt-1">Current Key: {maskedGeminiKey}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tone Defaults */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                  <h2 className="font-semibold text-gray-800 dark:text-gray-200">Default Response Style & Tone</h2>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
                      Default Tone Preset
                    </label>
                    <select
                      value={prefs.default_tone}
                      onChange={e => handleUpdatePreference('default_tone', e.target.value)}
                      className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="professional">Professional (Polite & Standard Business)</option>
                      <option value="friendly">Friendly (Warm & Cordial)</option>
                      <option value="concise">Concise (Direct & Brief)</option>
                      <option value="formal">Formal (Structured & Traditional Corporate)</option>
                      <option value="custom">Custom (User defined)</option>
                    </select>
                  </div>

                  {prefs.default_tone === 'custom' && (
                    <div>
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
                        Custom Tone Prompt
                      </label>
                      <input
                        type="text"
                        placeholder="E.g., Enthusiastic, supportive, and action-oriented"
                        value={prefs.custom_tone_prompt}
                        onChange={e => setPrefs(prev => ({ ...prev, custom_tone_prompt: e.target.value }))}
                        onBlur={() => handleUpdatePreference('custom_tone_prompt', prefs.custom_tone_prompt)}
                        className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Settings;
