import './styles/globals.css';
import './index.css';
import { MapView } from './components/map/MapView';
import { ProposalPanel } from './components/proposal/ProposalPanel';
import { Header } from './components/ui/Header';
import { VoiceOverlay } from './components/voice/VoiceOverlay';

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <MapView />
      </main>
      <ProposalPanel />

      {/* Voice-first exhibition interaction layer */}
      <VoiceOverlay />
    </div>
  );
}
