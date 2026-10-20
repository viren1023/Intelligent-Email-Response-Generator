import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService, type User } from '../services/auth';
import { emailService } from '../services/email';
import { getCachedUser, getCachedUnreadCount, setCachedUnreadCount } from '../utils/cache';
import { settingsService, type AIModel, type UserPreferences } from '../services/settings';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { ComposeModal } from '../components/ComposeModal';
import { Plus, Trash2, Edit2, Star, Check, AlertCircle, X, Eye, EyeOff, Key, ExternalLink } from 'lucide-react';

export interface CustomToneItem {
  id: string;
  name: string;
  instruction: string;
  enabled: boolean;
  isDefault?: boolean;
}

const DEFAULT_CUSTOM_TONES: CustomToneItem[] = [
  {
    id: 'tone-1',
    name: 'Executive Brief',
    instruction: 'Extremely concise, bullet points only, action-oriented with decision deadlines.',
    enabled: true,
    isDefault: false,
  },
  {
    id: 'tone-2',
    name: 'Warm & Empathetic',
    instruction: 'Supportive and encouraging, friendly sign-off, acknowledging personal context.',
    enabled: true,
    isDefault: false,
  },
];

const SettingsSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-6">
    {[1, 2, 3].map(i => (
      <div key={i} className="bg-white dark:bg-slate-900 rounded-3xl shadow-xs border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-lg w-32" />
        </div>
        <div className="p-6 space-y-3">
          <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-lg w-48" />
          <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded-lg w-24" />
        </div>
      </div>
    ))}
  </div>
);

const Settings: React.FC = () => {
  const [user, setUser] = useState<User | null>(getCachedUser);
  const [unreadCount, setUnreadCount] = useState<number>(getCachedUnreadCount);
  const [loading, setLoading] = useState(true);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const navigate = useNavigate();

  // AI & Preferences state
  const [prefs, setPrefs] = useState<UserPreferences>({
    active_provider: 'ollama',
    ollama_model: 'mistral',
    gemini_model: 'gemini-2.5-flash',
    default_tone: 'professional',
    custom_tone_prompt: '',
  });
  const [maskedGeminiKey, setMaskedGeminiKey] = useState('');
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [inputGeminiKey, setInputGeminiKey] = useState('');
  const [ollamaModels, setOllamaModels] = useState<AIModel[]>([]);
  const [geminiModels, setGeminiModels] = useState<AIModel[]>([]);

  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [showKeyText, setShowKeyText] = useState(false);
  const [geminiTestStatus, setGeminiTestStatus] = useState<string | null>(null);
  const [isTestingGemini, setIsTestingGemini] = useState(false);
  const [isDeletingKey, setIsDeletingKey] = useState(false);

  // Custom Tones state
  const [customTones, setCustomTones] = useState<CustomToneItem[]>(() => {
    try {
      const stored = localStorage.getItem('app_custom_tones');
      return stored ? JSON.parse(stored) : DEFAULT_CUSTOM_TONES;
    } catch {
      return DEFAULT_CUSTOM_TONES;
    }
  });

  const [isToneModalOpen, setIsToneModalOpen] = useState(false);
  const [editingToneId, setEditingToneId] = useState<string | null>(null);
  const [toneNameInput, setToneNameInput] = useState('');
  const [toneInstructionInput, setToneInstructionInput] = useState('');
  const [toneEnabledInput, setToneEnabledInput] = useState(true);

  // Sync custom tones to localStorage
  const saveCustomTones = (updated: CustomToneItem[]) => {
    setCustomTones(updated);
    try {
      localStorage.setItem('app_custom_tones', JSON.stringify(updated));
      localStorage.setItem('emailai_custom_tones', JSON.stringify(updated));
    } catch {}
  };

  useEffect(() => {
    Promise.all([
      authService.getMe(),
      settingsService.getPreferences(),
      settingsService.getOllamaModels(),
      settingsService.getGeminiModels(),
      emailService.getUnreadCount(),
    ])
      .then(([userData, prefData, oModels, gModels, uCount]) => {
        setUser(userData);
        if (prefData.preferences) {
          setPrefs(prev => ({ ...prev, ...prefData.preferences }));
          if (prefData.preferences.default_tone) {
            try {
              localStorage.setItem('app_default_tone', prefData.preferences.default_tone.toLowerCase());
            } catch {}
          }
        }
        setMaskedGeminiKey(prefData.masked_gemini_key || '');
        setHasGeminiKey(Boolean(prefData.has_gemini_key || prefData.masked_gemini_key));
        setOllamaModels(oModels);
        setGeminiModels(gModels);
        const count = uCount || 0;
        setUnreadCount(count);
        setCachedUnreadCount(count);
      })
      .catch(() => navigate('/login'))
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleUpdatePreference = async (key: keyof UserPreferences, value: string) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    try {
      await settingsService.updatePreferences({ [key]: value });
      setSaveSuccessMsg('Preferences updated');
      setTimeout(() => setSaveSuccessMsg(''), 2000);
    } catch {
      alert('Failed to update preference');
    }
  };

  const handleTestOllama = async () => {
    setIsTesting(true);
    setTestStatus(null);
    try {
      const res = await settingsService.testOllama();
      if (res.status === 'ok') {
        setTestStatus(`Connected successfully! Found ${res.models_count || 0} models.`);
      } else {
        setTestStatus(res.detail || 'Connection failed.');
      }
    } catch (e: any) {
      setTestStatus(e?.response?.data?.detail || 'Cannot connect to Ollama. Ensure Ollama is running.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveGeminiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputGeminiKey.trim()) return;
    setIsSavingKey(true);
    setGeminiTestStatus(null);
    try {
      const res = await settingsService.setGeminiKey(inputGeminiKey.trim());
      setMaskedGeminiKey(res.masked_key);
      setHasGeminiKey(true);
      setInputGeminiKey('');
      setShowKeyText(false);
      setSaveSuccessMsg('Gemini API key saved successfully');
      setTimeout(() => setSaveSuccessMsg(''), 2500);
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to save Gemini key');
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleDeleteGeminiKey = async () => {
    if (!window.confirm('Are you sure you want to remove your Gemini API key?')) return;
    setIsDeletingKey(true);
    setGeminiTestStatus(null);
    try {
      await settingsService.deleteGeminiKey();
      setMaskedGeminiKey('');
      setHasGeminiKey(false);
      setInputGeminiKey('');
      setPrefs((prev) => ({ ...prev, active_provider: 'ollama' }));
      setSaveSuccessMsg('Gemini API key removed');
      setTimeout(() => setSaveSuccessMsg(''), 2500);
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to delete Gemini key');
    } finally {
      setIsDeletingKey(false);
    }
  };

  const handleTestGeminiKey = async () => {
    setIsTestingGemini(true);
    setGeminiTestStatus(null);
    try {
      const keyToTest = inputGeminiKey.trim() || undefined;
      const res = await settingsService.testGeminiKey(keyToTest);
      if (res.status === 'valid') {
        setGeminiTestStatus(`Verified! Found ${res.models_count || 0} active Gemini models.`);
      } else {
        setGeminiTestStatus(res.detail || 'Connection test failed.');
      }
    } catch (err: any) {
      setGeminiTestStatus(err?.response?.data?.detail || 'Error connecting to Gemini API.');
    } finally {
      setIsTestingGemini(false);
    }
  };

  const handleOpenAddToneModal = () => {
    setEditingToneId(null);
    setToneNameInput('');
    setToneInstructionInput('');
    setToneEnabledInput(true);
    setIsToneModalOpen(true);
  };

  const handleOpenEditToneModal = (tone: CustomToneItem) => {
    setEditingToneId(tone.id);
    setToneNameInput(tone.name);
    setToneInstructionInput(tone.instruction);
    setToneEnabledInput(tone.enabled);
    setIsToneModalOpen(true);
  };

  const handleSaveToneModal = (e: React.FormEvent) => {
    e.preventDefault();
    const words = toneInstructionInput.trim().split(/\s+/).filter(Boolean).length;
    if (!toneNameInput.trim() || !toneInstructionInput.trim() || words > 250) return;

    if (editingToneId) {
      const updated = customTones.map((t) =>
        t.id === editingToneId
          ? {
              ...t,
              name: toneNameInput.trim(),
              instruction: toneInstructionInput.trim(),
              enabled: toneEnabledInput,
            }
          : t
      );
      saveCustomTones(updated);
    } else {
      const newTone: CustomToneItem = {
        id: `tone-${Date.now()}`,
        name: toneNameInput.trim(),
        instruction: toneInstructionInput.trim(),
        enabled: toneEnabledInput,
        isDefault: false,
      };
      saveCustomTones([...customTones, newTone]);
    }

    setIsToneModalOpen(false);
  };

  const handleDeleteTone = (id: string) => {
    const updated = customTones.filter((t) => t.id !== id);
    saveCustomTones(updated);
  };

  const handleToggleTone = (id: string) => {
    const updated = customTones.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t));
    saveCustomTones(updated);
  };

  const handleSetDefaultTone = (toneName: string) => {
    const lower = toneName.toLowerCase();
    handleUpdatePreference('default_tone', lower);
    try {
      localStorage.setItem('app_default_tone', lower);
    } catch {}
    const updated = customTones.map((t) => ({
      ...t,
      isDefault: t.name.toLowerCase() === lower,
    }));
    saveCustomTones(updated);
  };

  const handleLogout = () => authService.logout().then(() => navigate('/login'));

  return (
    <div className="w-full h-screen flex flex-col bg-white dark:bg-surface-darkCard overflow-hidden">
      {/* Top Header - No Search bar on Settings */}
      <Header
        user={user}
        showSearch={false}
        onLogout={handleLogout}
        title="Email.ai"
      />

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar
          user={user}
          activePage="settings"
          unreadCount={unreadCount}
          onOpenCompose={() => setIsComposeOpen(true)}
          onLogout={handleLogout}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-white dark:bg-surface-darkCard">
          <div className="max-w-3xl mx-auto px-8 py-8 animate-fade-in">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Preferences & AI Engine</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Configure LLM providers, active models, and custom tone instructions.</p>
              </div>
              {saveSuccessMsg && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-3.5 py-1.5 rounded-full animate-fade-in flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  {saveSuccessMsg}
                </span>
              )}
            </div>

            {loading ? (
              <SettingsSkeleton />
            ) : (
              <div className="space-y-6">
                {/* Google Account */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xs border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
                    <h2 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Authorized Google Account</h2>
                    <span className="text-xs bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 rounded-full font-bold">
                      Connected OAuth
                    </span>
                  </div>
                  <div className="p-6 flex items-center justify-between">
                    <div className="flex items-center gap-3.5">
                      {user?.picture
                        ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-11 h-11 rounded-full ring-2 ring-indigo-500/20" />
                        : <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-base">{user?.name.charAt(0)}</div>
                      }
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white text-sm">{user?.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600 dark:hover:bg-rose-950/40 font-semibold py-2 px-4 rounded-xl active:scale-95 transition-all duration-150 ease-out shadow-xs text-xs"
                    >
                      Disconnect & Logout
                    </button>
                  </div>
                </div>

                {/* AI Provider & Models */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xs border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
                    <h2 className="font-bold text-slate-800 dark:text-slate-200 text-sm">AI Engine Provider</h2>
                    <span className="text-xs bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 px-3 py-0.5 rounded-full font-bold">
                      Active: {prefs.active_provider.toUpperCase()}
                    </span>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Provider Selection */}
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 block">
                        Choose Active Inference Provider
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Ollama Option */}
                        <div
                          onClick={() => handleUpdatePreference('active_provider', 'ollama')}
                          className={`p-4 rounded-2xl border-2 cursor-pointer transition-all duration-150 ease-out active:scale-[0.98] ${
                            prefs.active_provider === 'ollama'
                              ? 'border-indigo-600 bg-indigo-50/30 dark:bg-indigo-950/30 shadow-sm shadow-indigo-500/10'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 mb-1.5">
                            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                              </svg>
                            </div>
                            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">Ollama (Local LLM)</h3>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            Run open-source models completely offline with zero data leaving your machine.
                          </p>
                        </div>

                        {/* Gemini Option - Disabled if no API key set */}
                        <div
                          onClick={() => {
                            if (!hasGeminiKey) return;
                            handleUpdatePreference('active_provider', 'gemini');
                          }}
                          className={`p-4 rounded-2xl border-2 transition-all duration-150 ease-out relative ${
                            !hasGeminiKey
                              ? 'opacity-60 cursor-not-allowed border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30'
                              : prefs.active_provider === 'gemini'
                              ? 'border-indigo-600 bg-indigo-50/30 dark:bg-indigo-950/30 shadow-sm shadow-indigo-500/10 cursor-pointer active:scale-[0.98]'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer active:scale-[0.98]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                                </svg>
                              </div>
                              <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">Google Gemini (Cloud)</h3>
                            </div>
                            {!hasGeminiKey && (
                              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <AlertCircle className="w-2.5 h-2.5" />
                                Key Required
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            Ultra-fast cloud inference with Google's Gemini Flash & Pro API.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Ollama Default Model Selection */}
                    <div className="border-t border-slate-100 dark:border-slate-800/80 pt-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Default Ollama Model</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Primary local model used for drafting and copilot</p>
                        </div>
                        <select
                          value={prefs.ollama_model}
                          onChange={e => handleUpdatePreference('ollama_model', e.target.value)}
                          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          {ollamaModels.map(m => (
                            <option key={m.name} value={m.name}>{m.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          Host: <code className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md text-slate-700 dark:text-slate-300">http://localhost:11434</code>
                        </div>
                        <button
                          onClick={handleTestOllama}
                          disabled={isTesting}
                          className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold py-1.5 px-3.5 rounded-xl text-xs active:scale-95 transition-all duration-150 ease-out shadow-xs"
                        >
                          {isTesting ? 'Testing...' : 'Test Connection'}
                        </button>
                      </div>

                      {testStatus && (
                        <p className={`text-xs p-3 rounded-xl font-medium ${testStatus.includes('successfully') ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'}`}>
                          {testStatus}
                        </p>
                      )}
                    </div>

                    {/* Gemini Section & API Key */}
                    <div className="border-t border-slate-100 dark:border-slate-800/80 pt-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Default Gemini Model</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Preferred cloud model tier</p>
                        </div>
                        <select
                          value={prefs.gemini_model}
                          onChange={e => handleUpdatePreference('gemini_model', e.target.value)}
                          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          {geminiModels.map(m => (
                            <option key={m.name} value={m.name}>{m.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="bg-slate-50/50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Key className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                              Gemini API Key
                            </label>
                          </div>
                          {hasGeminiKey ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                              <Check className="w-3 h-3" />
                              Configured ({maskedGeminiKey})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                              <AlertCircle className="w-3 h-3" />
                              Not Configured
                            </span>
                          )}
                        </div>

                        <form onSubmit={handleSaveGeminiKey} className="space-y-2.5">
                          <div className="relative flex items-center">
                            <input
                              type={showKeyText ? "text" : "password"}
                              placeholder={maskedGeminiKey ? "Enter new API key to replace current key..." : "Paste your Gemini API key (AQ... or AIzaSy...)"}
                              value={inputGeminiKey}
                              onChange={e => setInputGeminiKey(e.target.value)}
                              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl pl-3.5 pr-10 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => setShowKeyText(!showKeyText)}
                              className="absolute right-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                              title={showKeyText ? "Hide key" : "Show key"}
                            >
                              {showKeyText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="submit"
                              disabled={!inputGeminiKey.trim() || isSavingKey}
                              className="btn-charcoal px-4 py-1.5 rounded-xl text-xs font-bold active:scale-95 transition-all shadow-xs disabled:opacity-50"
                            >
                              {isSavingKey ? 'Saving...' : 'Save Key'}
                            </button>

                            <button
                              type="button"
                              onClick={handleTestGeminiKey}
                              disabled={isTestingGemini || (!hasGeminiKey && !inputGeminiKey.trim())}
                              className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold py-1.5 px-3.5 rounded-xl text-xs active:scale-95 transition-all shadow-xs disabled:opacity-50"
                            >
                              {isTestingGemini ? 'Testing...' : 'Test Connection'}
                            </button>

                            {hasGeminiKey && (
                              <button
                                type="button"
                                onClick={handleDeleteGeminiKey}
                                disabled={isDeletingKey}
                                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                {isDeletingKey ? 'Removing...' : 'Remove Key'}
                              </button>
                            )}
                          </div>
                        </form>

                        {geminiTestStatus && (
                          <p className={`text-xs p-3 rounded-xl font-medium ${geminiTestStatus.includes('Verified') ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'}`}>
                            {geminiTestStatus}
                          </p>
                        )}

                        <div className="pt-1 flex items-center justify-between text-[11px] text-slate-400">
                          <span>Keys are stored securely in your database & server configuration.</span>
                          <a
                            href="https://aistudio.google.com/app/apikey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                          >
                            Get API Key <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Enhanced Custom Tones Management */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xs border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-slate-800 dark:text-slate-200 text-sm">Custom Tone Presets</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Define distinct instructions. Enabled tones appear in all compose and reply menus.
                      </p>
                    </div>
                    <button
                      onClick={handleOpenAddToneModal}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-purple hover:bg-purple-700 text-white text-xs font-semibold transition-all active:scale-95 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Custom Tone</span>
                    </button>
                  </div>

                  <div className="p-6 space-y-4">
                    {/* Default Tone selector */}
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">
                        Default Tone Preset
                      </label>
                      <select
                        value={prefs.default_tone}
                        onChange={e => handleSetDefaultTone(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="professional">Professional (Standard Business)</option>
                        <option value="friendly">Friendly (Warm & Cordial)</option>
                        <option value="concise">Concise (Direct & Brief)</option>
                        <option value="formal">Formal (Structured Corporate)</option>
                        <option value="urgent">Urgent (Action-oriented & Prompt)</option>
                        {customTones.filter(t => t.enabled).map(t => (
                          <option key={t.id} value={t.name.toLowerCase()}>Custom: {t.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Tone Cards List */}
                    <div className="pt-2 space-y-3">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Configured Custom Tones ({customTones.length})
                      </div>

                      {customTones.map((tone) => {
                        const isCurrentDefault = prefs.default_tone.toLowerCase() === tone.name.toLowerCase();
                        return (
                          <div
                            key={tone.id}
                            className={`p-4 rounded-2xl border transition-all ${
                              tone.enabled
                                ? 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80 shadow-xs'
                                : 'bg-slate-50/60 dark:bg-slate-900/40 border-slate-200/50 dark:border-slate-800/50 opacity-60'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                    {tone.name}
                                  </span>
                                  {isCurrentDefault && (
                                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                      <Star className="w-2.5 h-2.5 fill-amber-400" />
                                      Default Preset
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-sans line-clamp-2" title={tone.instruction}>
                                  "{tone.instruction}"
                                </p>
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                                {/* Set as default */}
                                {!isCurrentDefault && (
                                  <button
                                    onClick={() => handleSetDefaultTone(tone.name)}
                                    title="Set as Default Tone"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                  >
                                    <Star className="w-4 h-4" />
                                  </button>
                                )}

                                {/* Enable / Disable Toggle */}
                                <button
                                  onClick={() => handleToggleTone(tone.id)}
                                  className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 ${
                                    tone.enabled ? 'bg-brand-purple' : 'bg-slate-300 dark:bg-slate-700'
                                  }`}
                                  title={tone.enabled ? 'Enabled in dropdowns' : 'Disabled'}
                                >
                                  <div
                                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                                      tone.enabled ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                  />
                                </button>

                                {/* Edit Button */}
                                <button
                                  onClick={() => handleOpenEditToneModal(tone)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                  title="Edit instructions"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>

                                {/* Delete Button */}
                                <button
                                  onClick={() => handleDeleteTone(tone.id)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                  title="Delete tone"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modal for Creating or Editing Custom Tone */}
      {isToneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-surface-darkCard rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                {editingToneId ? 'Edit Custom Tone' : 'Add New Custom Tone'}
              </h3>
              <button
                onClick={() => setIsToneModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveToneModal} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Tone Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Technical Lead, Friendly Closer, Direct Founder"
                  value={toneNameInput}
                  onChange={(e) => setToneNameInput(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-brand-purple"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Tone Instructions
                  </label>
                  <span
                    className={`text-[11px] font-mono ${
                      toneInstructionInput.trim().split(/\s+/).filter(Boolean).length > 250
                        ? 'text-rose-500 font-bold'
                        : 'text-slate-400'
                    }`}
                  >
                    {toneInstructionInput.trim().split(/\s+/).filter(Boolean).length} / 250 words
                  </span>
                </div>
                <textarea
                  required
                  rows={4}
                  placeholder="e.g. Write from an engineering perspective, concise with trade-offs, clear timeline, and direct questions."
                  value={toneInstructionInput}
                  onChange={(e) => setToneInstructionInput(e.target.value)}
                  className={`w-full bg-slate-50 dark:bg-slate-800 border rounded-xl p-3 text-xs leading-relaxed outline-none focus:ring-2 resize-none ${
                    toneInstructionInput.trim().split(/\s+/).filter(Boolean).length > 250
                      ? 'border-rose-400 focus:ring-rose-400'
                      : 'border-slate-200 dark:border-slate-700 focus:ring-brand-purple'
                  }`}
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Show in Tone Dropdowns
                </label>
                <input
                  type="checkbox"
                  checked={toneEnabledInput}
                  onChange={(e) => setToneEnabledInput(e.target.checked)}
                  className="w-4 h-4 accent-brand-purple rounded cursor-pointer"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsToneModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={toneInstructionInput.trim().split(/\s+/).filter(Boolean).length > 250}
                  className="btn-charcoal px-5 py-2 rounded-xl text-xs font-semibold disabled:opacity-40"
                >
                  Save Tone
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ComposeModal isOpen={isComposeOpen} onClose={() => setIsComposeOpen(false)} />
    </div>
  );
};

export default Settings;
