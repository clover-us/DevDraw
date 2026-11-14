import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/styles.css';
import './design.css';
import { DesignSystem } from './DesignSystem';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DesignSystem />
  </StrictMode>,
);
