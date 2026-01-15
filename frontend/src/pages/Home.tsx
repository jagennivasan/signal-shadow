import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import io, { Socket } from 'socket.io-client';

interface RoomCreatedData {
  roomCode: string;
  player: {
    id: string;
    name: string;
  };
}

interface JoinRoomData {
  roomCode: string;
  playerName: string;
}

const socket: Socket = io(import.meta.env.VITE_BACKEND_URL as string);

function Home() {
  const [playerName, setPlayerName] = useState<string>('');
  const [roomCode, setRoomCode] = useState<string>('');
  const [error, setError] = useState<string>('');
  const navigate = useNavigate();

  // Cleanup socket listeners on unmount
  useEffect(() => {
    return () => {
      socket.off('roomCreated');
      socket.off('roomJoined');
      socket.off('error');
    };
  }, []);

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }
    
    // Remove any existing listeners to prevent duplicates
    socket.off('roomCreated');
    
    socket.emit('createRoom', playerName);
    
    socket.on('roomCreated', (data: RoomCreatedData) => {
      localStorage.setItem('playerId', data.player.id);
      localStorage.setItem('playerName', data.player.name);
      navigate(`/lobby/${data.roomCode}`);
    });
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || !roomCode.trim()) {
      setError('Please enter your name and room code');
      return;
    }
    
    // Remove any existing listeners to prevent duplicates
    socket.off('roomJoined');
    socket.off('error');
    
    const joinData: JoinRoomData = {
      roomCode: roomCode.toUpperCase(),
      playerName
    };
    
    socket.emit('joinRoom', joinData);
    
    socket.on('roomJoined', (data: RoomCreatedData) => {
      localStorage.setItem('playerId', data.player.id);
      localStorage.setItem('playerName', data.player.name);
      navigate(`/lobby/${data.roomCode}`);
    });
    
    socket.on('error', (message: string) => {
      setError(message);
    });
  };

  return (
    <div className="home-container">
      <h1>Shadow Signal</h1>
      <div className="game-description">
        <p>A hidden role game where players must identify the Shadow among them.</p>
        <p><strong>Shadow:</strong> Has a different word. Try to blend in.</p>
        <p><strong>Signals:</strong> Share a common word. Find the Shadow.</p>
      </div>
      
      <div className="home-forms">
        <form onSubmit={handleCreateRoom} className="create-room">
          <h2>Create New Room</h2>
          <input
            type="text"
            placeholder="Your Name"
            value={playerName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPlayerName(e.target.value)}
          />
          <button type="submit">Create Room</button>
        </form>
        
        <div className="separator">OR</div>
        
        <form onSubmit={handleJoinRoom} className="join-room">
          <h2>Join Existing Room</h2>
          <input
            type="text"
            placeholder="Your Name"
            value={playerName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPlayerName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Room Code"
            value={roomCode}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRoomCode(e.target.value.toUpperCase())}
            style={{ textTransform: 'uppercase' }}
          />
          <button type="submit">Join Room</button>
        </form>
      </div>
      
      {error && <div className="error">{error}</div>}
    </div>
  );
}

export default Home;