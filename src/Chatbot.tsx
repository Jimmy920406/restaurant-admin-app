// src/Chatbot.tsx
import { useState, useImperativeHandle, forwardRef, type FormEvent, useEffect, useRef } from 'react';
import { supabase, callEdgeFunctionBlob } from './supabaseClient';
import { type ChatbotHandle } from './MenuDashboard';

interface Message {
  sender: 'user' | 'ai';
  text: string;
}

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
let recognition: SpeechRecognition | null = null;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.lang = 'zh-TW';
  recognition.interimResults = false;
}

const Chatbot = forwardRef<ChatbotHandle>((_props, ref) => {
  const [messages, setMessages] = useState<Message[]>([
    { sender: 'ai', text: '你好！我是你的 AI 助理，請問有什麼問題嗎？' }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // --- 新增：播放控制 ---
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speakingMessageIndex, setSpeakingMessageIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- 改寫 speakText：用 Edge Function 播放 MP3 ---
  const speakText = async (text: string, index: number) => {
    try {
      setIsSpeaking(true);
      setIsPaused(false);
      setSpeakingMessageIndex(index);

      // 1. 拿到 MP3 Blob
      const blob = await callEdgeFunctionBlob('text-to-speech', { text });

      // 2. 建立 audio 播放
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      // 3. 綁定事件
      audio.onended = () => {
        setIsSpeaking(false);
        setIsPaused(false);
        setSpeakingMessageIndex(null);
        URL.revokeObjectURL(url);
      };

      // 4. 播放
      await audio.play();
    } catch (err) {
      console.error('播放語音時發生錯誤:', err);
      setIsSpeaking(false);
      setSpeakingMessageIndex(null);
    }
  };

  // --- 保留暫停/繼續 ---
  const handlePauseResume = () => {
    if (!audioRef.current) return;
    if (isPaused) {
      audioRef.current.play();
      setIsPaused(false);
    } else {
      audioRef.current.pause();
      setIsPaused(true);
    }
  };

  const processAIResponse = async (query: string) => {
    setIsLoading(true);
    let currentMessages = messages;
    const userMessage: Message = { sender: 'user', text: query };
    currentMessages = [...currentMessages, userMessage];
    setMessages(currentMessages);
    
    try {
      const fixedPrompt = `你是一位專業的產品客服...`;
      const { data: chatData, error: chatError } = await supabase.functions.invoke('chatbot-openai', {
        body: { query, customPrompt: fixedPrompt },
      });
      if (chatError) throw chatError;

      const aiText = chatData.response;
      const aiMessage: Message = { sender: 'ai', text: aiText };
      setMessages([...currentMessages, aiMessage]);
      
      // 播放語音
      speakText(aiText.split('--- [DEBUG')[0].trim(), currentMessages.length);

    } catch (error) {
      console.error('處理 AI 回應時發生錯誤:', error);
      const errorMessage: Message = { sender: 'ai', text: '抱歉，發生了一點問題，請稍後再試。' };
      setMessages(currentMessages => [...currentMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  
  useImperativeHandle(ref, () => ({
    submitQuery: (query: string) => {
      const userMessage: Message = { sender: 'user', text: query };
      setMessages(currentMessages => [...currentMessages, userMessage]);
      processAIResponse(query);
    }
  }));

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || isLoading) return;
    processAIResponse(userInput);
    setUserInput('');
  };
  
  const handleMicClick = () => { 
    if (!recognition) return alert("抱歉，您的瀏覽器不支援語音輸入。"); 
    if (isRecording) { recognition.stop(); } else { recognition.start(); } 
  };

  useEffect(() => { 
    if (!recognition) return; 
    recognition.onstart = () => setIsRecording(true); 
    recognition.onend = () => setIsRecording(false); 
    recognition.onresult = (event) => { setUserInput(event.results[0][0].transcript); }; 
    recognition.onerror = (event) => { console.error('語音辨識錯誤:', event.error); setIsRecording(false); }; 
  }, []);

  return (
    <div className="p-6 bg-white rounded-lg shadow-md max-w-2xl mx-auto h-full flex flex-col">
      <h2 className="text-2xl font-semibold mb-4 text-center">AI Chatbot</h2>
      <div className="flex-1 h-96 overflow-y-auto mb-4 p-4 border rounded-md bg-gray-50 flex flex-col gap-4">
        {messages.map((msg, index) => (
          <div key={index} className={`flex items-center gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.sender === 'ai' && (
              <div className="flex items-center gap-1">
                <button onClick={() => speakText(msg.text, index)} className="p-1 text-gray-400 hover:text-blue-600" title="重播聲音">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.828 2.828a1 1 0 011.414 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.414-1.414A3.986 3.986 0 0013 10a3.986 3.986 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
                {isSpeaking && speakingMessageIndex === index && (
                  <button onClick={handlePauseResume} className="p-1 text-gray-400 hover:text-blue-600" title={isPaused ? "繼續" : "暫停"}>
                    {isPaused ? 
                      (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>) : 
                      (<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v4a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>)
                    }
                  </button>
                )}
              </div>
            )}
            <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${msg.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>{msg.text}</div>
          </div>
        ))}
        {isLoading && <div className="flex justify-start"><div className="px-4 py-2 rounded-lg bg-gray-200">正在思考中...</div></div>}
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
