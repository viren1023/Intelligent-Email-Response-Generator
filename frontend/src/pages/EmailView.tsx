import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { emailService, type ThreadResponse } from '../services/email';
import { aiService } from '../services/ai';

const EmailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const threadId = location.state?.threadId;

  const [thread, setThread] = useState<ThreadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [responseId, setResponseId] = useState<number | null>(null);
  const [generatedText, setGeneratedText] = useState('');
  const [customInstruction, setCustomInstruction] = useState('');
  
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

  useEffect(() => {
    if (!id || !threadId) {
      navigate('/dashboard');
      return;
    }
    
    emailService.getThread(id, threadId)
      .then(setThread)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id, threadId, navigate]);

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!id || !threadId) return;
    
    setIsGenerating(true);
    try {
      const data = await aiService.generateReply(id, { thread_id: threadId, custom_instruction: customInstruction || undefined });
      setResponseId(data.response_id);
      setGeneratedText(data.generated_text);
    } catch (err) {
      console.error(err);
      alert('Failed to generate reply. Is Ollama running?');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSend = async () => {
    if (!id || !responseId) return;
    if (!window.confirm('Send this reply?')) return;
    
    setIsSending(true);
    try {
      await aiService.sendReply(id, { response_id: responseId, edited_text: generatedText });
      setIsSent(true);
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch (err) {
      console.error(err);
      alert('Failed to send reply.');
    } finally {
      setIsSending(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading conversation...</div>;
  if (!thread) return <div className="min-h-screen flex items-center justify-center text-red-500">Failed to load conversation</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto flex gap-6 items-start">
        <div className="flex-1">
          <button onClick={() => navigate('/dashboard')} className="mb-6 text-gray-600 hover:text-gray-900 flex items-center font-medium transition-colors">
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Back to Inbox
          </button>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center sticky top-0 z-10 backdrop-blur-sm bg-white/90">
              <h1 className="text-xl font-bold text-gray-900">{thread.messages[0]?.subject || '(No Subject)'}</h1>
              {!generatedText && !isGenerating && (
                <button 
                  onClick={() => handleGenerate()}
                  className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-medium py-2 px-5 rounded-lg shadow-sm transition-all transform hover:scale-105 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  Generate AI Reply
                </button>
              )}
            </div>
            
            <div className="divide-y divide-gray-100">
              {thread.messages.map((msg, idx) => (
                <div key={msg.id} className={`p-6 ${idx === thread.messages.length - 1 ? 'bg-blue-50/30' : ''}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center font-bold text-gray-600 shadow-inner">
                        {msg.from.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{msg.from.split('<')[0].replace(/"/g, '').trim()}</div>
                        <div className="text-xs text-gray-500">To: {msg.to}</div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-500 bg-gray-50 px-3 py-1 rounded-full">
                      {new Date(msg.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  </div>
                  <div className="text-gray-800 whitespace-pre-wrap font-sans text-sm leading-relaxed mt-3">
                    {msg.body || '(No content)'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Sidebar */}
        {(isGenerating || generatedText) && (
          <div className="w-96 flex-shrink-0 sticky top-8">
            <div className="bg-white rounded-xl shadow-lg border border-indigo-100 overflow-hidden flex flex-col h-[calc(100vh-4rem)] max-h-[800px]">
              <div className="p-4 border-b border-indigo-100 bg-indigo-50/50 flex justify-between items-center">
                <h3 className="font-semibold text-indigo-900 flex items-center gap-2">
                  <span className="text-xl">✨</span> AI Assistant
                </h3>
              </div>
              
              <div className="p-5 flex-1 overflow-auto flex flex-col gap-4">
                {isGenerating ? (
                  <div className="flex flex-col items-center justify-center py-20 h-full text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                    <p className="text-indigo-600 font-medium text-lg">Analyzing conversation...</p>
                    <p className="text-gray-500 text-sm mt-2">Drafting the perfect reply</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col flex-1">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Generated Reply</label>
                      <textarea
                        className="flex-1 w-full p-4 border border-gray-200 rounded-lg text-sm font-sans focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none bg-gray-50"
                        value={generatedText}
                        onChange={(e) => setGeneratedText(e.target.value)}
                        placeholder="AI response goes here..."
                      />
                    </div>
                    
                    <form onSubmit={handleGenerate} className="pt-4 border-t border-gray-100">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Refine Response</label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="E.g., Make it shorter..." 
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                          value={customInstruction}
                          onChange={(e) => setCustomInstruction(e.target.value)}
                        />
                        <button type="submit" className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-2 rounded-lg text-sm font-medium transition-colors">
                          Retry
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>
              
              {generatedText && !isGenerating && (
                <div className="p-4 border-t border-gray-100 bg-gray-50">
                  {isSent ? (
                    <div className="bg-green-100 text-green-800 p-3 rounded-lg flex items-center justify-center font-medium">
                      <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      Reply sent successfully!
                    </div>
                  ) : (
                    <button 
                      onClick={handleSend}
                      disabled={isSending}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-lg shadow-sm transition-colors flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {isSending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Sending...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                          Send Reply
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailView;
