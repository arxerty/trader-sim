import { createRoot } from 'react-dom/client';
import { initI18n } from '@/i18n';
import { AppProviders } from '@/app/providers';
import { App } from '@/app/App';
import './index.css';

initI18n();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <AppProviders>
    <App />
  </AppProviders>,
);
