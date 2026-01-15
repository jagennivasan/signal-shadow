import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import io, { Socket } from 'socket.io-client';

// Types
interface Player {
  id: string;
  name: string;
  isReady: boolean;
  score?: number;
  role?: 'shadow' | 'signal';
}

interface Room {
  id: string;
  code: string;
  players: Player[];
  hostId: string;
  gameState: string;
  round: number;
  maxPlayers: number;
  wordPair?: {
    shadow: string;
    signal: string;
  };
  results?: {
    shadowCaught: boolean;
  };
}

interface JoinRoomData {
  roomCode: string;
  playerName: string;
}

interface SocketErrorResponse {
  error: string;
}

// Use your actual server URL - adjust if needed
const SOCKET_SERVER_URL = import.meta.env.VITE_BACKEND_URL as string;
const socket: Socket = io(SOCKET_SERVER_URL, {
  transports: ['websocket', 'polling'],
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

function Lobby() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('Connecting...');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    console.log('Lobby mounted, roomCode:', roomCode);
    
    // Debug socket connection
    socket.on('connect', () => {
      console.log('Socket connected with ID:', socket.id);
      setConnectionStatus('Connected');
    });

    socket.on('connect_error', (err: Error) => {
      console.error('Socket connection error:', err.message);
      setConnectionStatus('Connection failed');
      setError(`Cannot connect to server: ${err.message}`);
    });

    socket.on('disconnect', (reason: string) => {
      console.log('Socket disconnected:', reason);
      setConnectionStatus('Disconnected');
    });

    const playerId = localStorage.getItem('playerId');
    const playerName = localStorage.getItem('playerName');
    
    console.log('Player data from localStorage:', { playerId, playerName });
    
    if (!playerId || !playerName || !roomCode) {
      console.log('Missing required data, redirecting to home');
      navigate('/');
      return;
    }

    // Join the room if not already in it
    console.log('Attempting to join room:', roomCode);
    
    // Try to auto-join the room on mount
    const joinData: JoinRoomData = { roomCode, playerName };
    socket.emit('joinRoom', joinData, (response?: SocketErrorResponse) => {
      if (response && response.error) {
        console.error('Join room error:', response.error);
        setError(response.error);
      }
    });

    // Listen for room updates
    socket.on('roomUpdated', (roomData: Room) => {
      console.log('Room updated:', roomData);
      setRoom(roomData);
      const currentPlayer = roomData.players.find(p => p.id === playerId);
      setPlayer(currentPlayer || null);
      setError('');
    });

    socket.on('gameStarted', (roomData: Room) => {
      console.log('Game started, navigating to game page');
      navigate(`/game/${roomCode}`);
    });

    socket.on('error', (message: string) => {
      console.error('Socket error:', message);
      setError(message);
    });

    // Cleanup
    return () => {
      console.log('Cleaning up socket listeners');
      socket.off('connect');
      socket.off('connect_error');
      socket.off('disconnect');
      socket.off('roomUpdated');
      socket.off('gameStarted');
      socket.off('error');
    };
  }, [roomCode, navigate]);

  const handleStartGame = (): void => {
    socket.emit('startGame');
  };

  const handleLeaveRoom = (): void => {
    socket.emit('leaveRoom');
    navigate('/');
  };

  const handleRejoin = (): void => {
    const playerName = localStorage.getItem('playerName');
    if (playerName && roomCode) {
      const joinData: JoinRoomData = { roomCode, playerName };
      socket.emit('joinRoom', joinData);
    }
  };

  const copyRoomCode = (): void => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  return (
    <div className="lobby-container">
      <div className="lobby-header">
        <h2>Room: {roomCode}</h2>
        <div className="connection-status">{connectionStatus}</div>
        <button onClick={copyRoomCode} className="copy-btn">
          {isCopied ? 'Copied!' : 'Copy Code'}
        </button>
        <button onClick={handleLeaveRoom} className="leave-btn">Leave Room</button>
      </div>

      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={handleRejoin} className="rejoin-btn">
            Try Rejoining
          </button>
        </div>
      )}

      {!room ? (
        <div className="loading-container">
          <p>Loading room data...</p>
          <div className="spinner"></div>
          <p>Socket ID: {socket.id || 'Not connected'}</p>
          <button onClick={handleRejoin} className="rejoin-btn">
            Rejoin Room
          </button>
        </div>
      ) : (
        <>
          <div className="room-info">
            <p>Players: {room.players.length}/{room.maxPlayers}</p>
            <p>Round: {room.round}</p>
            <p>Status: {room.gameState}</p>
          </div>

          <div className="players-list">
            <h3>Players ({room.players.length})</h3>
            {room.players.map(p => (
              <div key={p.id} className="player-item">
                <span>{p.name}</span>
                <span>{p.isReady ? '✅ Ready' : '⏳ Waiting'}</span>
                {p.id === room.hostId && <span className="host-badge">Host</span>}
                <span className="player-id">ID: {p.id.substring(0, 8)}...</span>
              </div>
            ))}
          </div>

          {room.hostId === player?.id && (
            <div className="host-controls">
              <button 
                onClick={handleStartGame}
                disabled={room.players.length < 3}
                className="start-btn"
              >
                {room.players.length < 3 
                  ? `Need ${3 - room.players.length} more players` 
                  : 'Start Game'}
              </button>
            </div>
          )}

          <div className="instructions">
            <h4>How to Play:</h4>
            <ol>
              <li>Each round, players receive a secret word</li>
              <li>Most players get the same word (Signals)</li>
              <li>One player gets a different word (Shadow)</li>
              <li>Discuss and vote to eliminate the Shadow</li>
              <li>Signals win if they eliminate the Shadow</li>
              <li>Shadow wins if they survive</li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}

export default Lobby;