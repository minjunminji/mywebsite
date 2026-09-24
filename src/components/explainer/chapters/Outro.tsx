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
          put together, the effect is a small rendering loop with a few carefully chosen details:
          a texture that remembers, a brush that follows the cursor, curves that connect each
          frame, and noise that turns a digital boundary into ink.
        </P>
        <P>
          the shaders themselves are only about 150 lines. most of the work was not making the
          effect possible, moreso the small decisions that made it feel natural.
        </P>
        <p style={{ margin: '0 0 1.1em', fontStyle: 'italic', color: MUTED }}>
          i&apos;d still like to explore how the reveal could react to pressure, acceleration, or
          the texture of different kinds of paper.
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
