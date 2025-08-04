// src/Chatbot.tsx
import { useState, useImperativeHandle, forwardRef, type FormEvent } from 'react' // 1. 引入 useImperativeHandle 和 forwardRef
import { supabase } from './supabaseClient'
import { type ChatbotHandle } from './Dashboard' // 2. 引入我們在 Dashboard 定義的 Handle

interface Message {
  sender: 'user' | 'ai';
  text: string;
}

// 3. 使用 forwardRef 來包裝我們的元件
const Chatbot = forwardRef<ChatbotHandle>((_props, ref) => {
  const [messages, setMessages] = useState<Message[]>([
    { sender: 'ai', text: '你好！我是你的 AI 助理，請問有關產品的任何問題嗎？' }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 4. 定義一個可以被外部呼叫的函式
  const submitQuery = async (query: string) => {
    if (!query.trim() || isLoading) return;

    const userMessage: Message = { sender: 'user', text: query };
    setMessages(currentMessages => [...currentMessages, userMessage]);
    setIsLoading(true);

    const fixedPrompt = `你是一位專業的產品客服...`; // 你的固定 Prompt

    try {
      const { data, error } = await supabase.functions.invoke('chatbot-openai', {
        body: { query, customPrompt: fixedPrompt },
      })
      if (error) throw error;
      const aiMessage: Message = { sender: 'ai', text: data.response };
      setMessages(currentMessages => [...currentMessages, aiMessage]);
    } catch (error) {
      console.error('呼叫 Edge Function 時發生錯誤:', error);
      const errorMessage: Message = { sender: 'ai', text: '抱歉，發生了一點問題...' };
      setMessages(currentMessages => [...currentMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // 5. 將內部函式暴露給外部的 ref
  useImperativeHandle(ref, () => ({
    submitQuery,
  }));

  // 處理手動輸入的表單提交
  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitQuery(userInput);
    setUserInput('');
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md max-w-2xl mx-auto h-full flex flex-col">
      <h2 className="text-2xl font-semibold mb-4 text-center">AI Chatbot</h2>
      <div className="flex-1 h-96 overflow-y-auto mb-4 p-4 border rounded-md bg-gray-50 flex flex-col gap-4">
        {messages.map((msg, index) => (
          <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${msg.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && <div className="flex justify-start"><div className="px-4 py-2 rounded-lg bg-gray-200 text-gray-800">正在思考中...</div></div>}
      </div>
      <form onSubmit={handleFormSubmit}>
        <div className="flex gap-2">
          <input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder="在這裡輸入你的問題..." className="flex-1 p-3 border rounded-md"/>
          <button type="submit" disabled={isLoading} className="p-3 font-bold text-white bg-green-600 rounded-md disabled:bg-gray-400">傳送</button>
        </div>
      </form>
    </div>
  )
});

export default Chatbot;