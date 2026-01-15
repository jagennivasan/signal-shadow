import  { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import io, { Socket } from 'socket.io-client';

// Types
interface Player {
  id: string;
  name: string;
  role?: 'shadow' | 'signal';
  word?: string;
  score: number;
  isReady: boolean;
}

interface WordPair {
  shadow: string;
  signal: string;
}

interface VoteResults {
  shadowCaught: boolean;
  shadowPlayerId?: string;
  votes?: Record<string, string>;
}

interface Room {
  id: string;
  code: string;
  players: Player[];
  hostId: string;
  gameState: 'waiting' | 'assigning' | 'discussion' | 'results';
  round: number;
  wordPair?: WordPair;
  results?: VoteResults;
  revealedPlayers?: string[];
}

interface RoleAssignedData {
  role: 'shadow' | 'signal';
  word: string;
}

interface VoteReceivedData {
  remainingVotes: number;
}

interface RoleRevealedData {
  revealedPlayers: string[];
}

interface GameProps {}

const socket: Socket = io(import.meta.env.VITE_BACKEND_URL as string);

function Game() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(180); // 3 minutes for discussion

  useEffect(() => {
    const playerId = localStorage.getItem('playerId');
    
    if (!playerId || !roomCode) {
      navigate('/');
      return;
    }

    // Listen for game events
    socket.on('roleAssigned', (data: RoleAssignedData) => {
      setPlayer(prev => prev ? { ...prev, ...data } : null);
    });

    socket.on('roomUpdated', (roomData: Room) => {
      setRoom(roomData);
      const currentPlayer = roomData.players.find(p => p.id === playerId);
      setPlayer(currentPlayer || null);
    });

    socket.on('gameStarted', (roomData: Room) => {
      setRoom(roomData);
    });

    socket.on('discussionStarted', (roomData: Room) => {
      setRoom(roomData);
      setTimeLeft(180);
    });

    socket.on('voteReceived', (data: VoteReceivedData) => {
      console.log(`Vote received. ${data.remainingVotes} votes remaining`);
    });

    socket.on('roundResults', (roomData: Room) => {
      setRoom(roomData);
    });

    socket.on('roundAdvanced', (roomData: Room) => {
      setRoom(roomData);
      navigate(`/lobby/${roomCode}`);
    });

    socket.on('roleRevealed', (data: RoleRevealedData) => {
      // Update revealed players in room state
      setRoom(prev => {
        if (!prev) return null;
        return {
          ...prev,
          players: prev.players.map(p => ({
            ...p,
            role: data.revealedPlayers.includes(p.id) ? p.role : p.role,
            word: data.revealedPlayers.includes(p.id) ? p.word : p.word
          }))
        };
      });
    });

    // Cleanup function
    return () => {
      socket.off('roleAssigned');
      socket.off('roomUpdated');
      socket.off('gameStarted');
      socket.off('discussionStarted');
      socket.off('voteReceived');
      socket.off('roundResults');
      socket.off('roundAdvanced');
      socket.off('roleRevealed');
    };
  }, [roomCode, navigate]);

  // Timer effect
  useEffect(() => {
    if (room?.gameState !== 'discussion' || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [room?.gameState, timeLeft]);

  const handleReady = () => {
    socket.emit('playerReady');
  };

  const handleVote = () => {
    if (selectedVote) {
      socket.emit('submitVote', selectedVote);
      setSelectedVote(null);
    }
  };

  const handleNextRound = () => {
    socket.emit('nextRound');
  };

  const handleRevealRole = (playerId: string) => {
    socket.emit('revealRole', playerId);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!room || !player) {
    return <div>Loading...</div>;
  }

  return (
    <div className="game-container">
      {/* Game Header */}
      <div className="game-header">
        <h2>Shadow Signal - Round {room.round}</h2>
        <div className="room-code">Room: {roomCode}</div>
        <div className="game-state">{room.gameState.toUpperCase()}</div>
      </div>

      {/* Player's Role Info */}
      {player.role && (
        <div className={`role-info ${player.role}`}>
          <h3>You are: {player.role.toUpperCase()}</h3>
          <div className="secret-word">Your word: <strong>{player.word}</strong></div>
          <p className="role-instruction">
            {player.role === 'shadow' 
              ? 'Blend in with the Signals. Don\'t reveal you have a different word!'
              : 'Find the Shadow! Discuss clues without saying your exact word.'}
          </p>
        </div>
      )}

      {/* Assigning Phase */}
      {room.gameState === 'assigning' && (
        <div className="phase-container">
          <h3>Waiting for players to confirm...</h3>
          <div className="players-ready">
            {room.players.map(p => (
              <div key={p.id} className="player-status">
                <span>{p.name}</span>
                <span>{p.isReady ? '✅' : '❌'}</span>
              </div>
            ))}
          </div>
          {!player.isReady && (
            <button onClick={handleReady} className="ready-btn">
              I'm Ready
            </button>
          )}
        </div>
      )}

      {/* Discussion Phase */}
      {room.gameState === 'discussion' && (
        <div className="phase-container">
          <div className="timer">Time: {formatTime(timeLeft)}</div>
          <h3>Discuss and find the Shadow!</h3>
          <p className="discussion-guide">
            Hint at your word without saying it directly. Ask questions to reveal inconsistencies.
          </p>
          
          <div className="vote-section">
            <h4>Vote to eliminate:</h4>
            <div className="vote-options">
              {room.players
                .filter(p => p.id !== player.id)
                .map(p => (
                  <button
                    key={p.id}
                    className={`vote-btn ${selectedVote === p.id ? 'selected' : ''}`}
                    onClick={() => setSelectedVote(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
            </div>
            <button 
              onClick={handleVote}
              disabled={!selectedVote}
              className="submit-vote-btn"
            >
              Submit Vote
            </button>
          </div>
        </div>
      )}

      {/* Results Phase */}
      {room.gameState === 'results' && (
        <div className="phase-container">
          <h3>Round Results</h3>
          
          {room.wordPair && (
            <div className="word-reveal">
              <p><strong>Words this round:</strong></p>
              <p>Shadow's word: {room.wordPair.shadow}</p>
              <p>Signals' word: {room.wordPair.signal}</p>
            </div>
          )}

          <div className="players-results">
            {room.players.map(p => (
              <div key={p.id} className="player-result">
                <div className="player-name">{p.name}</div>
                <div className="player-role">Role: {p.role?.toUpperCase()}</div>
                <div className="player-word">Word: {p.word || '???'}</div>
                <div className="player-score">Score: {p.score}</div>
                {room.hostId === player.id && !room.revealedPlayers?.includes(p.id) && (
                  <button 
                    onClick={() => handleRevealRole(p.id)}
                    className="reveal-btn"
                  >
                    Reveal
                  </button>
                )}
              </div>
            ))}
          </div>

          {room.results && (
            <div className="vote-results">
              <h4>Voting Results:</h4>
              {room.results.shadowCaught ? (
                <p className="result-success">✅ The Shadow was caught! Signals win!</p>
              ) : (
                <p className="result-fail">❌ The Shadow escaped! Shadow wins!</p>
              )}
            </div>
          )}

          {room.hostId === player.id && (
            <button onClick={handleNextRound} className="next-round-btn">
              Next Round
            </button>
          )}
        </div>
      )}

      {/* Players List */}
      <div className="game-players">
        <h4>Players ({room.players.length})</h4>
        {room.players.map(p => (
          <div key={p.id} className="game-player">
            <span>{p.name}</span>
            <span>Score: {p.score}</span>
            {room.revealedPlayers?.includes(p.id) && p.role && (
              <span className="revealed-role">{p.role}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Game;