import { createRoot } from 'react-dom/client';
import Home from './page';
import './globals.css';
import './game-ui.css';

const root = document.getElementById('root');
if (!root) throw new Error('The game root is missing.');
createRoot(root).render(<Home />);
