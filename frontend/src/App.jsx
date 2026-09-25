import React from "react";
import { Routes, Route } from "react-router-dom";
import { SessionProvider } from "./context/SessionContext.jsx";
import Footer from "./components/Footer.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import CreateRoomPage from "./pages/CreateRoomPage.jsx";
import JoinRoomPage from "./pages/JoinRoomPage.jsx";
import RoomLobbyPage from "./pages/RoomLobbyPage.jsx";
import GamePage from "./pages/GamePage.jsx";
import LocalSetupPage from "./pages/LocalSetupPage.jsx";
import AISetupPage from "./pages/AISetupPage.jsx";
import LocalGamePage from "./pages/LocalGamePage.jsx";

export default function App() {
  return (
    <SessionProvider>
      <div className="min-h-screen flex flex-col">
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/create" element={<CreateRoomPage />} />
            <Route path="/join" element={<JoinRoomPage />} />
            <Route path="/lobby/:roomCode" element={<RoomLobbyPage />} />
            <Route path="/game/:roomCode" element={<GamePage />} />
            <Route path="/local-setup" element={<LocalSetupPage />} />
            <Route path="/ai-setup" element={<AISetupPage />} />
            <Route path="/local-game" element={<LocalGamePage />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </SessionProvider>
  );
}
