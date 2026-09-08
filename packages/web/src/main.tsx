import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NiqqudCheck } from './NiqqudCheck.js';
import './styles.css';

const el = document.getElementById('root');
if (!el) throw new Error('#root not found');

createRoot(el).render(
  <StrictMode>
    <NiqqudCheck />
  </StrictMode>,
);
