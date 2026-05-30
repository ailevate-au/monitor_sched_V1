// ── ErrorBoundary ────────────────────────────────────────────────────────────
// Catches render-time errors anywhere in the tree and offers a 'clear & reload'
// escape hatch in case localStorage state is corrupted.

import { Component } from 'react';
import { CANVAS, MUTED, STATUS_TOKENS } from '../theme.jsx';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(e) {
    return { error: e };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ fontFamily:'monospace', padding:'32px', background:CANVAS, color:STATUS_TOKENS.DANGER_TEXT2, minHeight:'100vh' }}>
          <div style={{ fontSize:'18px', fontWeight:'700', marginBottom:'12px' }}>Runtime Error</div>
          <div style={{ fontSize:'13px', marginBottom:'8px', color:STATUS_TOKENS.DANGER_TEXT }}>{String(this.state.error)}</div>
          <pre style={{ fontSize:'11px', color:MUTED, whiteSpace:'pre-wrap' }}>{this.state.error?.stack}</pre>
          <button
            onClick={() => { localStorage.clear(); window.location.reload(); }}
            style={{ marginTop:'20px', padding:'8px 18px', borderRadius:'8px', border:'none', background:STATUS_TOKENS.DANGER, color:'white', cursor:'pointer', fontSize:'13px' }}
          >
            Clear storage &amp; reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}