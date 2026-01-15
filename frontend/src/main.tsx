import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from "react-router";
import Home from './pages/Home.tsx';
import Lobby from './pages/Lobby.tsx';
import Game from './pages/Game.tsx';

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<App />}>
      <Route path="/" element={<Home />} />
      <Route path="/lobby/:roomCode" element={<Lobby />} />
      <Route path="/game/:roomCode" element={<Game />} />
    </Route>
  )
);

createRoot(document.getElementById('root')!).render(
   <RouterProvider router={router} />

)
