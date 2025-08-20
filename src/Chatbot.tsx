// src/Chatbot.tsx (整合四項 UI/UX 優化)

import { useState, useImperativeHandle, forwardRef, type FormEvent, useEffect, useRef } from 'react';
import { supabase, callEdgeFunctionBlob } from './supabaseClient';
import { type ChatbotHandle } from './MenuDashboard';

interface Message {
  id: number;
  sender: 'user' | 'ai';
  text: string;
  audioState?: 'loading' | 'ready' | 'error';
  audioUrl?: string;
}

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
let recognition: SpeechRecognition | null = null;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.lang = 'zh-TW';
  recognition.interimResults = false;
}

// --- 新增：打字速度 (毫秒/字) ---
const TYPING_SPEED_MS = 50;

const Chatbot = forwardRef<ChatbotHandle>((_props, ref) => {
  const [messages, setMessages] = useState<Message[]>([
    { id: Date.now(), sender: 'ai', text: '你好！我是你的 AI 助理，請問有什麼問題嗎？' }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    audioRef.current = new Audio();
  }, []);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    const handleAudioEnd = () => {
      setIsSpeaking(false);
      setSpeakingMessageId(null);
      setIsPaused(false);
    };
    const handleAudioPlay = () => setIsPaused(false);
    const handleAudioPause = () => setIsPaused(true);

    audioElement.addEventListener('ended', handleAudioEnd);
    audioElement.addEventListener('play', handleAudioPlay);
    audioElement.addEventListener('pause', handleAudioPause);

    return () => {
      audioElement.removeEventListener('ended', handleAudioEnd);
      audioElement.removeEventListener('play', handleAudioPlay);
      audioElement.removeEventListener('pause', handleAudioPause);
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
      }
    };
  }, []);

  const generateAudioInBackground = async (messageId: number, text: string) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, audioState: 'loading' } : m));
    try {
      const blob = await callEdgeFunctionBlob('text-to-speech', { text });
      const url = URL.createObjectURL(blob);
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, audioState: 'ready', audioUrl: url } : m));
    } catch (err) {
      console.error('音訊生成時發生錯誤:', err);
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, audioState: 'error' } : m));
    }
  };

  const playAudio = (messageId: number, audioUrl: string) => {
    if (!audioRef.current) return;
    if (speakingMessageId !== messageId || !audioRef.current.src) {
      audioRef.current.src = audioUrl;
    }
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(e => console.error("音訊播放失敗:", e));
    setIsSpeaking(true);
    setSpeakingMessageId(messageId);
  };

  const handlePauseResume = () => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(e => console.error("音訊繼續播放失敗:", e));
    } else {
      audioRef.current.pause();
    }
  };
  
  const handleReplay = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(e => console.error("音訊重播失敗:", e));
    }
  };

  // --- 新增：逐字打印函式 ---
  const typeOutText = (messageId: number, fullText: string) => {
    if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
    }
    
    let charIndex = 0;
    typingIntervalRef.current = setInterval(() => {
        if (charIndex < fullText.length) {
            charIndex++;
            setMessages(prev => prev.map(m => 
                m.id === messageId ? { ...m, text: fullText.substring(0, charIndex) } : m
            ));
        } else {
            if (typingIntervalRef.current) {
                clearInterval(typingIntervalRef.current);
            }
        }
    }, TYPING_SPEED_MS);
  }

  const processStreamedResponse = async (query: string) => {
    setIsLoading(true);
    if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    
    const userMessage: Message = { id: Date.now(), sender: 'user', text: query };
    const aiMessagePlaceholder: Message = { id: Date.now() + 1, sender: 'ai', text: '', audioState: 'loading' };
    setMessages(prev => [...prev, userMessage, aiMessagePlaceholder]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chatbot-openai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ query }),
      });
      if (!response.ok || !response.body) throw new Error(`伺服器錯誤: ${response.statusText}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      // --- 核心修改：先完整接收串流文字，不立即顯示 ---
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulatedText += decoder.decode(value, { stream: true });
      }
      
      if (accumulatedText.trim()) {
        const finalText = accumulatedText.trim();
        // --- 核心修改：接收完畢後，才同時開始「背景轉音訊」和「前景逐字打印」 ---
        generateAudioInBackground(aiMessagePlaceholder.id, finalText);
        typeOutText(aiMessagePlaceholder.id, finalText);
      } else {
        setMessages(prev => prev.map(m => m.id === aiMessagePlaceholder.id ? { ...m, audioState: 'error', text: '抱歉，無法取得回應。' } : m));
      }
    } catch (error) {
      console.error("串流處理時發生錯誤:", error);
      setMessages(prev => prev.map(m => m.id === aiMessagePlaceholder.id ? { ...m, audioState: 'error', text: `發生錯誤: ${error instanceof Error ? error.message : String(error)}` } : m));
    } finally {
      setIsLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({ submitQuery: (query: string) => { processStreamedResponse(query); } }));
  const handleFormSubmit = (e: FormEvent) => { e.preventDefault(); if (!userInput.trim() || isLoading) return; processStreamedResponse(userInput); setUserInput(''); };
  const handleMicClick = () => { if (!recognition) return alert("抱歉，您的瀏覽器不支援語音輸入。"); if (isRecording) { recognition.stop(); } else { recognition.start(); } };
  useEffect(() => { if (!recognition) return; recognition.onstart = () => setIsRecording(true); recognition.onend = () => setIsRecording(false); recognition.onresult = (event) => { setUserInput(event.results[0][0].transcript); }; recognition.onerror = (event) => { console.error('語音辨識錯誤:', event.error); setIsRecording(false); }; }, []);

  return (
    <div className="p-6 bg-white rounded-lg shadow-md max-w-2xl mx-auto h-full flex flex-col">
      {/* --- 新增：輸入中動畫的 CSS Style --- */}
      <style>{`
        .typing-indicator span {
          height: 8px;
          width: 8px;
          background-color: #9E9E9E;
          border-radius: 50%;
          display: inline-block;
          margin: 0 2px;
          animation: bounce 1.4s infinite ease-in-out both;
        }
        .typing-indicator span:nth-of-type(1) { animation-delay: -0.32s; }
        .typing-indicator span:nth-of-type(2) { animation-delay: -0.16s; }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1.0); }
        }
      `}</style>
      <h2 className="text-2xl font-semibold mb-4 text-center">AI Chatbot</h2>
      <div className="flex-1 h-96 overflow-y-auto mb-4 p-4 border rounded-md bg-gray-50 flex flex-col gap-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex items-start gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.sender === 'ai' && (
              <div className="flex-shrink-0 flex items-center h-10">
                {/* --- 修改 3: 更新音訊載入中的顯示 --- */}
                {msg.audioState === 'loading' && <div className="w-2.5 h-2.5 bg-gray-400 rounded-full animate-pulse"></div>}
                
                {msg.audioState === 'ready' && msg.audioUrl && (
                  isSpeaking && speakingMessageId === msg.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={handlePauseResume} className="p-1 text-gray-500 hover:text-blue-600" title={isPaused ? "繼續" : "暫停"}>
                        {isPaused ? 
                          (<svg xmlns="http://www.w.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>) : 
                          (<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v4a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>)
                        }
                      </button>
                      {/* --- 修改 1: 更新重播圖示 --- */}
                      <button onClick={handleReplay} className="p-1 text-gray-500 hover:text-green-600" title="從頭播放">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-6.219-8.56" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 21 21 16.5m0 0V21m0-4.5H16.5" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 1 1 6.219 8.56" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3 3 7.5m0 0V3m0 4.5h4.5" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => playAudio(msg.id, msg.audioUrl!)} className="p-1 text-gray-500 hover:text-blue-600" title="播放聲音">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.828 2.828a1 1 0 011.414 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.414-1.414A3.986 3.986 0 0013 10a3.986 3.986 0 00-1.172-2.828 1 1 0 010-1.414z" /></svg>
                    </button>
                  )
                )}
              </div>
            )}
            <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${msg.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>
              {/* --- 修改 2: 顯示輸入中動畫 --- */}
              {msg.sender === 'ai' && isLoading && msg.text === '' ? (
                  <div className="typing-indicator"><span></span><span></span><span></span></div>
              ) : (
                  msg.text
              )}
            </div>
          </div>
        ))}
        {/* 保留您原始的 loading 提示, 但現在它只在處理使用者輸入時短暫出現 */}
        {isLoading && messages[messages.length-1]?.sender === 'user' && <div className="flex justify-start"><div className="px-4 py-2 rounded-lg bg-gray-200">正在思考中...</div></div>}
      </div>
      <form onSubmit={handleFormSubmit}>
        <div className="flex gap-2">
          <input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder="在這裡輸入你的問題..." className="flex-1 p-3 border rounded-md"/>
          {recognition && (
            <button type="button" onClick={handleMicClick} className={`p-3 rounded-md transition-colors ${isRecording ? 'bg-red-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-14 0m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v2a3 3 0 01-3 3z" /></svg>
            </button>
          )}
          <button type="submit" disabled={isLoading} className="p-3 font-bold text-white bg-green-600 rounded-md disabled:bg-gray-400">傳送</button>
        </div>
      </form>
    </div>
  )
});

export default Chatbot;