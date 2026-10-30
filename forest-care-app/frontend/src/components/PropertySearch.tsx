import { useState } from 'react';
import type { CadastreFeature } from '../types';

interface PropertySearchProps {
  onSearch: (propertyCode: string) => Promise<CadastreFeature | null>;
  onSelectResult: (result: CadastreFeature) => void;
  isSearching: boolean;
}

export default function PropertySearch({ onSearch, onSelectResult, isSearching }: PropertySearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [propertyCodeInput, setPropertyCodeInput] = useState('');
  const [searchResult, setSearchResult] = useState<CadastreFeature | null>(null);
  const [searchStatus, setSearchStatus] = useState('');

  const handleSearch = async () => {
    if (!propertyCodeInput.trim()) {
      setSearchStatus('Syötä kiinteistötunnus');
      return;
    }

    setSearchStatus('Haetaan...');
    setIsOpen(true);
    try {
      const result = await onSearch(propertyCodeInput);
      if (result) {
        setSearchResult(result);
        setSearchStatus('Kiinteistö löytyi');
      } else {
        setSearchStatus('Kiinteistöä ei löytynyt');
        setSearchResult(null);
      }
    } catch {
      setSearchStatus('Haku epäonnistui');
      setSearchResult(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className={`search-panel ${isOpen ? 'open' : ''}`}>
      <button
        className="sidebar-section-header"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
      >
        <h3>🔍 Hae kiinteistö</h3>
        <span className={`sidebar-chevron ${isOpen ? 'open' : ''}`} aria-hidden="true">⌄</span>
      </button>
      {isOpen && (
        <div className="search-panel-content">
          <div className="search-row">
            <input
              type="text"
              className="property-search-input"
              placeholder="Esim. 145-410-20-11"
              value={propertyCodeInput}
              onChange={(e) => setPropertyCodeInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSearching}
            />
            <button className="btn btn-primary search-button" onClick={handleSearch} disabled={isSearching}>
              Hae
            </button>
          </div>
          {searchStatus && <small style={{ marginTop: '0.4rem', color: '#6b7280' }}>{searchStatus}</small>}
          {searchResult && (
            <div className="search-result-card">
              <strong>{searchResult.properties.name}</strong>
              <small>Tunnus: {searchResult.properties.propertyCode}</small>
              {searchResult.properties.areaHa && (
                <small>Pinta-ala: {searchResult.properties.areaHa.toFixed(2)} ha</small>
              )}
              <button
                className="btn btn-primary save-cadastre-btn"
                onClick={() => onSelectResult(searchResult)}
                style={{ marginTop: '0.5rem' }}
              >
                Tallenna omiin kiinteistöihin
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
