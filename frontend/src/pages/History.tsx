import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { responseService, type ResponseHistoryItem } from '../services/responses';

const History: React.FC = () => {
  const [history, setHistory] = useState<ResponseHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    responseService.getHistory()
      .then(setHistory)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center">
          <button onClick={() => navigate('/dashboard')} className="mr-4 text-gray-500 hover:text-gray-900">
            &larr; Back
          </button>
          <h1 className="text-2xl font-semibold text-gray-900">Response History</h1>
        </div>
      </header>
      
      <div className="p-8 flex-1 max-w-5xl mx-auto w-full">
        {loading ? (
          <div className="text-center py-20">Loading history...</div>
        ) : history.length === 0 ? (
          <div className="text-center py-20 text-gray-500 bg-white rounded-xl shadow-sm border border-gray-200">No response history found.</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {history.map(item => (
              <div key={item.id} className="p-5 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-gray-900">{item.sender}</span>
                  <span className="text-sm text-gray-500">{new Date(item.generated_at).toLocaleString()}</span>
                </div>
                <h4 className="text-sm font-semibold text-gray-800 mb-2">{item.subject}</h4>
                <div className="flex items-center mt-3">
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${item.status === 'SENT' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {item.status}
                  </span>
                  {item.sent_at && (
                    <span className="ml-3 text-xs text-gray-500">Sent to {item.sender} on: {new Date(item.sent_at).toLocaleString()}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default History;
