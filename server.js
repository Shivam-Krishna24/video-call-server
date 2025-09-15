const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Configure CORS for production
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === "production" 
      ? ["https://video-call-frontend-eta.vercel.app"]  // Your exact Vercel URL
      : ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from client in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, '../client')));
  
  // Serve the frontend for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
  });
} else {
  // For development, just serve API
  app.get('/', (req, res) => {
    res.json({ message: 'Video Call Server API', mode: 'development' });
  });
}

// Store active rooms and users
const rooms = new Map();

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a room
  socket.on('join-room', (roomId, userId) => {
    console.log(`User ${userId} joining room ${roomId}`);
    
    socket.join(roomId);
    
    // Initialize room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    
    // Add user to room
    rooms.get(roomId).add(userId);
    
    // Notify others in the room
    socket.to(roomId).emit('user-connected', userId);
    
    // Send current users in the room to the new user
    const users = Array.from(rooms.get(roomId)).filter(id => id !== userId);
    socket.emit('current-users', users);
  });

  // WebRTC signaling events
  socket.on('offer', (data) => {
    socket.to(data.target).emit('offer', {
      offer: data.offer,
      sender: data.sender
    });
  });

  socket.on('answer', (data) => {
    socket.to(data.target).emit('answer', {
      answer: data.answer,
      sender: data.sender
    });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      sender: data.sender
    });
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove user from all rooms
    for (const [roomId, users] of rooms.entries()) {
      if (users.has(socket.id)) {
        users.delete(socket.id);
        socket.to(roomId).emit('user-disconnected', socket.id);
        
        // Clean up empty rooms
        if (users.size === 0) {
          rooms.delete(roomId);
        }
      }
    }
  });

  // Chat message handling
  socket.on('send-message', (data) => {
    socket.to(data.roomId).emit('receive-message', {
      userId: data.userId,
      message: data.message,
      timestamp: new Date().toISOString()
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});