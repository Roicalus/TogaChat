import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { db, auth, provider } from './firebase';
import { signInWithPopup, signOut } from "firebase/auth";
import { 
  collection, addDoc, query, orderBy, onSnapshot, 
  serverTimestamp, setDoc, doc, getDocs, where, 
  updateDoc, arrayUnion, arrayRemove, limit, deleteDoc 
} from "firebase/firestore";
import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';
import './App.css';

// --- ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ---

/**
 * SafeAvatar - предотвращает "битые" картинки.
 * Если фото не загрузилось, рисует стильный градиент с инициалом.
 */
const SafeAvatar = ({ src, name, size = "40px", status = "online", className = "" }) => {
  const [error, setError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  
  const initials = useMemo(() => {
    if (!name) return "?";
    const nameParts = name.split(' ').filter(Boolean);
    if (nameParts.length >= 2) {
      return (nameParts[0][0] + nameParts[1][0]).toUpperCase();
    }
    return nameParts[0]?.[0]?.toUpperCase() || "?";
  }, [name]);
  
  const fallbackStyle = {
    width: size,
    height: size,
    minWidth: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--acc), var(--acc-dark))',
    color: 'white',
    fontWeight: 700,
    fontSize: `calc(${size} / 2.5)`,
    userSelect: 'none',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 4px 12px var(--acc-glow)'
  };

  const statusIndicator = useMemo(() => {
    const statusColors = {
      online: '#10b981',
      offline: '#6b7280',
      away: '#f59e0b',
      busy: '#ef4444'
    };
    
    return (
      <div className="status-indicator" 
           style={{ 
             background: statusColors[status] || statusColors.offline,
             border: `2px solid var(--sidebar-bg)`
           }}>
        <div className="status-glow" />
      </div>
    );
  }, [status]);

  if (!src || error) {
    return (
      <div className={`avatar-fallback ${className}`} style={fallbackStyle}>
        {initials}
        {statusIndicator}
      </div>
    );
  }

  return (
    <div className={`safe-avatar-wrapper ${className}`} style={{ position: 'relative' }}>
      <img 
        src={src} 
        alt={name} 
        className="safe-avatar" 
        style={{ 
          width: size, 
          height: size, 
          borderRadius: '50%', 
          objectFit: 'cover',
          opacity: isLoaded ? 1 : 0,
          transition: 'opacity 0.3s ease'
        }}
        onLoad={() => setIsLoaded(true)}
        onError={() => setError(true)} 
      />
      {!isLoaded && (
        <div className="avatar-skeleton" style={{ ...fallbackStyle, position: 'absolute', top: 0, left: 0 }}>
          {initials}
        </div>
      )}
      {statusIndicator}
    </div>
  );
};

/**
 * MessageTime - красивое отображение времени сообщения
 */
const MessageTime = ({ timestamp }) => {
  const formatTime = useCallback((date) => {
    const now = new Date();
    const messageDate = new Date(date);
    
    if (isNaN(messageDate.getTime())) return 'Только что';
    
    const diffMs = now - messageDate;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Только что';
    if (diffMins < 60) return `${diffMins} мин назад`;
    
    return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, []);

  return (
    <time className="message-time" title={timestamp?.toDate()?.toLocaleString()}>
      {formatTime(timestamp?.toDate())}
    </time>
  );
};

// --- ОСНОВНОЙ КОМПОНЕНТ ПРИЛОЖЕНИЯ ---

function App() {
  // Данные пользователя и загрузка
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Списки и чаты
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState({});

  // Интерфейс и формы
  const [newMessage, setNewMessage] = useState("");
  const [searchEmail, setSearchEmail] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [inCall, setInCall] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState(null);

  // Персонализация
  const [accentColor, setAccentColor] = useState(localStorage.getItem('accent') || '#6366f1');
  const [chatBg, setChatBg] = useState(localStorage.getItem('chatBg') || '');
  const [darkMode, setDarkMode] = useState(localStorage.getItem('darkMode') !== 'false');
  const [animationsEnabled, setAnimationsEnabled] = useState(localStorage.getItem('animations') !== 'false');

  const scrollRef = useRef();
  const lastMessageRef = useRef();
  const inputRef = useRef();

  // Применение темы через CSS Variables
  useEffect(() => {
    document.documentElement.style.setProperty('--acc', accentColor);
    localStorage.setItem('accent', accentColor);
    
    if (darkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
    
    if (!animationsEnabled) {
      document.documentElement.classList.add('reduce-motion');
    } else {
      document.documentElement.classList.remove('reduce-motion');
    }
  }, [accentColor, darkMode, animationsEnabled]);

  // Симуляция прогресса загрузки
  useEffect(() => {
    if (loading) {
      const interval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 90) {
            clearInterval(interval);
            return 90;
          }
          return prev + 10;
        });
      }, 100);
      return () => clearInterval(interval);
    } else {
      setLoadingProgress(100);
      setTimeout(() => setLoadingProgress(0), 500);
    }
  }, [loading]);

  // Логика авторизации и подписок
  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(async (u) => {
      if (u) {
        setUser(u);
        const userRef = doc(db, "users", u.uid);
        
        // Синхронизируем данные пользователя
        await setDoc(userRef, {
          uid: u.uid,
          displayName: u.displayName || "Аноним",
          email: u.email.toLowerCase(),
          photoURL: u.photoURL || "",
          lastSeen: serverTimestamp(),
          status: 'online'
        }, { merge: true });

        // Подписка на список друзей
        const unsubFriends = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setFriends(docSnap.data().friends || []);
          }
        });

        // Подписка на заявки в друзья
        const qRequests = query(
          collection(db, "friend_requests"),
          where("to", "==", u.uid),
          where("status", "==", "pending")
        );
        const unsubReqs = onSnapshot(qRequests, (snap) => {
          setFriendRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // Подписка на группы
        const qGroups = query(
          collection(db, "groups"),
          where("members", "array-contains", u.uid)
        );
        const unsubGroups = onSnapshot(qGroups, (snap) => {
          setGroups(snap.docs.map(d => ({ 
            id: d.id, 
            ...d.data(), 
            isGroup: true,
            unread: unreadMessages[d.id] || 0
          })));
        });

        setLoading(false);

        return () => {
          unsubFriends();
          unsubReqs();
          unsubGroups();
        };
      } else {
        setUser(null);
        setLoading(false);
        setActiveChat(null);
      }
    });

    return () => unsubAuth();
  }, []);

  // Логика чата
  useEffect(() => {
    if (!user || !activeChat) return;

    const chatID = activeChat.isGroup 
      ? activeChat.id 
      : (user.uid < activeChat.uid ? `${user.uid}_${activeChat.uid}` : `${activeChat.uid}_${user.uid}`);

    const collectionPath = activeChat.isGroup 
      ? `groups/${chatID}/messages` 
      : `direct_messages/${chatID}/messages`;

    const qMessages = query(
      collection(db, collectionPath),
      orderBy("createdAt", "asc"),
      limit(200)
    );

    const unsubMsgs = onSnapshot(qMessages, (snap) => {
      const newMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(newMessages);
      
      // Сброс непрочитанных для активного чата
      if (activeChat.id || activeChat.uid) {
        setUnreadMessages(prev => ({
          ...prev,
          [activeChat.id || activeChat.uid]: 0
        }));
      }

      // Плавный скролл
      setTimeout(() => {
        if (scrollRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
          const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
          if (isNearBottom || !lastMessageRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }
      }, 50);
    });

    return () => unsubMsgs();
  }, [user, activeChat]);

  // Отправка сообщения
  const sendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !activeChat || !user) return;

    const chatID = activeChat.isGroup 
      ? activeChat.id 
      : (user.uid < activeChat.uid ? `${user.uid}_${activeChat.uid}` : `${activeChat.uid}_${user.uid}`);

    const path = activeChat.isGroup 
      ? `groups/${chatID}/messages` 
      : `direct_messages/${chatID}/messages`;

    const textBuffer = newMessage;
    setNewMessage("");
    inputRef.current?.focus();

    try {
      await addDoc(collection(db, path), {
        text: textBuffer,
        createdAt: serverTimestamp(),
        uid: user.uid,
        senderName: user.displayName,
        senderPhoto: user.photoURL || "",
        edited: false
      });
      
      // Анимация отправки
      const lastMessage = document.querySelector('.message-row:last-child');
      if (lastMessage) {
        lastMessage.classList.add('message-sending');
        setTimeout(() => lastMessage.classList.remove('message-sending'), 500);
      }
    } catch (err) {
      console.error("Ошибка отправки:", err);
      // Восстановить сообщение при ошибке
      setNewMessage(textBuffer);
    }
  };

  // Поиск пользователя
  const handleSearchFriend = async (e) => {
    e.preventDefault();
    const email = searchEmail.toLowerCase().trim();
    if (!email || email === user.email) {
      // Анимация ошибки
      const input = e.target.querySelector('input');
      input.classList.add('shake');
      setTimeout(() => input.classList.remove('shake'), 500);
      return;
    }

    try {
      const q = query(collection(db, "users"), where("email", "==", email));
      const snap = await getDocs(q);

      if (snap.empty) {
        window.alert("👤 Пользователь не найден");
        return;
      }

      const targetUser = snap.docs[0].data();
      
      if (friends.some(f => f.uid === targetUser.uid)) {
        window.alert("🤝 Этот пользователь уже в вашем списке друзей");
        return;
      }

      await addDoc(collection(db, "friend_requests"), {
        from: user.uid,
        fromName: user.displayName,
        fromPhoto: user.photoURL || "",
        to: targetUser.uid,
        status: "pending",
        createdAt: serverTimestamp()
      });

      // Анимация успеха
      setSearchEmail("");
      const successNotification = document.createElement('div');
      successNotification.className = 'success-notification';
      successNotification.textContent = '✅ Запрос отправлен!';
      document.body.appendChild(successNotification);
      setTimeout(() => successNotification.remove(), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  // Принятие запроса
  const acceptFriendRequest = async (req) => {
    const time = new Date().toISOString();
    try {
      await updateDoc(doc(db, "users", user.uid), {
        friends: arrayUnion({ 
          uid: req.from, 
          displayName: req.fromName, 
          photoURL: req.fromPhoto, 
          since: time,
          addedAt: serverTimestamp()
        })
      });
      await updateDoc(doc(db, "users", req.from), {
        friends: arrayUnion({ 
          uid: user.uid, 
          displayName: user.displayName, 
          photoURL: user.photoURL || "", 
          since: time,
          addedAt: serverTimestamp()
        })
      });
      await deleteDoc(doc(db, "friend_requests", req.id));
    } catch (err) {
      console.error(err);
    }
  };

  // Создание группы
  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const groupRef = await addDoc(collection(db, "groups"), {
        name: newGroupName,
        members: [user.uid],
        admin: user.uid,
        createdAt: serverTimestamp(),
        photoURL: "",
        description: ""
      });
      
      setGroups(prev => [...prev, { 
        id: groupRef.id, 
        name: newGroupName, 
        members: [user.uid], 
        admin: user.uid,
        isGroup: true 
      }]);
      
      setNewGroupName("");
      setShowGroupModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Удаление сообщения
  const deleteMsg = async (msgId) => {
    if (!window.confirm("🗑️ Удалить сообщение для всех?")) return;
    const chatID = activeChat.isGroup 
      ? activeChat.id 
      : (user.uid < activeChat.uid ? `${user.uid}_${activeChat.uid}` : `${activeChat.uid}_${user.uid}`);
    const path = activeChat.isGroup ? `groups/${chatID}/messages` : `direct_messages/${chatID}/messages`;
    
    await deleteDoc(doc(db, path, msgId));
  };

  // Видеозвонки
  const initVideoCall = useCallback((element) => {
    if (!activeChat || !element || !user) return;

    const roomID = activeChat.isGroup 
      ? activeChat.id 
      : (user.uid < activeChat.uid ? `${user.uid}_${activeChat.uid}` : `${activeChat.uid}_${user.uid}`);
    
    const appID = 63827300; 
    const serverSecret = "077a49b962317e2e3d000f0bfb71a843";
    
    const kitToken = ZegoUIKitPrebuilt.generateKitTokenForTest(
      appID, 
      serverSecret, 
      roomID, 
      user.uid, 
      user.displayName || "User"
    );

    const zp = ZegoUIKitPrebuilt.create(kitToken);

    zp.joinRoom({
      container: element,
      scenario: { mode: ZegoUIKitPrebuilt.OneONoneCall },
      showScreenSharingButton: true,
      showPreJoinView: false,
      onLeaveRoom: () => {
        setInCall(false);
        // Обновить статус после звонка
        updateDoc(doc(db, "users", user.uid), {
          status: 'online',
          lastSeen: serverTimestamp()
        });
      },
    });
  }, [activeChat, user]);

  // Удаление друга
  const removeFriend = async (friendUid) => {
    if (!window.confirm("❌ Вы уверены, что хотите удалить этого пользователя из друзей?")) return;

    try {
      await updateDoc(doc(db, "users", user.uid), {
        friends: arrayRemove(friends.find(f => f.uid === friendUid))
      });

      // Если открыт чат с этим человеком — закрываем
      if (activeChat?.uid === friendUid) {
        setActiveChat(null);
      }

      // Анимация удаления
      const friendElement = document.querySelector(`[data-friend-id="${friendUid}"]`);
      if (friendElement) {
        friendElement.classList.add('removing');
        setTimeout(() => setFriends(prev => prev.filter(f => f.uid !== friendUid)), 300);
      }
    } catch (err) {
      console.error("Ошибка при удалении друга:", err);
    }
  };

  // Удаление группы
  const deleteGroup = async (groupId) => {
    if (!window.confirm("🔥 Вы уверены, что хотите полностью удалить группу?")) return;
    try {
      await deleteDoc(doc(db, "groups", groupId));
      setActiveChat(null);
      setGroups(prev => prev.filter(g => g.id !== groupId));
    } catch (err) {
      console.error(err);
    }
  };

  // Добавление участника в группу
  const addUserToGroup = async (groupId) => {
    const email = window.prompt("✉️ Введите email пользователя:");
    if (!email) return;

    try {
      const q = query(collection(db, "users"), where("email", "==", email.toLowerCase().trim()));
      const snap = await getDocs(q);

      if (snap.empty) {
        window.alert("👤 Пользователь не найден");
        return;
      }

      const newUser = snap.docs[0].data();
      await updateDoc(doc(db, "groups", groupId), {
        members: arrayUnion(newUser.uid)
      });
      window.alert("✅ Пользователь добавлен");
    } catch (err) {
      console.error(err);
    }
  };

  // Удаление участника из группы
  const kickFromGroup = async (groupId, memberUid) => {
    if (memberUid === user.uid) return window.alert("🚫 Вы не можете выгнать сами себя");
    if (!window.confirm("👢 Удалить участника из группы?")) return;

    try {
      const groupRef = doc(db, "groups", groupId);
      await updateDoc(groupRef, {
        members: arrayRemove(memberUid)
      });
      window.alert("✅ Участник удален");
    } catch (err) {
      console.error(err);
    }
  };

  // Назначить администратором
  const makeAdmin = async (groupId, memberUid) => {
    if (!window.confirm("👑 Сделать этого пользователя администратором?")) return;
    
    await updateDoc(doc(db, "groups", groupId), {
      admin: memberUid
    });
    window.alert("✅ Права переданы");
  };

  // Обработка ввода сообщения (для анимации набора)
  const handleInputChange = (e) => {
    setNewMessage(e.target.value);
    
    if (typingTimeout) clearTimeout(typingTimeout);
    
    setIsTyping(true);
    const timeout = setTimeout(() => setIsTyping(false), 1000);
    setTypingTimeout(timeout);
  };

  // Обработка нажатия Enter для отправки
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Выход из аккаунта
  const handleSignOut = async () => {
    try {
      if (user) {
        await updateDoc(doc(db, "users", user.uid), {
          status: 'offline',
          lastSeen: serverTimestamp()
        });
      }
      await signOut(auth);
    } catch (err) {
      console.error("Ошибка при выходе:", err);
    }
  };

  // Загрузка
  if (loading) {
    return (
      <div className="loader-screen">
        <div className="loader-container">
          <div className="loader-spinner">
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
            <div className="spinner-ring"></div>
            <div className="spinner-center"></div>
          </div>
          <div className="loader-progress">
            <div 
              className="progress-bar" 
              style={{ width: `${loadingProgress}%` }}
            ></div>
          </div>
          <p className="loader-text">Загрузка TogaChat...</p>
        </div>
      </div>
    );
  }

  // Авторизация
  if (!user) {
    return (
      <div className="auth-container">
        <div className="auth-background">
          <div className="floating-shapes">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="floating-shape" style={{
                animationDelay: `${i * 0.5}s`,
                left: `${20 + i * 15}%`
              }}></div>
            ))}
          </div>
        </div>
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo">
              <span className="logo-icon">💬</span>
              <h1 className="logo-text">
                <span className="logo-gradient">Toga</span>Chat
              </h1>
            </div>
            <p className="auth-subtitle">Премиум мессенджер для общения в реальном времени</p>
          </div>
          
          <button 
            className="login-btn" 
            onClick={() => signInWithPopup(auth, provider)}
          >
            <div className="btn-content">
              <img 
                src="https://e7.pngegg.com/pngimages/63/1016/png-clipart-google-logo-google-logo-g-suite-chrome-text-logo-thumbnail.png" 
                alt="Google" 
                className="google-icon"
              />
              <span className="btn-text">Войти через Google</span>
            </div>
            <div className="btn-glow"></div>
          </button>

          <div className="auth-features">
            <div className="feature">
              <span className="feature-icon">🔒</span>
              <span>Безопасное шифрование</span>
            </div>
            <div className="feature">
              <span className="feature-icon">🎥</span>
              <span>Видеозвонки</span>
            </div>
            <div className="feature">
              <span className="feature-icon">⚡</span>
              <span>Мгновенная доставка</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-layout ${darkMode ? 'dark' : 'light'}`}>
      {/* Левая панель */}
      <aside className="sidebar">
        <div className="sidebar-overlay"></div>
        
        <header className="sidebar-header">
          <div 
            className="user-profile" 
            onClick={() => setShowSettings(true)}
            title="Настройки профиля"
          >
            <SafeAvatar 
              src={user.photoURL} 
              name={user.displayName} 
              size="52px"
              status="online"
              className="user-avatar"
            />
            <div className="user-info">
              <h3 className="user-name">{user.displayName}</h3>
              <span className="user-status">В сети</span>
            </div>
            <div className="profile-badge">👑</div>
          </div>
          
          <div className="header-actions">
            <button 
              className="icon-btn new-group-btn"
              onClick={() => setShowGroupModal(true)}
              title="Создать группу"
            >
              <span className="icon">👥</span>
              <span className="tooltip">Создать группу</span>
            </button>
            <button 
              className="icon-btn settings-btn"
              onClick={() => setShowSettings(!showSettings)}
              title="Настройки"
            >
              <span className="icon">⚙️</span>
              <span className="tooltip">Настройки</span>
            </button>
          </div>
        </header>

        <form className="search-bar" onSubmit={handleSearchFriend}>
          <div className="search-container">
            <input 
              type="email" 
              placeholder="Найти друга по email..." 
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              className="search-input"
            />
            <button type="submit" className="search-btn" title="Найти">
              <span className="search-icon">🔍</span>
            </button>
          </div>
        </form>

        <div className="sidebar-content">
          {/* Заявки в друзья */}
          {friendRequests.length > 0 && (
            <div className="requests-section">
              <div className="section-header">
                <h4 className="section-title">
                  <span className="title-icon">📨</span>
                  Запросы в друзья
                  <span className="badge">{friendRequests.length}</span>
                </h4>
              </div>
              <div className="requests-list">
                {friendRequests.map(req => (
                  <div key={req.id} className="request-item">
                    <SafeAvatar 
                      src={req.fromPhoto} 
                      name={req.fromName} 
                      size="40px" 
                      className="request-avatar"
                    />
                    <div className="request-info">
                      <h5 className="request-name">{req.fromName}</h5>
                      <p className="request-meta">Хочет добавить вас в друзья</p>
                    </div>
                    <button 
                      className="accept-btn" 
                      onClick={() => acceptFriendRequest(req)}
                      title="Принять запрос"
                    >
                      <span className="accept-icon">✓</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Личные чаты */}
          <div className="section-block">
            <div className="section-header">
              <h4 className="section-title">
                <span className="title-icon">💬</span>
                Личные сообщения
                <span className="badge">{friends.length}</span>
              </h4>
            </div>
            <div className="chats-list">
              {friends.map(friend => {
                const unread = unreadMessages[friend.uid] || 0;
                return (
                  <div 
                    key={friend.uid}
                    data-friend-id={friend.uid}
                    className={`chat-row ${activeChat?.uid === friend.uid ? 'active' : ''}`}
                    onClick={() => { 
                      setActiveChat(friend); 
                      setShowSettings(false); 
                      setInCall(false); 
                    }}
                  >
                    <SafeAvatar 
                      src={friend.photoURL} 
                      name={friend.displayName} 
                      size="48px"
                      status="online"
                      className="chat-avatar"
                    />
                    <div className="chat-info">
                      <div className="chat-header">
                        <h4 className="chat-name">{friend.displayName}</h4>
                        <span className="chat-time">
                          {friend.lastSeen ? 'Недавно' : ''}
                        </span>
                      </div>
                      <p className="chat-preview">
                        {friend.lastMessage || 'Начните общение...'}
                      </p>
                    </div>
                    {unread > 0 && (
                      <span className="unread-badge">{unread}</span>
                    )}
                    <button 
                      className="remove-friend-btn" 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFriend(friend.uid);
                      }}
                      title="Удалить из друзей"
                    >
                      <span className="remove-icon">✕</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Группы */}
          <div className="section-block">
            <div className="section-header">
              <h4 className="section-title">
                <span className="title-icon">👥</span>
                Группы
                <span className="badge">{groups.length}</span>
              </h4>
              <button 
                className="add-group-btn"
                onClick={() => setShowGroupModal(true)}
                title="Создать группу"
              >
                <span className="add-icon">+</span>
              </button>
            </div>
            <div className="groups-list">
              {groups.map(group => {
                const unread = unreadMessages[group.id] || 0;
                const isAdmin = group.admin === user.uid;
                
                return (
                  <div 
                    key={group.id} 
                    className={`chat-row group-row ${activeChat?.id === group.id ? 'active' : ''}`}
                    onClick={() => { 
                      setActiveChat(group); 
                      setShowSettings(false); 
                      setInCall(false); 
                    }}
                  >
                    <div className="group-avatar">
                      <div className="group-icon">#</div>
                      {isAdmin && <span className="admin-crown">👑</span>}
                    </div>
                    <div className="chat-info">
                      <div className="chat-header">
                        <h4 className="chat-name">{group.name}</h4>
                        <span className="chat-time">
                          {group.members?.length || 0} участников
                        </span>
                      </div>
                      <p className="chat-preview">
                        {group.description || 'Групповой чат'}
                      </p>
                    </div>
                    {unread > 0 && (
                      <span className="unread-badge">{unread}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </aside>

      {/* Правая панель */}
      <main className="chat-viewport" style={{ 
        backgroundImage: chatBg ? `url(${chatBg})` : 'none',
        backgroundBlendMode: 'overlay'
      }}>
        {showSettings ? (
          <div className="settings-view">
            <div className="settings-card">
              <div className="settings-header">
                <h2 className="settings-title">⚙️ Настройки</h2>
                <button 
                  className="close-settings" 
                  onClick={() => setShowSettings(false)}
                >
                  ✕
                </button>
              </div>
              
              <div className="settings-content">
                <div className="setting-group">
                  <h3 className="setting-title">
                    <span className="setting-icon">🎨</span>
                    Внешний вид
                  </h3>
                  <div className="setting-item">
                    <label className="setting-label">Акцентный цвет</label>
                    <div className="color-picker">
                      <input 
                        type="color" 
                        value={accentColor}
                        onChange={e => setAccentColor(e.target.value)}
                        className="color-input"
                      />
                      <span className="color-value">{accentColor}</span>
                    </div>
                  </div>
                  
                  <div className="setting-item">
                    <label className="setting-label">Фон чата</label>
                    <input 
                      type="text" 
                      value={chatBg}
                      placeholder="URL изображения..."
                      onChange={e => {
                        setChatBg(e.target.value);
                        localStorage.setItem('chatBg', e.target.value);
                      }}
                      className="url-input"
                    />
                  </div>
                  
                  <div className="setting-item toggle-item">
                    <div className="toggle-label">
                      <span className="setting-icon">🌙</span>
                      Темная тема
                    </div>
                    <label className="toggle-switch">
                      <input 
                        type="checkbox"
                        checked={darkMode}
                        onChange={(e) => {
                          setDarkMode(e.target.checked);
                          localStorage.setItem('darkMode', e.target.checked);
                        }}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  
                  <div className="setting-item toggle-item">
                    <div className="toggle-label">
                      <span className="setting-icon">✨</span>
                      Анимации
                    </div>
                    <label className="toggle-switch">
                      <input 
                        type="checkbox"
                        checked={animationsEnabled}
                        onChange={(e) => {
                          setAnimationsEnabled(e.target.checked);
                          localStorage.setItem('animations', e.target.checked);
                        }}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
                
                <div className="setting-group">
                  <h3 className="setting-title">
                    <span className="setting-icon">👤</span>
                    Профиль
                  </h3>
                  <div className="profile-setting">
                    <SafeAvatar 
                      src={user.photoURL} 
                      name={user.displayName} 
                      size="80px"
                      className="profile-avatar"
                    />
                    <div className="profile-info">
                      <h4 className="profile-name">{user.displayName}</h4>
                      <p className="profile-email">{user.email}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="settings-footer">
                <button 
                  className="primary-btn save-btn"
                  onClick={() => setShowSettings(false)}
                >
                  💾 Сохранить изменения
                </button>
                <button 
                  className="danger-btn logout-btn"
                  onClick={handleSignOut}
                >
                  🚪 Выйти из аккаунта
                </button>
              </div>
            </div>
          </div>
        ) : activeChat ? (
          !inCall ? (
            <>
              <header className="chat-header">
                <div className="chat-header-content">
                  <div className="header-info">
                    <SafeAvatar 
                      src={activeChat.photoURL} 
                      name={activeChat.displayName || activeChat.name}
                      size="44px"
                      status="online"
                    />
                    <div className="header-details">
                      <h3 className="chat-title">
                        {activeChat.displayName || activeChat.name}
                        {activeChat.isGroup && activeChat.admin === user.uid && (
                          <span className="admin-badge">👑</span>
                        )}
                      </h3>
                      <div className="chat-status">
                        {activeChat.isGroup ? (
                          <span className="group-members">
                            👥 {activeChat.members?.length || 0} участников
                          </span>
                        ) : (
                          <span className="user-status">
                            <span className="status-dot online"></span>
                            В сети
                          </span>
                        )}
                        {isTyping && (
                          <span className="typing-indicator">
                            <span className="dot"></span>
                            <span className="dot"></span>
                            <span className="dot"></span>
                            печатает...
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="header-tools">
                    <button 
                      className="call-btn"
                      onClick={() => setInCall(true)}
                      title="Начать видеозвонок"
                    >
                      <span className="call-icon">🎥</span>
                      <span className="call-text">Звонок</span>
                    </button>
                    
                    {activeChat.isGroup && activeChat.admin === user.uid && (
                      <div className="admin-menu">
                        <button 
                          className="icon-btn admin-btn"
                          onClick={() => addUserToGroup(activeChat.id)}
                          title="Добавить участника"
                        >
                          <span className="admin-icon">➕</span>
                        </button>
                        <button 
                          className="icon-btn admin-btn"
                          onClick={async () => {
                            const emailToKick = window.prompt("Введите Email участника:");
                            if (!emailToKick) return;
                            
                            const q = query(collection(db, "users"), 
                              where("email", "==", emailToKick.toLowerCase().trim()));
                            const snap = await getDocs(q);
                            if (!snap.empty) {
                              kickFromGroup(activeChat.id, snap.docs[0].data().uid);
                            } else {
                              alert("Пользователь не найден");
                            }
                          }}
                          title="Удалить участника"
                        >
                          <span className="admin-icon">➖</span>
                        </button>
                        <button 
                          className="icon-btn admin-btn danger"
                          onClick={() => deleteGroup(activeChat.id)}
                          title="Удалить группу"
                        >
                          <span className="admin-icon">🗑️</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </header>

              <div className="messages-container" ref={scrollRef}>
                <div className="messages-scroll">
                  {messages.map((m, i) => {
                    const isMe = m.uid === user.uid;
                    const showAvatar = activeChat.isGroup && !isMe;
                    const showName = activeChat.isGroup && !isMe;
                    
                    return (
                      <div 
                        key={m.id || i}
                        ref={i === messages.length - 1 ? lastMessageRef : null}
                        className={`message-row ${isMe ? 'me' : 'other'} ${m.status || ''}`}
                      >
                        {showAvatar && (
                          <div className="message-avatar">
                            <SafeAvatar 
                              src={m.senderPhoto} 
                              name={m.senderName}
                              size="32px"
                            />
                          </div>
                        )}
                        
                        <div className="message-content">
                          {showName && (
                            <span className="sender-name">{m.senderName}</span>
                          )}
                          <div className="message-bubble">
                            <p className="message-text">{m.text}</p>
                            <div className="message-footer">
                              <MessageTime timestamp={m.createdAt} />
                              {m.edited && (
                                <span className="edited-badge">изменено</span>
                              )}
                              {isMe && (
                                <button 
                                  className="del-msg-btn"
                                  onClick={() => deleteMsg(m.id)}
                                  title="Удалить сообщение"
                                >
                                  <span className="delete-icon">🗑️</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <form className="chat-input-form" onSubmit={sendMessage}>
                <div className="input-container">
                  <div className="input-wrapper">
                    <input
                      ref={inputRef}
                      type="text"
                      value={newMessage}
                      onChange={handleInputChange}
                      onKeyPress={handleKeyPress}
                      placeholder="Напишите сообщение..."
                      className="message-input"
                      autoFocus
                    />
                    <div className="input-actions">
                      <button 
                        type="button" 
                        className="emoji-btn"
                        title="Эмодзи"
                      >
                        😊
                      </button>
                      <button 
                        type="submit" 
                        className="send-btn"
                        disabled={!newMessage.trim()}
                        title="Отправить"
                      >
                        <span className="send-icon">➤</span>
                      </button>
                    </div>
                  </div>
                  <div className="input-hint">
                    Нажмите Enter для отправки, Shift+Enter для новой строки
                  </div>
                </div>
              </form>
            </>
          ) : (
            <div className="call-interface">
              <div className="call-overlay"></div>
              <div className="call-container">
                <div className="call-header">
                  <div className="call-info">
                    <span className="call-title">
                      📞 Звонок с {activeChat.displayName || activeChat.name}
                    </span>
                    <span className="call-duration">00:00</span>
                  </div>
                  <button 
                    className="end-call-btn"
                    onClick={() => setInCall(false)}
                  >
                    <span className="end-icon">📞</span>
                    Завершить
                  </button>
                </div>
                <div 
                  className="video-viewport"
                  ref={initVideoCall}
                >
                  <div className="video-placeholder">
                    <div className="placeholder-content">
                      <div className="placeholder-icon">📹</div>
                      <p className="placeholder-text">
                        Подключение к видеозвонку...
                      </p>
                    </div>
                  </div>
                </div>
                <div className="call-controls">
                  <button className="control-btn" title="Выключить микрофон">
                    🎤
                  </button>
                  <button className="control-btn" title="Выключить камеру">
                    📷
                  </button>
                  <button className="control-btn" title="Поделиться экраном">
                    🖥️
                  </button>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="empty-chat">
            <div className="welcome-screen">
              <div className="welcome-animation">
                <div className="pulse-circle"></div>
                <div className="pulse-circle delay-1"></div>
                <div className="pulse-circle delay-2"></div>
              </div>
              <div className="welcome-content">
                <div className="welcome-icon">💬</div>
                <h2 className="welcome-title">Добро пожаловать в TogaChat!</h2>
                <p className="welcome-subtitle">
                  Выберите чат или создайте новую группу, чтобы начать общение
                </p>
                <div className="welcome-features">
                  <div className="feature-card">
                    <span className="feature-emoji">🔐</span>
                    <h4>Безопасность</h4>
                    <p>Шифрование сообщений</p>
                  </div>
                  <div className="feature-card">
                    <span className="feature-emoji">🚀</span>
                    <h4>Скорость</h4>
                    <p>Мгновенная доставка</p>
                  </div>
                  <div className="feature-card">
                    <span className="feature-emoji">🎥</span>
                    <h4>Видео</h4>
                    <p>Качественные звонки</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Уведомления */}
        <div className="notifications-container">
          {/* Уведомления будут добавляться динамически */}
        </div>

        {/* Модальное окно создания группы */}
        {showGroupModal && (
          <div className="modal-overlay">
            <div className="modal-container">
              <div className="modal-content">
                <div className="modal-header">
                  <h3 className="modal-title">👥 Создать новую группу</h3>
                  <button 
                    className="modal-close"
                    onClick={() => setShowGroupModal(false)}
                  >
                    ✕
                  </button>
                </div>
                
                <div className="modal-body">
                  <p className="modal-description">
                    Придумайте название для вашего сообщества
                  </p>
                  
                  <div className="form-group">
                    <label className="form-label">Название группы</label>
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="Например: Команда проекта"
                      className="form-input"
                      autoFocus
                    />
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">Описание (необязательно)</label>
                    <textarea
                      placeholder="О чем эта группа?"
                      className="form-textarea"
                      rows="3"
                    ></textarea>
                  </div>
                </div>
                
                <div className="modal-footer">
                  <button 
                    className="primary-btn modal-confirm"
                    onClick={createGroup}
                    disabled={!newGroupName.trim()}
                  >
                    🚀 Создать группу
                  </button>
                  <button 
                    className="secondary-btn modal-cancel"
                    onClick={() => setShowGroupModal(false)}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Мобильная навигация */}
      <div className="mobile-nav">
        <button className="nav-btn active">
          <span className="nav-icon">💬</span>
          <span className="nav-label">Чаты</span>
        </button>
        <button className="nav-btn">
          <span className="nav-icon">👥</span>
          <span className="nav-label">Группы</span>
        </button>
        <button className="nav-btn">
          <span className="nav-icon">⚙️</span>
          <span className="nav-label">Настройки</span>
        </button>
      </div>
    </div>
  );
}

export default App;