import './styles/globals.css';
import './styles/flow.css';
import './index.css';
import { useTranslation } from 'react-i18next';
import { MapView } from './components/map/MapView';
import { ProposalListPanel } from './components/proposal/ProposalListPanel';
import { ProposalPanel } from './components/proposal/ProposalPanel';
import { Header } from './components/ui/Header';
import { SuggestFlow } from './components/flow/SuggestFlow';
import { AttractMode } from './components/attract/AttractMode';
import { useAppStore } from './store/useAppStore';

export default function App() {
  const { t } = useTranslation();
  const { mode, browseSpaceId, browseProposal, setMode, setFlowStep } = useAppStore();
  const showSuggestFab = mode === 'browse' && !browseSpaceId && !browseProposal;

  const handleSuggestClick = () => {
    setMode('suggest');
    setFlowStep(1);
  };

  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <MapView />
      </main>

      {/* Browse-mode: proposal list → detail card */}
      <ProposalListPanel />
      <ProposalPanel />

      {/* Suggest flow modal */}
      <SuggestFlow />

      {/* Booth attract mode — full-screen idle slideshow */}
      <AttractMode />

      {/* Floating action button — visible only in browse mode */}
      {showSuggestFab && (
        <button className="suggest-fab" onClick={handleSuggestClick}>
          <span className="suggest-fab-icon">✦</span>
          {t('map.suggestBtn')}
        </button>
      )}
    </div>
  );
}
