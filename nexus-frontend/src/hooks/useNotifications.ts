import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://nexus-platefrom-production.up.railway.app';

export const useNotifications = () => {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('business_nexus_token');
    const socket = io(SOCKET_URL, {
      auth: { token },
    });

    socket.on('connect', () => {
      console.log('Connected to notification signaling');
    });

    socket.on('new-notification', (notification) => {
      setUnreadCount(prev => prev + 1);
      toast(notification.title, {
        icon: '🔔',
        duration: 4000,
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  return { unreadCount, setUnreadCount };
};
