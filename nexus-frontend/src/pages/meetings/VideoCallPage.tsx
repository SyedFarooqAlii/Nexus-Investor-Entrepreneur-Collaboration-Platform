import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Users, Loader, AlertCircle, MessageCircle, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { ChatMessage } from '../../components/chat/ChatMessage';
import { Input } from '../../components/ui/Input';
import { Message } from '../../types';
import api from '../../services/api';
import toast from 'react-hot-toast';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://nexus-platefrom-production.up.railway.app';

export const VideoCallPage: React.FC = () => {
  const { meetingId } = useParams<{ meetingId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isError, setIsError] = useState<string | null>(null);
  const [participantCount, setParticipantCount] = useState(1);
  const [isCallConnected, setIsCallConnected] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatPartnerId, setChatPartnerId] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const hasJoinedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  const socket = useMemo(() => {
    const token = localStorage.getItem('business_nexus_token');
    return io(SOCKET_URL, {
      auth: { token },
      reconnection: true,
      transports: ['websocket'], // Force WebSocket only
    });
  }, []);

  useEffect(() => {
    socketRef.current = socket;
    
    // Use 'once' to ensure it only runs once upon connection
    socket.once('connect', () => {
        console.log(`[DEBUG] Socket connected with ID: ${socket.id}`);
        if (localStream && !hasJoinedRef.current) {
          console.log(`[DEBUG] Attempting join-room (on connect). MeetingID: ${meetingId}`);
          socket.emit('join-room', meetingId);
          hasJoinedRef.current = true;
          console.log(`[DEBUG] join-room emitted successfully (on connect).`);
        }
    });

    socket.on('connect_error', (err) => {
        console.error(`[ERROR] Socket connection error: ${err.message}`);
        setIsError('Failed to connect to signaling server.');
    });
    
    return () => {
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    if (!meetingId || !user) return;

    // Fetch meeting details to find chat partner
    const fetchMeeting = async () => {
      try {
        const res = await api.get(`/meetings/${meetingId}`);
        const partner = res.data.organizer._id === user?.id ? res.data.participant._id : res.data.organizer._id;
        setChatPartnerId(partner);

        // Fetch messages
        const msgRes = await api.get(`/messages/${partner}`);
        setMessages(msgRes.data);
      } catch (error) {
        console.error('Error fetching chat data', error);
      }
    };
    fetchMeeting();

    // 2. Initialize Media
    const startLocalStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Error accessing media devices:', err);
        setIsError('Could not access camera or microphone. Please check permissions.');
      }
    };

    startLocalStream();
    
    return () => {
      cleanup();
    };
  }, [meetingId, user]);

  // 3. Socket Listeners
  useEffect(() => {
    if (!socketRef.current) return;

    socketRef.current.on('user-joined', async ({ userId, socketId }) => {
      console.log(`[DEBUG] user-joined received! User: ${userId}, Socket: ${socketId}`);
      setParticipantCount(2);
      toast.success('Another participant joined the call');
      
      createPeerConnection(socketId);
      const offer = await peerConnectionRef.current?.createOffer();
      await peerConnectionRef.current?.setLocalDescription(offer);
      socketRef.current?.emit('offer', { roomId: meetingId, offer });
    });

    socketRef.current.on('offer', async ({ offer, from }) => {
      console.log('[DEBUG] Offer received from:', from);
      createPeerConnection(from);
      
      const pc = peerConnectionRef.current;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        
        if (pc.signalingState !== 'stable') {
            await pc.setLocalDescription(answer);
            socketRef.current?.emit('answer', { roomId: meetingId, answer });
        }
      } catch (e) {
        console.error('[ERROR] Failed to handle offer:', e);
      }
    });

    socketRef.current.on('answer', async ({ answer }) => {
      const pc = peerConnectionRef.current;
      if (pc && pc.signalingState === 'have-local-offer') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (e) {
          console.error('[ERROR] Failed to set remote answer:', e);
        }
      }
    });

    socketRef.current.on('ice-candidate', async ({ candidate }) => {
      if (candidate) {
        await peerConnectionRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    socketRef.current.on('receive-message', (message: Message) => {
      setMessages((prev) => [...prev, message]);
    });

    socketRef.current.on('room-update', ({ count }) => {
      setParticipantCount(count);
    });

    socketRef.current.on('room-error', ({ message }) => {
      setIsError(message);
    });

    return () => {
        socketRef.current?.off('user-joined');
        socketRef.current?.off('offer');
        socketRef.current?.off('answer');
        socketRef.current?.off('ice-candidate');
        socketRef.current?.off('receive-message');
        socketRef.current?.off('room-update');
        socketRef.current?.off('room-error');
    };
  }, [socketRef.current, meetingId]);

  const createPeerConnection = (otherSocketId: string) => {
    const pc = new RTCPeerConnection(iceServers);
    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('ice-candidate', {
          roomId: meetingId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    if (localStream) {
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }

    return pc;
  };

  const cleanup = () => {
    localStream?.getTracks().forEach((track) => track.stop());
    peerConnectionRef.current?.close();
    socketRef.current?.disconnect();
  };

  const handleEndCall = () => {
    cleanup();
    navigate('/meetings');
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !socketRef.current || !chatPartnerId) return;
    
    socketRef.current.emit('send-message', { receiverId: chatPartnerId, content: newMessage });
    setNewMessage('');
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioMuted(!audioTrack.enabled);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOff(!videoTrack.enabled);
    }
  };

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6">
        <AlertCircle size={64} className="text-red-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Call Error</h2>
        <p className="text-gray-400 mb-8 text-center max-w-md">{isError}</p>
        <Button onClick={() => navigate('/meetings')}>Return to Meetings</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 overflow-hidden">
      <div className="bg-gray-900 border-b border-gray-800 p-4 flex justify-between items-center text-white">
        <div className="flex items-center space-x-4">
          <h1 className="text-lg font-semibold truncate max-w-[200px]">Video Call</h1>
          <div className="flex items-center space-x-2 bg-gray-800 px-3 py-1 rounded-full text-sm">
            <Users size={16} className="text-primary-400" />
            <span>{participantCount} / 2 Participants</span>
          </div>
        </div>
      </div>

      <div className="flex-1 relative flex items-center justify-center p-4 gap-4">
        <div className="relative w-full h-full rounded-2xl overflow-hidden bg-gray-900 border border-gray-800 flex items-center justify-center">
          {isCallConnected || remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center">
              <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center mb-4">
                <Loader className="animate-spin text-primary-500" size={40} />
              </div>
              <p className="text-gray-400">Waiting for participant to join...</p>
            </div>
          )}
        </div>

        {/* Chat Drawer */}
        {isChatOpen && (
            <div className="absolute top-0 right-0 h-full w-80 bg-white shadow-2xl z-20 flex flex-col border-l border-gray-200">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h3 className="font-semibold text-gray-800">Chat</h3>
                    <button onClick={() => setIsChatOpen(false)}><X size={20} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {messages.map(message => (
                    <ChatMessage key={(message as any)._id || message.id} message={message} isOwn={message.senderId === user?.id} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <form onSubmit={handleSendMessage} className="p-3 border-t">
                    <Input 
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                    />
                </form>
            </div>
        )}

        <div className="absolute top-8 right-8 w-48 sm:w-64 aspect-video rounded-xl overflow-hidden bg-gray-800 border-2 border-primary-500 shadow-2xl z-10">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
          />
        </div>
      </div>

      <div className="bg-gray-900 p-6 flex justify-center items-center space-x-6">
        <button onClick={toggleAudio} className={`p-4 rounded-full ${isAudioMuted ? 'bg-red-500' : 'bg-gray-700'}`}>
          {isAudioMuted ? <MicOff className="text-white" /> : <Mic className="text-white" />}
        </button>
        <button onClick={toggleVideo} className={`p-4 rounded-full ${isVideoOff ? 'bg-red-500' : 'bg-gray-700'}`}>
          {isVideoOff ? <VideoOff className="text-white" /> : <Video className="text-white" />}
        </button>
        <button onClick={() => setIsChatOpen(!isChatOpen)} className={`p-4 rounded-full ${isChatOpen ? 'bg-primary-600' : 'bg-gray-700'}`}>
          <MessageCircle className="text-white" />
        </button>
        <button onClick={handleEndCall} className="p-4 rounded-full bg-red-600 hover:bg-red-700">
          <PhoneOff className="text-white" />
        </button>
      </div>
    </div>
  );
};
