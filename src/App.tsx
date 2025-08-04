// src/App.tsx
import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { type Session } from '@supabase/supabase-js';
import Auth from './Auth';
import MenuDashboard from './MenuDashboard';
import CustomerDashboard from './CustomerDashboard';

type View = 'menu' | 'customers';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>('menu');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session) });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setSession(session) });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => { await supabase.auth.signOut() };

  if (!session) { return <Auth /> }

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans">
      <header className="bg-white shadow-md p-4 flex justify-between items-center z-10">
        <h1 className="text-2xl font-bold text-gray-800">餐廳後台管理</h1>
        <div className="flex gap-4 items-center">
          <button onClick={() => setView('menu')} className={`p-2 font-semibold rounded-md ${view === 'menu' ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'}`}>菜單管理</button>
          <button onClick={() => setView('customers')} className={`p-2 font-semibold rounded-md ${view === 'customers' ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'}`}>客戶資料</button>
          <button onClick={handleSignOut} className="p-2 bg-red-600 text-white font-semibold rounded-md hover:bg-red-700">登出</button>
        </div>
      </header>
      
      <div className="flex-1 overflow-hidden">
        {view === 'menu' && <MenuDashboard />}
        {view === 'customers' && <CustomerDashboard />}
      </div>
    </div>
  );
}

export default App;