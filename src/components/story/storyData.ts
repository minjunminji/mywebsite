// Pure data model for the nav-driven story. No React here.
// Content + asset paths are consumed by StoryPlayer.

import type { RebaseState } from './rebaseScene';

// --- Frame asset lists (webp) ---
export const landingFrames = [
  '/Animation/landingloop1.webp',
  '/Animation/landingloop2.webp',
  '/Animation/landingloop3.webp',
  '/Animation/landingloop4.webp',
] as const;

export const trainSequenceFrames = Array.from(
  { length: 20 },
  (_, i) => `/Animation/train${i + 1}.webp`,
);

export const trainLoopFrames = [
  '/Animation/trainloop1.webp',
  '/Animation/trainloop2.webp',
  '/Animation/trainloop3.webp',
  '/Animation/trainloop4.webp',
] as const;

export const aboutFrames = [
  '/Animation/aboutloop1.webp',
  '/Animation/aboutloop2.webp',
  '/Animation/aboutloop3.webp',
  '/Animation/aboutloop4.webp',
] as const;

export const trans1Frames = Array.from({ length: 25 }, (_, i) => `/Animation/1trans${i + 1}.webp`);
export const trans2Frames = Array.from({ length: 22 }, (_, i) => `/Animation/2trans${i + 1}.webp`);
export const turnstileFrames = Array.from({ length: 6 }, (_, i) => `/Animation/turnstile${i + 1}.webp`);
export const turnstileBackgroundFrame = '/turnstile_background.webp';
export const turnstileBackgroundFrameTwo = '/turnstile_background_2.png';

export const projectStills = {
  thisWebsite: '/Animation/thiswebsite.webp',
  rebase: '/Animation/rebase.webp',
  mango: '/Animation/mango.webp',
} as const;

export const ABOUT_REFERENCE_IMAGE = '/about_ref.webp';

// --- Stops: the flat, ordered player timeline ---
export type StopId = 'landing' | 'about' | 'thisWebsite' | 'rebase' | 'mango' | 'experience';

export type Stop = {
  id: StopId;
  loop?: readonly string[]; // animated rest frames (landing, about)
  still?: string; // static rest frame (projects)
  isProject?: boolean;
  isExperience?: boolean;
};

export const STOPS: readonly Stop[] = [
  { id: 'landing', loop: trainLoopFrames },
  { id: 'about', loop: aboutFrames },
  { id: 'thisWebsite', still: projectStills.thisWebsite, isProject: true },
  { id: 'rebase', still: projectStills.rebase, isProject: true },
  { id: 'mango', still: projectStills.mango, isProject: true },
  { id: 'experience', isExperience: true },
];

// SEGMENTS[i] connects STOPS[i] -> STOPS[i+1]
export const SEGMENTS: readonly (readonly string[])[] = [
  trans1Frames, // landing -> about
  trans2Frames, // about -> thisWebsite
  turnstileFrames, // thisWebsite -> rebase
  turnstileFrames, // rebase -> mango
  [], // mango -> experience (generated morph, not frames)
];

export const stopIndexById = (id: StopId): number => STOPS.findIndex((s) => s.id === id);
export const firstProjectIndex = STOPS.findIndex((s) => s.isProject);
export const isProjectStop = (index: number): boolean => STOPS[index]?.isProject === true;
export const isExperienceStop = (index: number): boolean =>
  STOPS[index]?.isExperience === true;

// --- Nav: the name (home/landing) + about + projects (expands into its 3 children) ---
export type NavChild = { stopId: StopId; label: string };
export type NavEntry = { label: string; stopId: StopId; children?: readonly NavChild[] };

export const NAV: readonly NavEntry[] = [
  { label: 'ryan kim', stopId: 'landing' },
  { label: 'about', stopId: 'about' },
  {
    label: 'projects',
    stopId: 'thisWebsite',
    children: [
      { stopId: 'thisWebsite', label: 'this website' },
      { stopId: 'rebase', label: 'rebase' },
      { stopId: 'mango', label: 'mango' },
    ],
  },
  { label: 'experience', stopId: 'experience' },
];

// --- About text + timing (consumed by StoryPlayer) ---

/** The hobbies line, split around the word that summons the piano player.
 *  Kept as parts so the trigger can be its own element without the renderer
 *  string-searching the copy. */
export const ABOUT_PIANO_LINE = {
  before: 'in my spare time, i like to play ',
  trigger: 'piano',
  after: ', cook, and play soccer',
} as const;

/** Which ABOUT_LINES entry carries the trigger. */
export const ABOUT_PIANO_LINE_INDEX = 2;

export const ABOUT_LINES = [
  "hi, i'm ryan 👋",
  "i'm a junior computer engineering student at the university of british columbia, and i love building things that make me or other people happy",
  `${ABOUT_PIANO_LINE.before}${ABOUT_PIANO_LINE.trigger}${ABOUT_PIANO_LINE.after}`,
] as const;

// About reveal: three fade groups (intro, body, hint). Each fades over
// ABOUT_FADE_DURATION_MS, then waits ABOUT_GROUP_GAP_MS before the next begins.
export const ABOUT_INITIAL_DELAY_MS = 200;
export const ABOUT_FADE_DURATION_MS = 600;
export const ABOUT_GROUP_GAP_MS = 800;

// --- Project content ---
// A project reads as one continuous block of text, lit one chunk at a time as
// it scrolls past the reading spot (see ProjectReader). A chunk is usually one
// sentence, sometimes two short ones; the copy declares the breaks, the
// renderer never splits text itself.

// A run of text in a chunk; `action` makes it an in-page trigger.
export type ProjectBodySegment = { text: string; action?: 'shaderExplainer' };

/** Live, interactive components that can stand in for an image or video. */
export type ProjectComponentId = 'sceneFrames' | 'rebaseBlobs';

/** Media a chunk brings onto the left of the screen while it's lit. Width and
 *  height are the intrinsic size, used for the frame's aspect ratio before the
 *  media loads. */
export type ProjectMedia =
  | { kind: 'image'; src: string; alt: string; width: number; height: number }
  | { kind: 'video'; src: string; title: string; posterSrc?: string; width: number; height: number }
  | {
      kind: 'component';
      id: ProjectComponentId;
      label: string;
      width: number;
      height: number;
      /** Which moment the component should show. Changing it morphs the
       *  component in place; it doesn't count as new media. */
      state?: string;
    };

export type ProjectChunk = {
  /** Plain text, or runs when part of it is interactive. */
  text: string | readonly ProjectBodySegment[];
  /** Media to bring on while this chunk is lit. Left out, the media before it
   *  stays up; `null` clears it from here on. */
  media?: ProjectMedia | null;
};

export type ProjectContent = {
  key: 'thisWebsite' | 'rebase' | 'mango';
  title: string;
  techStack: readonly string[];
  chunks: readonly ProjectChunk[];
  linkHref?: string;
};

/** A chunk's text as plain runs. */
export function chunkSegments(chunk: ProjectChunk): readonly ProjectBodySegment[] {
  return typeof chunk.text === 'string' ? [{ text: chunk.text }] : chunk.text;
}

const SCREENSHOT = { width: 1920, height: 1038 } as const;

/** The rebase diagram at one of its moments (see rebaseScene.ts). */
const rebaseScene = (state: RebaseState): ProjectMedia => ({
  kind: 'component',
  id: 'rebaseBlobs',
  state,
  label: 'Diagram of rebase: resume files become reusable experience blobs, tailored into a resume',
  width: 16,
  height: 10,
});

export const PROJECT_CONTENT: readonly ProjectContent[] = [
  {
    key: 'thisWebsite',
    title: 'this website',
    techStack: ['Next.js', 'React', 'TypeScript', 'WebGL2'],
    chunks: [
      { text: 'remember painting over my drawing on the about page?' },
      {
        text: [
          { text: "that's a custom webgl2 shader i wrote. " },
          { text: "here's how it works →", action: 'shaderExplainer' },
        ],
      },
      {
        text: 'my old portfolio was a hand-drawn interactive view of my own desk, but it felt static.',
        media: { kind: 'image', src: '/oldwebsite.webp', alt: 'My old portfolio website', ...SCREENSHOT },
      },
      {
        text: 'so i rebuilt it as an animated hand-drawn world you navigate, where each section is its own scene.',
        media: {
          kind: 'video',
          src: '/animationtimelapse.mp4',
          title: 'Timelapse of drawing the scenes',
          posterSrc: '/oldwebsite.webp',
          width: 1280,
          height: 720,
        },
      },
      {
        text: 'i challenged myself to learn animation and built a custom frame-by-frame scene system in next.js + react.',
        media: { kind: 'component', id: 'sceneFrames', label: 'The landing scene, frame by frame', width: 16, height: 10 },
      },
      {
        text: 'clicking through the nav plays the hand-drawn sequences forward or backward to move you from one place to the next.',
      },
      { text: 'this project is where my love for illustration, design, and frontend engineering all meet.', media: null },
    ],
  },
  {
    key: 'rebase',
    title: 'rebase',
    techStack: ['React.js', 'Next.js', 'Supabase', 'Typst', 'Inngest', 'Redis'],
    linkHref: 'https://www.tryrebase.io/',
    chunks: [
      { text: 'rebase is a resume builder that treats your career like a database, not a document.' },
      {
        text: 'most people keep a folder of near-identical resumes, one for every job they apply to.',
        media: rebaseScene('files'),
      },
      {
        text: 'i designed rebase around one idea: every experience should live exactly once.',
        media: rebaseScene('blobs'),
      },
      {
        text: 'each experience is a "blob": everything you did in that role, written as loosely as you want.',
        media: rebaseScene('baseContent'),
      },
      {
        text: 'polished phrasings sit on top as "bullet versions" you can reuse on any resume.',
        media: rebaseScene('versions'),
      },
      { text: 'a resume, then, is just a view: a few blobs picked for one job.', media: rebaseScene('view') },
      {
        text: 'paste a job description, and the model of your choice picks your most relevant blobs.',
        media: rebaseScene('tailor'),
      },
      {
        text: "then it writes fresh bullets from the full base content, not last time's wording.",
        media: rebaseScene('bullets'),
      },
      { text: "but bullets are only as good as what's behind them.", media: rebaseScene('vague') },
      {
        text: '"refine" spots vague blobs and asks you pointed questions about them.',
        media: rebaseScene('refine'),
      },
      {
        text: 'your answers turn into specifics, which cut down hallucination a lot.',
        media: rebaseScene('refined'),
      },
      {
        text: '"quick add" lets you log a win the moment it happens, before you forget it.',
        media: rebaseScene('quickAdd'),
      },
      {
        text: 'everything renders through a custom typst engine, compiled in the browser with webassembly.',
        media: rebaseScene('typst'),
      },
      {
        text: 'so the live preview is exactly the pdf you download.',
        media: { kind: 'image', src: '/rebase3.webp', alt: 'Rebase editor with live resume preview', ...SCREENSHOT },
      },
      { text: "it's in private beta now, with 20+ users building their resumes on it.", media: null },
    ],
  },
  {
    key: 'mango',
    title: 'mango',
    techStack: ['Python', 'PyAutoGUI', 'OpenCV', 'MediaPipe'],
    linkHref: 'https://devpost.com/software/mango-full-body-gesture-control-for-any-game',
    chunks: [
      {
        text: 'mango turns any webcam into a full-body game controller.',
        media: {
          kind: 'video',
          src: '/mango.mp4',
          title: 'Mango full-body gesture control demo',
          posterSrc: '/mango-poster.jpg',
          width: 1150,
          height: 720,
        },
      },
      { text: 'you play minecraft with your whole body, no vr headset or external sensors needed.' },
      { text: 'mediapipe tracks your body from the camera in real time.' },
      { text: 'each movement maps straight to a keyboard or mouse input, so it works with any game.' },
      { text: 'we built it in 12 hours with opencv, mediapipe, and python.' },
      {
        text: 'it won 1st place at hellohacks 2025.',
        media: {
          kind: 'image',
          src: '/mango-hellohacks.webp',
          alt: 'The mango team holding first place certificates at HelloHacks 2025',
          width: 1280,
          height: 853,
        },
      },
    ],
  },
];

// --- Experience content (text-only stop) ---
export type ExperienceEntry = {
  key: 'superpilot' | 'shopify' | 'sailbot' | 'paladin';
  year: string; // anchor + ripple origin
  company: string;
  title: string;
  bullets: readonly string[];
};

export const EXPERIENCE: readonly ExperienceEntry[] = [
  {
    key: 'superpilot',
    year: '2026-present',
    company: 'superpilot',
    title: 'software engineering intern',
    bullets: [
      'prototyped an AI agent that researches brands, builds landing pages, and reviews its own work across desktop and mobile',
      'cut generation costs by 55% and roughly halved runtime through prompt optimization, caching, and model selection',
      "evaluated the prototype against the existing generator to help shape the team's approach to page generation",
    ],
  },
  {
    key: 'shopify',
    year: '2026',
    company: 'shopify',
    title: 'software engineering intern',
    bullets: [
      'shipped mobile experiences that let merchants turn a description of their business into an AI-generated storefront',
      'built custom Skia animations for iOS and Android, working with designers to refine motion, accessibility, and loading states',
      'made the generation flow more reliable, fixing stale results, stuck progress, and an intermittent graphics crash',
    ],
  },
  {
    key: 'sailbot',
    year: '2025-2026',
    company: 'ubc sailbot',
    title: 'website team lead',
    bullets: [
      'lead seven developers and designers, translating team needs into scoped projects and coordinating implementation',
      'identified a gap in recruiting and built a portal prototype with shared applications and team-specific review boards',
      'built a ship-tracking pipeline for roughly 200 vessels, avoiding the need for a $25k/year external service',
    ],
  },
  {
    key: 'paladin',
    year: '2025',
    company: 'paladin technologies',
    title: 'systems engineering intern',
    bullets: [
      'automated an eight-hour geospatial workflow in Python, bringing processing time down to under 30 seconds',
      'developed a standardized mapping format adopted across 250+ City of Vancouver surveillance deployment sites',
    ],
  },
];

export type SocialLink = {
  key: 'linkedin' | 'github';
  /** Accessible name for the icon link. */
  label: string;
  href: string;
  /** Icon asset under /public. */
  icon: string;
};

export const SOCIAL_LINKS: readonly SocialLink[] = [
  {
    key: 'linkedin',
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/ryankim373/',
    icon: '/linkedin.png',
  },
  {
    key: 'github',
    label: 'GitHub',
    href: 'https://github.com/minjunminji/',
    icon: '/github.png',
  },
];

// ===== TLDR takeover =====
// A run of text in a bullet; `href` (when present) makes that run an inline link.
export type TldrSegment = { text: string; href?: string };

export type TldrFooterLink = {
  key: 'github' | 'linkedin' | 'email';
  /** Accessible name for the icon link. */
  label: string;
  href: string;
  /** Icon asset under /public; omitted for email, which renders an inline SVG. */
  icon?: string;
};

export const TLDR_NAME = 'ryan kim';

// First-person rundown, akylai.xyz-style. Each bullet is a list of segments so
// inline links (the chopin concerto) live in data, not hardcoded JSX. The
// favorite-artists line is static for now; when a Spotify top-artists feed lands
// it swaps to "on repeat this month: …" — see 2026-07-21-tldr-takeover-design.md.
export const TLDR_BULLETS: readonly (readonly TldrSegment[])[] = [
  [{ text: 'vancouver, canada' }],
  [{ text: 'SWE intern at Superpilot' }],
  [
    {
      text:
        'computer engineering at ubc (c.o. 2028) and ubc presidential scholar',
    },
  ],
  [
    {
      text:
        'prev. SWE intern at shopify, doing mobile development for the merchant admin app',
    },
  ],
  [
    {
      text:
        'leading a team of 7 at ubc sailbot, currently building an internal hiring portal',
    },
  ],
  [
    { text: 'built ' },
    { text: 'rebase', href: 'https://www.tryrebase.io/' },
    {
      text:
        ', an AI-native career dashboard',
    },
  ],
  [
    {
      text:
        'i like building things that live between engineering and design',
    },
  ],
  [{ text: 'valorant peak immortal #4000' }],
  [
    { text: "i play piano; my favorite composer is chopin. here's me " },
    {
      text: 'performing his first piano concerto',
      href: 'https://youtu.be/QSbZHTvbjR4',
    },
    { text: ' with the VAMSO orchestra' },
  ],
  [{ text: 'some of my favorite artists are fujii kaze, wave to earth, and exo' }],
];

export type MobileTldrSection = {
  label: 'about' | 'now' | 'selected work' | 'previously' | 'outside work';
  body: readonly TldrSegment[];
};

// Mobile is the whole portfolio, so its copy is grouped for scanning rather
// than mirroring the desktop overlay's quick list.
export const MOBILE_TLDR_SECTIONS: readonly MobileTldrSection[] = [
  {
    label: 'about',
    body: [
      {
        text: 'computer engineering student at ubc building things that live between engineering and design',
      },
    ],
  },
  {
    label: 'now',
    body: [
      {
        text: 'SWE intern at Superpilot',
      },
    ],
  },
  {
    label: 'previously',
    body: [
      {
        text: 'SWE intern at shopify, worked on mobile development for the merchant admin app',
      },
    ],
  },
  {
    label: 'selected work',
    body: [
      { text: 'built ' },
      { text: 'rebase', href: 'https://www.tryrebase.io/' },
      { text: ', an AI-native career dashboard, and ' },
      {
        text: 'mango',
        href: 'https://devpost.com/software/mango-full-body-gesture-control-for-any-game',
      },
      {
        text:
          ', a full-body game controller that won 1st place at hellohacks 2025. ' +
          'this website is another project: a hand-drawn world powered by a ' +
          'custom frame-by-frame scene system.',
      },
    ],
  },
  {
    label: 'outside work',
    body: [
      { text: 'i play piano; my favorite composer is chopin. here\'s me ' },
      {
        text: 'performing his first piano concerto',
        href: 'https://youtu.be/QSbZHTvbjR4',
      },
      {
        text:
          ' with the VAMSO orchestra. i also play valorant (peak immortal #4000) ' +
          'and listen to fujii kaze, wave to earth, and exo.',
      },
    ],
  },
];

export const TLDR_FOOTER_LINKS: readonly TldrFooterLink[] = [
  { key: 'github', label: 'github', href: 'https://github.com/minjunminji/', icon: '/github.png' },
  {
    key: 'linkedin',
    label: 'linkedin',
    href: 'https://www.linkedin.com/in/ryankim373/',
    icon: '/linkedin.png',
  },
  { key: 'email', label: 'email', href: 'mailto:ryankim373@gmail.com' },
];
