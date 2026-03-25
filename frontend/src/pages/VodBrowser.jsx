import React, { useState, useEffect, useCallback } from 'react';
import { providerAPI } from '../utils/api';
import toast from 'react-hot-toast';

const TMDB_IMG = 'https://image.tmdb.org/t/p/w185';

function VodCard({ item }) {
  const matched = item.tmdb_id != null;
  const poster = item.poster_url;
  const score = item.confidence_score ? Math.round(item.confidence_score * 100) : null;

  return (
    <div style={{ background: '#1e293b', borderRadius: '10px', overflow: 'hidden', border: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', paddingTop: '150%', background: '#0f172a' }}>
        {poster ? (
          <img src={poster} alt={item.raw_title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', fontSize: '2rem' }}>🎬</div>
        )}
        {/* Match badge */}
        <div style={{ position: 'absolute', top: '6px', right: '6px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '6px', background: matched ? '#14532d' : '#1e293b', color: matched ? '#86efac' : '#64748b', border: '1px solid rgba(255,255,255,0.1)' }}>
          {matched ? `✓ ${score}%` : 'Unmatched'}
        </div>
        {/* Type badge */}
        <div style={{ position: 'absolute', top: '6px', left: '6px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '6px', background: '#1e293b', color: '#94a3b8', border: '1px solid #334155' }}>
          {item.vod_type}
        </div>
      </div>
      <div style={{ padding: '10px' }}>
        <div style={{ fontSize: '0.8rem', color: '#f1f5f9', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.raw_title}>
          {item.raw_title}
        </div>
        {item.category && (
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.category}</div>
        )}
      </div>
    </div>
  );
}

export default function VodBrowser() {
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [filter, setFilter] = useState({ type: '', matched: '', search: '', page: 1 });

  useEffect(() => {
    providerAPI.list()
      .then(res => {
        setProviders(res.data);
        if (res.data.length > 0) setSelectedProvider(res.data[0].id);
      })
      .finally(() => setLoadingProviders(false));
  }, []);

  const loadVod = useCallback(async () => {
    if (!selectedProvider) return;
    setLoading(true);
    try {
      const params = { page: filter.page, limit: 60 };
      if (filter.type) params.type = filter.type;
      if (filter.search) params.search = filter.search;
      if (filter.matched !== '') params.matched = filter.matched;
      const res = await providerAPI.getVod(selectedProvider, params);
      setItems(filter.page === 1 ? res.data : prev => [...prev, ...res.data]);
    } catch (_) {
      toast.error('Failed to load VOD catalog');
    } finally {
      setLoading(false);
    }
  }, [selectedProvider, filter]);

  useEffect(() => {
    if (selectedProvider) {
      setItems([]);
      setFilter(f => ({ ...f, page: 1 }));
    }
  }, [selectedProvider]);

  useEffect(() => {
    if (filter.page === 1) loadVod();
  }, [filter.page, selectedProvider, filter.type, filter.matched, filter.search]);

  const handleFilterChange = (key, value) => {
    setItems([]);
    setFilter(f => ({ ...f, [key]: value, page: 1 }));
  };

  if (loadingProviders) return <div style={{ color: '#64748b', padding: '40px' }}>Loading...</div>;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '20px' }}>VOD Browser</h1>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', fontSize: '0.85rem' }}>
          {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filter.type} onChange={e => handleFilterChange('type', e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', fontSize: '0.85rem' }}>
          <option value="">All Types</option>
          <option value="movie">Movies</option>
          <option value="series">Series</option>
        </select>
        <select value={filter.matched} onChange={e => handleFilterChange('matched', e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', fontSize: '0.85rem' }}>
          <option value="">All</option>
          <option value="true">Matched</option>
          <option value="false">Unmatched</option>
        </select>
        <input
          placeholder="Search titles..."
          value={filter.search}
          onChange={e => handleFilterChange('search', e.target.value)}
          style={{ flex: 1, minWidth: '200px', padding: '8px 12px', borderRadius: '8px', background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9', fontSize: '0.85rem', outline: 'none' }}
        />
      </div>

      {items.length === 0 && !loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🎬</div>
          <div>No titles found. Try refreshing the catalog from Providers.</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {items.map(item => <VodCard key={item.id} item={item} />)}
          </div>
          {!loading && items.length >= 60 && (
            <div style={{ textAlign: 'center' }}>
              <button onClick={() => setFilter(f => ({ ...f, page: f.page + 1 }))}
                style={{ padding: '10px 24px', borderRadius: '8px', background: '#334155', color: '#f1f5f9', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                Load More
              </button>
            </div>
          )}
          {loading && <div style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>Loading...</div>}
        </>
      )}
    </div>
  );
}
