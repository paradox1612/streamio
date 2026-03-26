import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const features = [
  {
    icon: '🔌',
    title: 'Multiple IPTV Providers',
    desc: 'Connect any number of Xtream Codes providers and manage them all in one place.',
  },
  {
    icon: '🎬',
    title: 'TMDB Metadata Matching',
    desc: 'Your content is automatically matched against TMDB for rich titles, posters, and ratings.',
  },
  {
    icon: '⚡',
    title: 'Auto Host Failover',
    desc: 'If one host goes down, StreamBridge automatically switches to the next healthy one.',
  },
  {
    icon: '🔗',
    title: 'One Addon URL',
    desc: 'Get a single personalised Stremio addon URL that aggregates all your providers.',
  },
];

export default function Landing() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9' }}>
      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', borderBottom: '1px solid #1e293b',
        position: 'sticky', top: 0, background: '#0f172a', zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.4rem' }}>🌉</span>
          <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#818cf8' }}>StreamBridge</span>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link to="/login" style={{
            padding: '8px 18px', borderRadius: '8px',
            background: 'transparent', color: '#94a3b8',
            border: '1px solid #334155', textDecoration: 'none',
            fontSize: '0.9rem', fontWeight: 500,
          }}>
            Sign In
          </Link>
          <Link to="/signup" style={{
            padding: '8px 18px', borderRadius: '8px',
            background: '#4f46e5', color: '#fff',
            border: 'none', textDecoration: 'none',
            fontSize: '0.9rem', fontWeight: 600,
          }}>
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: '80px 24px 60px', textAlign: 'center', maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '16px' }}>🌉</div>
        <h1 style={{
          fontSize: 'clamp(2rem, 6vw, 3.2rem)', fontWeight: 800,
          lineHeight: 1.15, marginBottom: '20px',
          background: 'linear-gradient(135deg, #818cf8, #c084fc)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          Your IPTV, beautifully<br />inside Stremio
        </h1>
        <p style={{ fontSize: 'clamp(1rem, 3vw, 1.15rem)', color: '#94a3b8', lineHeight: 1.7, marginBottom: '36px' }}>
          StreamBridge turns your Xtream Codes IPTV subscriptions into a personalised
          Stremio addon — with metadata, auto-failover, and a single URL.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/signup" style={{
            padding: '14px 32px', borderRadius: '10px',
            background: '#4f46e5', color: '#fff',
            textDecoration: 'none', fontSize: '1rem', fontWeight: 700,
            boxShadow: '0 0 32px rgba(79,70,229,0.35)',
          }}>
            Create Free Account
          </Link>
          <Link to="/login" style={{
            padding: '14px 28px', borderRadius: '10px',
            background: '#1e293b', color: '#94a3b8',
            border: '1px solid #334155', textDecoration: 'none',
            fontSize: '1rem', fontWeight: 500,
          }}>
            Sign In
          </Link>
        </div>
      </section>

      {/* Addon URL demo */}
      <section style={{ maxWidth: '640px', margin: '0 auto 72px', padding: '0 24px' }}>
        <div style={{
          background: '#1e293b', borderRadius: '12px', padding: '20px 24px',
          border: '1px solid #334155',
        }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Your personalised addon URL
          </div>
          <div style={{
            background: '#0f172a', borderRadius: '8px', padding: '11px 16px',
            color: '#818cf8', fontSize: 'clamp(0.7rem, 2vw, 0.85rem)',
            fontFamily: 'monospace', wordBreak: 'break-all', border: '1px solid #334155',
          }}>
            https://yourdomain.com/addon/<span style={{ color: '#c084fc' }}>your-token</span>/manifest.json
          </div>
          <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '10px' }}>
            One URL. All your providers. Works on any device with Stremio.
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: '900px', margin: '0 auto 80px', padding: '0 24px' }}>
        <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.3rem, 4vw, 1.7rem)', fontWeight: 700, color: '#f1f5f9', marginBottom: '40px' }}>
          Everything you need
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}>
          {features.map(f => (
            <div key={f.title} style={{
              background: '#1e293b', borderRadius: '12px',
              padding: '24px 20px', border: '1px solid #334155',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>{f.icon}</div>
              <div style={{ fontWeight: 600, color: '#f1f5f9', marginBottom: '8px', fontSize: '0.95rem' }}>{f.title}</div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ textAlign: 'center', padding: '0 24px 80px' }}>
        <div style={{
          maxWidth: '500px', margin: '0 auto',
          background: '#1e293b', borderRadius: '16px',
          padding: '40px 32px', border: '1px solid #334155',
        }}>
          <h2 style={{ fontSize: 'clamp(1.2rem, 4vw, 1.5rem)', fontWeight: 700, color: '#f1f5f9', marginBottom: '12px' }}>
            Ready to get started?
          </h2>
          <p style={{ color: '#64748b', marginBottom: '28px', fontSize: '0.95rem' }}>
            Create your account and have your addon URL in under a minute.
          </p>
          <Link to="/signup" style={{
            display: 'inline-block', padding: '13px 32px', borderRadius: '10px',
            background: '#4f46e5', color: '#fff', textDecoration: 'none',
            fontWeight: 700, fontSize: '1rem',
          }}>
            Create Account — Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        textAlign: 'center', padding: '24px',
        borderTop: '1px solid #1e293b', color: '#334155', fontSize: '0.8rem',
      }}>
        StreamBridge · Personalised Stremio addons for IPTV
      </footer>
    </div>
  );
}
