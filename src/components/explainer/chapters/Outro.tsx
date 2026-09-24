// src/components/explainer/chapters/Outro.tsx
'use client';
import { P, Prose, RailLabel, Row } from '../layout';
import { INK, MUTED, RULE, SANS } from '../tokens';

const SOURCE_URL = 'https://github.com/minjunminji/mywebsite/blob/main/src/components/reveal/shaders.ts';

export default function Outro({ onClose }: { onClose: () => void }) {
  return (
    <Row style={{ marginTop: '6rem', paddingBottom: '1rem' }} rail={<RailLabel>end</RailLabel>}>
      <Prose>
        <P>
          that&apos;s the whole thing: two passes, one texture that remembers, a brush that
          chases, and some noise at the edge. about 150 lines of glsl.
        </P>
        {/* Placeholder for Ryan's own sentence — deliberately visible so it gets noticed and replaced. */}
        <p style={{ margin: '0 0 1.1em', fontStyle: 'italic', color: MUTED }}>
          [ryan: a sentence or two on what you&apos;d try next — leave as a placeholder]
        </p>
        <div style={{ borderTop: `1px solid ${RULE}`, margin: '2rem 0 1.5rem' }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2rem' }}>
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ex-link"
            style={{ fontFamily: SANS, fontSize: '0.82rem', letterSpacing: '0.02em', color: INK }}
          >
            source on github →
          </a>
          <button
            type="button"
            onClick={onClose}
            className="ex-link"
            style={{ fontFamily: SANS, fontSize: '0.82rem', letterSpacing: '0.02em', color: INK }}
          >
            back to the site
          </button>
        </div>
      </Prose>
    </Row>
  );
}
