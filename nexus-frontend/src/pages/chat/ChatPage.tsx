import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, Phone, Video, Info, MoreVertical, Search, Loader, MessageCircle, ChevronLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ChatUserList } from '../../components/chat/ChatUserList';
import { ChatMessage } from '../../components/chat/ChatMessage';
import { User, Message } from '../../types';
import api from '../../services/api';
import toast from 'react-hot-toast';
import io, { Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://nexus-platefrom-production.up.railway.app';

export const ChatPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatPartner, setChatPartner] = useState<any>(null);
  const [isLoadingPartner, setIsLoadingPartner] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [refreshKey, setRefreshKey] = useState(0); // Forces sidebar to refresh
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!currentUser) return;
    
    // Initialize Socket
    const token = localStorage.getItem('business_nexus_token');
    const newSocket = io(SOCKET_URL, {
      auth: { token },
    });
    setSocket(newSocket);
    
    return () => {
      newSocket.disconnect();
    };
  }, [currentUser]);

  useEffect(() => {
    if (!socket || !userId) return;

    socket.on('receive-message', (message: Message) => {
      if (message.senderId === userId || message.receiverId === userId) {
        setMessages((prev) => [...prev, message]);
      }
    });

    return () => {
      socket.off('receive-message');
    };
  }, [socket, userId]);

  useEffect(() => {
    if (userId) {
      const fetchPartner = async () => {
        setIsLoadingPartner(true);
        try {
          const response = await api.get(`/profile/${userId}`);
          setChatPartner(response.data);
        } catch (error) {
          toast.error('Could not find user');
        } finally {
          setIsLoadingPartner(false);
        }
      };
      fetchPartner();
      
      // Load messages
      const fetchMessages = async () => {
        try {
          const res = await api.get(`/messages/${userId}`);
          setMessages(res.data);
        } catch (error) {
          console.error('Error fetching messages', error);
        }
      };
      fetchMessages();
    }
  }, [userId]);
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket || !userId) return;
    
    socket.emit('send-message', { receiverId: userId, content: newMessage });
    setNewMessage('');
    setRefreshKey(prev => prev + 1); // Trigger sidebar update
  };
  
  if (!currentUser) return null;
  
  return (
    <div className="h-[calc(100vh-140px)] flex overflow-hidden rounded-lg shadow-sm border border-gray-200 bg-white">
      {/* Sidebar - User List */}
      <div className="w-80 border-r border-gray-200 bg-white hidden lg:block overflow-y-auto">
        <ChatUserList key={refreshKey} activeUserId={userId} />
      </div>
      
      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#e5ddd5] relative">
        {/* Pattern Overlay */}
        <div 
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{ backgroundImage: `url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')` }}
        />

        {userId ? (
          <>
            {/* Chat Header */}
            <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-[#f0f2f5] z-10">
              <div className="flex items-center">
                <button onClick={() => navigate('/chat')} className="lg:hidden mr-2">
                  <ChevronLeft size={24} />
                </button>
                <Avatar
                  src={chatPartner?.avatarUrl}
                  alt={chatPartner?.name || 'User'}
                  size="md"
                  status={chatPartner?.isOnline ? 'online' : 'offline'}
                  className="mr-3 cursor-pointer"
                  onClick={() => navigate(`/profile/${chatPartner?.role}/${userId}`)}
                />
                <div className="min-w-0">
                  <h2 
                    className="text-sm font-semibold text-gray-900 truncate cursor-pointer"
                    onClick={() => navigate(`/profile/${chatPartner?.role}/${userId}`)}
                  >
                    {chatPartner?.name || 'Loading...'}
                  </h2>
                  <p className="text-[11px] text-gray-500">
                    {chatPartner?.isOnline ? 'online' : 'last seen recently'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4 mr-2">
                <Video size={20} className="text-gray-500 cursor-pointer" />
                <Search size={20} className="text-gray-500 cursor-pointer" />
                <MoreVertical size={20} className="text-gray-500 cursor-pointer" />
              </div>
            </div>
            
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 md:px-12 z-10 custom-scrollbar">
              {isLoadingPartner ? (
                <div className="flex justify-center py-10">
                   <Loader className="animate-spin text-primary-600" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex justify-center mt-4">
                  <span className="bg-[#fff9c2] text-[#414344] text-[11px] px-3 py-1 rounded shadow-sm uppercase font-medium">
                    Messages are end-to-end encrypted
                  </span>
                </div>
              ) : (
                messages.map(message => (
                  <ChatMessage 
                    key={(message as any)._id || message.id} 
                    message={message} 
                    isOwn={String(message.senderId) === String(currentUser?.id)} 
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            
            {/* Chat Input Area */}
            <div className="p-3 bg-[#f0f2f5] z-10 flex items-center space-x-2">
               <div className="flex-1 bg-white rounded-lg px-4 py-2 shadow-sm">
                 <form onSubmit={handleSendMessage}>
                  <input
                    className="w-full bg-transparent border-none outline-none text-sm text-gray-700 placeholder-gray-500"
                    placeholder="Type a message"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                  />
                 </form>
               </div>
               <button 
                 onClick={handleSendMessage}
                 disabled={!newMessage.trim()}
                 className={`p-2.5 rounded-full ${!newMessage.trim() ? 'text-gray-400' : 'bg-primary-600 text-white shadow-md'}`}
               >
                 <Send size={20} />
               </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center z-10">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6 shadow-md border-t-4 border-primary-600">
              <MessageCircle size={40} className="text-primary-600" />
            </div>
            <h2 className="text-2xl font-light text-gray-700 mb-2">Nexus Web</h2>
            <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
              Send and receive messages without keeping your phone online.
              Use Nexus on up to 4 linked devices and 1 phone at the same time.
            </p>
            <div className="mt-12 lg:hidden w-full max-w-xs">
               <ChatUserList key={refreshKey} activeUserId={userId} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
